import { credentials } from "./strava";

const enc = new TextEncoder();

/** AES-GCM key derived from the Strava client secret, so no extra env var is needed. */
async function key() {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`paceframe-seal:${credentials().secret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypt + authenticate a small value with an expiry; returns a URL-safe string. */
export async function seal(data: unknown, ttlSeconds: number): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = enc.encode(JSON.stringify({ d: data, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), body));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return Buffer.from(out).toString("base64url");
}

/** The sealed value, or null if it was tampered with, malformed or expired. */
export async function unseal<T>(code: string): Promise<T | null> {
  try {
    const buf = Buffer.from(code.trim(), "base64url");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, await key(), buf.subarray(12));
    const { d, exp } = JSON.parse(new TextDecoder().decode(pt)) as { d: T; exp: number };
    return exp > Date.now() / 1000 ? d : null;
  } catch {
    return null;
  }
}
