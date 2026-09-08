import { createHash } from "node:crypto";

export function evidenceId(date: string, title: string, dsaSlug?: string): string {
  if (dsaSlug) {
    return `dsa:${dsaSlug}:${date}`;
  }

  return createHash("sha256")
    // Preserve the original date|title|slug preimage for existing non-DSA
    // rows; the empty slug intentionally leaves the trailing separator.
    .update(`${date}|${title}|`)
    .digest("hex");
}
