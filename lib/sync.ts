import { SYNC_API } from "./constants";
import type { ProgressExport } from "./progress";

const SYNC_ID_KEY = "flashcard_sync_id";

export function getSyncId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SYNC_ID_KEY);
  } catch {
    return null;
  }
}

export function setSyncId(id: string): void {
  localStorage.setItem(SYNC_ID_KEY, id);
}

export function clearSyncId(): void {
  localStorage.removeItem(SYNC_ID_KEY);
}

export function generateSyncId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function ensureSyncId(): string {
  const existing = getSyncId();
  if (existing) return existing;
  const fresh = generateSyncId();
  setSyncId(fresh);
  return fresh;
}

export async function pullRemote(syncId: string, slug: string): Promise<ProgressExport | null> {
  const res = await fetch(`${SYNC_API}/sync/${syncId}/${slug}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`pull failed: ${res.status}`);
  return res.json();
}

export async function pushRemote(syncId: string, slug: string, data: ProgressExport): Promise<void> {
  const res = await fetch(`${SYNC_API}/sync/${syncId}/${slug}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`push failed: ${res.status}`);
}

export function progressDiffers(a: ProgressExport, b: ProgressExport): boolean {
  return a.correct !== b.correct || a.incorrect !== b.incorrect || a.bookmarked !== b.bookmarked;
}
