/**
 * Moderators sign in with a personal token. MODERATOR_TOKENS lists them as "name:token" pairs,
 * comma-separated, e.g. "amina:3f9c…,youssef:a71b…". Generate tokens with `openssl rand -hex 24`.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const MODERATOR_COOKIE = "wb_moderator";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function parseModerators(raw = process.env.MODERATOR_TOKENS ?? ""): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const pair of raw.split(",")) {
    const i = pair.indexOf(":");
    const name = pair.slice(0, i).trim();
    const token = pair.slice(i + 1).trim();
    if (i > 0 && name && token.length >= 16) out.set(name, digest(token));
  }
  return out;
}

/** The moderator a token belongs to, or null. Compares hashes in constant time. */
export function moderatorFor(token: string | undefined | null, moderators = parseModerators()): string | null {
  if (!token) return null;
  const candidate = digest(token);
  let found: string | null = null;
  for (const [name, hash] of moderators) {
    if (timingSafeEqual(hash, candidate)) found = name; // no early exit: same time whether found or not
  }
  return found;
}
