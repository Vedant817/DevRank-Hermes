import {
  closeSqlClient,
  createSqlClient,
  getCareerContentDashboard,
  type CareerContentDashboard,
  type CareerContentDraft,
  type ContentDraftType,
} from "@repo/db";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

const draftSections: Array<{
  heading: string;
  id: string;
  type: ContentDraftType;
}> = [
  { heading: "Resume bullets", id: "resume-heading", type: "resume_bullet" },
  { heading: "LinkedIn post ideas", id: "linkedin-heading", type: "linkedin_post" },
  { heading: "X/Twitter build-in-public posts", id: "x-heading", type: "x_post" },
  { heading: "Portfolio project descriptions", id: "portfolio-heading", type: "portfolio_description" },
  { heading: "Interview talking points", id: "interview-heading", type: "interview_talking_point" },
  { heading: "Weekly progress summary", id: "weekly-heading", type: "weekly_progress_summary" },
];

type DashboardState =
  | { dashboard: CareerContentDashboard; status: "ready" }
  | { message: string; status: "unavailable" };

export default async function CareerContentDashboardPage() {
  const state = await loadDashboardState();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Dashboard F</p>
          <h1>Career/Content Dashboard</h1>
        </div>
        <div className={styles.summary}>
          <span>Evidence-backed career output</span>
          <strong>{state.status === "ready" ? "Live content graph" : "Setup required"}</strong>
        </div>
      </header>

      {state.status === "unavailable" ? (
        <main className={styles.main}>
          <section className={styles.panel} aria-labelledby="unavailable-heading">
            <div className={styles.sectionHeader}>
              <p className={styles.kicker}>Dashboard status</p>
              <h2 id="unavailable-heading">Database unavailable</h2>
            </div>
            <p className={styles.emptyState}>{state.message}</p>
          </section>
        </main>
      ) : (
        <Dashboard dashboard={state.dashboard} />
      )}
    </div>
  );
}

async function loadDashboardState(): Promise<DashboardState> {
  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    return {
      dashboard: await getCareerContentDashboard(sql),
      status: "ready",
    };
  } catch {
    return {
      message: "Database access failed. Verify Postgres is reachable and the content drafts migration has been applied.",
      status: "unavailable",
    };
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}

function Dashboard({ dashboard }: { dashboard: CareerContentDashboard }) {
  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="coverage-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Evidence coverage</p>
          <h2 id="coverage-heading">{dashboard.coverage.evidenceCount} evidence signal(s)</h2>
        </div>
        <div className={styles.sourceList}>
          <div className={styles.sourceRow}>
            <div>
              <strong>Resume readiness</strong>
              <span>
                {dashboard.coverage.resumeReady
                  ? "Enough evidence age for resume bullets."
                  : "Resume bullets unlock after 4 weeks of real evidence."}
              </span>
            </div>
            <small>{dashboard.coverage.evidenceWindowDays} day(s)</small>
          </div>
          <div className={styles.sourceRow}>
            <div>
              <strong>Stored drafts</strong>
              <span>Use the protected generation API to persist the current draft set.</span>
            </div>
            <small>{dashboard.totals.storedDrafts}</small>
          </div>
        </div>
      </section>

      {draftSections.map((section) => (
        <DraftPanel
          drafts={dashboard.draftsByType[section.type]}
          heading={section.heading}
          id={section.id}
          key={section.type}
          lockedText={section.type === "resume_bullet" && !dashboard.coverage.resumeReady
            ? "Resume bullets need at least 4 weeks of real usage evidence before generation."
            : undefined}
        />
      ))}
    </main>
  );
}

function DraftPanel({
  drafts,
  heading,
  id,
  lockedText,
}: {
  drafts: CareerContentDraft[];
  heading: string;
  id: string;
  lockedText?: string;
}) {
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.sectionHeader}>
        <p className={styles.kicker}>Generated content</p>
        <h2 id={id}>{heading}</h2>
      </div>
      {drafts.length > 0 ? (
        <div className={styles.sourceList}>
          {drafts.map((draft) => (
            <div className={styles.sourceRow} key={draft.draftKey}>
              <div>
                <strong>{draft.title}</strong>
                <span>{draft.body}</span>
                <p className={styles.rowMeta}>
                  Evidence: {draft.evidence.map((item) => item.title).join(" | ")}
                </p>
              </div>
              <small>{formatDate(draft.generatedAt)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.emptyState}>
          {lockedText ?? "No evidence-backed draft can be generated for this category yet."}
        </p>
      )}
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
