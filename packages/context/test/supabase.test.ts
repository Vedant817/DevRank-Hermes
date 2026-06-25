import assert from "node:assert/strict";
import test from "node:test";
import { filterByContainerTags } from "../src/supabase.js";

const rows = [{
  id: "legacy",
  source: "github",
  summary: "Legacy single-user evidence",
  title: "Legacy",
}, {
  id: "scoped",
  metadata: {
    containerTags: ["user:vedant", "project:devrank"],
  },
  source: "manual",
  summary: "Scoped context",
  title: "Scoped",
}];

test("owner-level context includes legacy rows but project scopes remain explicit", () => {
  assert.deepEqual(
    filterByContainerTags(rows, ["user:vedant"]).map((row) => row.id),
    ["legacy", "scoped"],
  );
  assert.deepEqual(
    filterByContainerTags(rows, ["user:vedant", "project:devrank"]).map((row) => row.id),
    ["scoped"],
  );
});
