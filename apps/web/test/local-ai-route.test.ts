import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateLocalSourcePath } from "../app/api/ingest/local-ai/route";

test("validates existing local ingestion paths against real allowed roots", async () => {
  const previousRoots = process.env.DEVRANK_LOCAL_INGEST_ROOTS;
  const root = await mkdtemp(join(tmpdir(), "devrank-ingest-root-"));
  const file = join(root, "session.jsonl");
  await writeFile(file, "{}");
  process.env.DEVRANK_LOCAL_INGEST_ROOTS = root;

  try {
    const result = await validateLocalSourcePath(file);
    const expectedPath = await realpath(file);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value, expectedPath);
    }
  } finally {
    restoreIngestRoots(previousRoots);
  }
});

test("rejects missing local ingestion paths", async () => {
  const previousRoots = process.env.DEVRANK_LOCAL_INGEST_ROOTS;
  const root = await mkdtemp(join(tmpdir(), "devrank-ingest-root-"));
  process.env.DEVRANK_LOCAL_INGEST_ROOTS = root;

  try {
    const result = await validateLocalSourcePath(join(root, "missing.jsonl"));

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 404);
    }
  } finally {
    restoreIngestRoots(previousRoots);
  }
});

test("rejects symlink paths escaping the configured ingestion root", async () => {
  const previousRoots = process.env.DEVRANK_LOCAL_INGEST_ROOTS;
  const root = await mkdtemp(join(tmpdir(), "devrank-ingest-root-"));
  const outside = await mkdtemp(join(tmpdir(), "devrank-outside-"));
  const outsideFile = join(outside, "secret.jsonl");
  const linkDir = join(root, "linked");
  await mkdir(root, { recursive: true });
  await writeFile(outsideFile, "{}");
  await symlink(outside, linkDir);
  process.env.DEVRANK_LOCAL_INGEST_ROOTS = root;

  try {
    const result = await validateLocalSourcePath(join(linkDir, "secret.jsonl"));

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 403);
    }
  } finally {
    restoreIngestRoots(previousRoots);
  }
});

function restoreIngestRoots(value: string | undefined) {
  if (value === undefined) {
    delete process.env.DEVRANK_LOCAL_INGEST_ROOTS;
    return;
  }

  process.env.DEVRANK_LOCAL_INGEST_ROOTS = value;
}
