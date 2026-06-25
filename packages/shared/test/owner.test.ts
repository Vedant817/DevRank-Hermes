import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveSingleUserOwner,
  scopeContainerTagsForOwner,
} from "../src/owner.js";

test("resolves and applies the configured single-user owner scope", () => {
  const env = { DEVRANK_OWNER_ID: "vedant" };

  assert.deepEqual(resolveSingleUserOwner(env), {
    containerTag: "user:vedant",
    id: "vedant",
  });
  assert.deepEqual(
    scopeContainerTagsForOwner(["project:devrank"], env),
    ["project:devrank", "user:vedant"],
  );
});

test("rejects missing, invalid, or mismatched owner scopes", () => {
  assert.throws(() => resolveSingleUserOwner({}), /Set DEVRANK_OWNER_ID/);
  assert.throws(
    () => resolveSingleUserOwner({ DEVRANK_OWNER_ID: "invalid owner" }),
    /letters, numbers/,
  );
  assert.throws(
    () => scopeContainerTagsForOwner(
      ["user:other"],
      { DEVRANK_OWNER_ID: "vedant" },
    ),
    /does not match/,
  );
});
