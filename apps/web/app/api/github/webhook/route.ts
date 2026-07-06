import {
  getRequiredEnv,
  jsonError,
  jsonOk,
  methodNotAllowed,
  parseWebhookJson,
  rateLimit,
  readRawBody,
  sanitizeOperationalError,
} from "../../_lib/route-utils";
import {
  claimGithubWebhookDelivery,
  closeSqlClient,
  createSqlClient,
  deleteGithubRepositories,
  deleteGithubPullRequestMetadata,
  insertIngestionRun,
  markGithubWebhookDeliveryFailed,
  markGithubWebhookDeliveryProcessed,
  runInTransaction,
  upsertEvidenceItems,
  upsertGithubBackfill,
  upsertSkillEvidence,
} from "@repo/db";
import {
  createGithubClient,
  deriveGithubPrSkillEvidence,
  fetchGithubPullRequest,
  fetchGithubPullRequestMetadata,
  githubWebhookIngestion,
  isSupportedGithubWebhookEvent,
  verifyGithubWebhook,
} from "@repo/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return methodNotAllowed(["POST"]);
}

export async function POST(request: Request) {
  const limitError = await rateLimit(request, {
    key: "github_webhook",
    limit: 120,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const secret = getRequiredEnv("GITHUB_WEBHOOK_SECRET");

  if (!secret.ok) {
    return secret.response;
  }

  const rawBody = await readRawBody(request, { maxBytes: 1024 * 1024 });

  if (!rawBody.ok) {
    return rawBody.response;
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");

  try {
    await verifyGithubWebhook(rawBody.text, signatureHeader);
  } catch {
    return jsonError(401, "github_signature_invalid", "GitHub signature verification failed.");
  }

  const payload = parseWebhookJson(rawBody.text);

  if (!payload.ok) {
    return payload.response;
  }

  const event = request.headers.get("x-github-event")?.trim();
  const deliveryId = request.headers.get("x-github-delivery")?.trim();
  const action = typeof payload.value.action === "string" ? payload.value.action : undefined;

  if (event === undefined || event.length === 0) {
    return jsonError(400, "github_event_missing", "x-github-event is required.");
  }

  if (event === "ping") {
    return jsonOk({
      received: true,
      event,
      deliveryId,
    });
  }

  if (deliveryId === undefined || deliveryId.length === 0) {
    return jsonError(400, "github_delivery_missing", "x-github-delivery is required.");
  }

  if (!isSupportedGithubWebhookEvent(event, action)) {
    return jsonOk(
      {
        ignored: true,
        reason: "unsupported_github_event",
        action,
        event,
        deliveryId,
      },
      202,
    );
  }

  const ingestion = githubWebhookIngestion(event, deliveryId, payload.value);
  let sql: ReturnType<typeof createSqlClient> | undefined;
  let deliveryClaimed = false;

  try {
    sql = createSqlClient();
    deliveryClaimed = await claimGithubWebhookDelivery(sql, {
      action,
      deliveryId,
      event,
    });

    if (!deliveryClaimed) {
      return jsonOk(
        {
          duplicate: true,
          received: true,
          event,
          deliveryId,
          action,
        },
        202,
      );
    }

    const repo = ingestion.backfill.repos[0];

    if (shouldRefreshPullRequestMetadata(event) && repo) {
      const github = createGithubClient();
      const pullRequests = [...ingestion.backfill.pullRequests];
      const pullRequestNumbers = ingestion.summary.pullRequestNumbers ?? [];

      for (const pullRequestNumber of pullRequestNumbers) {
        const alreadyLoaded = pullRequests.some(
          (item) => item.repoFullName === repo.fullName && item.number === pullRequestNumber,
        );

        if (!alreadyLoaded) {
          pullRequests.push(await fetchGithubPullRequest(github, repo, pullRequestNumber));
        }
      }

      const metadataItems = await Promise.all(
        pullRequests.map(async (pullRequest) => {
          if (!ingestion.backfill.pullRequests.some((item) => item.id === pullRequest.id)) {
            ingestion.backfill.pullRequests.push(pullRequest);
          }

          return fetchGithubPullRequestMetadata(
            github,
            repo,
            pullRequest,
            { ignoreMissing: false },
          );
        }),
      );

      ingestion.backfill.pullRequestChecks = metadataItems.flatMap((metadata) => metadata.checks);
      ingestion.backfill.pullRequestCheckSnapshots = metadataItems.flatMap((metadata) =>
        metadata.checkSnapshot ? [metadata.checkSnapshot] : [],
      );
      ingestion.backfill.pullRequestFiles = metadataItems.flatMap((metadata) => metadata.files);
      ingestion.backfill.pullRequestReviews = metadataItems.flatMap((metadata) => metadata.reviews);
    }

    const persisted = await runInTransaction(sql, async (transaction) => {
      const deletedRepositories = await deleteGithubRepositories(
        transaction,
        ingestion.deletions.repositoryIds,
      );
      const replacedMetadata = await deleteGithubPullRequestMetadata(
        transaction,
        ingestion.backfill.pullRequests.map((item) => item.id),
      );
      const written = await upsertGithubBackfill(transaction, ingestion.backfill);
      const writtenEvidence = await upsertEvidenceItems(transaction, [{
        id: `github:webhook:${event}:${deliveryId}`,
        source: "github",
        title: `GitHub ${event}${action ? ` ${action}` : ""}`,
        summary: [
          `GitHub webhook ${event} was received.`,
          ingestion.summary.repository ? `Repository: ${ingestion.summary.repository}.` : "",
          ingestion.summary.pullRequestNumber ? `Pull request: #${ingestion.summary.pullRequestNumber}.` : "",
          action ? `Action: ${action}.` : "",
        ].filter(Boolean).join(" "),
        occurredAt: new Date().toISOString(),
        metadata: {
          action,
          deliveryId,
          event,
          repository: ingestion.summary.repository,
          pullRequestNumber: ingestion.summary.pullRequestNumber,
        },
      }]);

      const writtenSkillEvidence = await upsertSkillEvidence(
        transaction,
        deriveGithubPrSkillEvidence(ingestion.backfill),
      );

      await markGithubWebhookDeliveryProcessed(transaction, deliveryId);
      await insertIngestionRun(transaction, {
        source: "github_webhook",
        status: "success",
        summary: `Processed GitHub ${event} webhook with ${written.repos} repo(s), ${deletedRepositories} deleted repo(s), ${written.pullRequests} pull request(s), ${written.pullRequestChecks} PR check(s), ${written.pullRequestFiles} PR file(s), ${written.pullRequestReviews} PR review(s), ${written.commits} commit(s), ${written.repoProfiles} repo profile(s), ${writtenEvidence} evidence item(s), and ${writtenSkillEvidence} skill evidence item(s).`,
      });

      return { deletedRepositories, replacedMetadata, written, writtenEvidence, writtenSkillEvidence };
    });

    return jsonOk({
      received: true,
      event,
      deliveryId,
      action,
      summary: ingestion.summary,
      ...persisted,
    });
  } catch (error) {
    if (sql) {
      if (deliveryClaimed) {
        await markGithubWebhookDeliveryFailed(
          sql,
          deliveryId,
          sanitizeOperationalError(error, "github_webhook_ingestion_failed"),
        ).catch(() => undefined);
      }

      await insertIngestionRun(sql, {
        source: "github_webhook",
        status: "failed",
        error: sanitizeOperationalError(error, "github_webhook_ingestion_failed"),
      }).catch(() => undefined);
    }

    return jsonError(503, "github_webhook_ingestion_failed", "GitHub webhook ingestion failed.");
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}

function shouldRefreshPullRequestMetadata(event: string) {
  return event === "check_run"
    || event === "pull_request"
    || event === "pull_request_review"
    || event === "pull_request_review_comment";
}
