import { ConfigurationError } from "./errors.js";
import { isPlaceholderSecret, readRuntimeEnv, type RuntimeEnv } from "./env.js";

const OWNER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export interface SingleUserOwner {
  containerTag: string;
  id: string;
}

export function resolveSingleUserOwner(
  env: RuntimeEnv = readRuntimeEnv(),
): SingleUserOwner {
  const ownerId = env.DEVRANK_OWNER_ID?.trim();

  if (!ownerId) {
    throw new ConfigurationError(
      "Single-user ownership is not configured. Set DEVRANK_OWNER_ID.",
    );
  }

  if (isPlaceholderSecret(ownerId)) {
    throw new ConfigurationError(
      "DEVRANK_OWNER_ID must not contain a placeholder value.",
    );
  }

  if (!OWNER_ID_PATTERN.test(ownerId)) {
    throw new ConfigurationError(
      "DEVRANK_OWNER_ID must contain 1-64 letters, numbers, underscores, or hyphens.",
    );
  }

  return {
    containerTag: `user:${ownerId}`,
    id: ownerId,
  };
}

export function scopeContainerTagsForOwner(
  containerTags: string[] | undefined,
  env: RuntimeEnv = readRuntimeEnv(),
) {
  const owner = resolveSingleUserOwner(env);
  const tags = [...new Set(containerTags ?? [])];
  const mismatched = tags.find(
    (tag) => tag.startsWith("user:") && tag !== owner.containerTag,
  );

  if (mismatched) {
    throw new ConfigurationError(
      `Context scope ${mismatched} does not match the configured single-user owner.`,
    );
  }

  return [...new Set([...tags, owner.containerTag])];
}
