import bcrypt from "bcryptjs";
import crypto from "crypto";

function chunkString(value: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += chunkSize) {
    chunks.push(value.slice(i, i + chunkSize));
  }
  return chunks;
}

export function generateRecoveryKey(): string {
  // 32 bytes -> 64 hex chars. Segment for readability.
  const raw = crypto.randomBytes(32).toString("hex").toUpperCase();
  return chunkString(raw, 4).join("-");
}

export async function hashRecoveryKey(key: string): Promise<string> {
  return bcrypt.hash(key, 12);
}

export async function verifyRecoveryKey(
  plainKey: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plainKey, hash);
}

