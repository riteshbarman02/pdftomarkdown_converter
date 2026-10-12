import { createHash, timingSafeEqual } from "node:crypto";

export function hashOwner(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function ownersMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
