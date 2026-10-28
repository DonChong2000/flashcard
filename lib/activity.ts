import { SYNC_API } from "./constants";
import { generateSyncId } from "./sync";

// Answers per local day (YYYY-MM-DD), across all datasets.
export type Activity = Record<string, number>;
// The same shape in localStorage, the cloud record and export files: deviceId -> Activity.
export type ActivityDevices = Record<string, Activity>;

const ACTIVITY_KEY = "flashcard_activity";
const DEVICE_ID_KEY = "flashcard_device_id";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dayKey(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

export function isActivityDevices(x: unknown): x is ActivityDevices {
  return (
    !!x &&
    typeof x === "object" &&
    Object.values(x).every(
      (days) =>
        !!days &&
        typeof days === "object" &&
        Object.entries(days).every(([day, n]) => DAY_RE.test(day) && Number.isInteger(n) && (n as number) >= 0)
    )
  );
}

export function getActivityDevices(): ActivityDevices {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? "{}");
    return isActivityDevices(stored) ? stored : {};
  } catch {
    return {};
  }
}

function save(devices: ActivityDevices) {
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(devices));
}

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateSyncId();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function logActivity(): void {
  const devices = getActivityDevices();
  const own = (devices[deviceId()] ??= {});
  const today = dayKey(new Date());
  own[today] = (own[today] ?? 0) + 1;
  save(devices);
}

// A device's count for a day only ever grows, so the larger value is the newer one.
// That makes merging order-independent and safe to repeat (importing a file twice changes nothing).
export function mergeActivity(incoming: ActivityDevices): void {
  const devices = getActivityDevices();
  for (const [id, days] of Object.entries(incoming)) {
    const mine = (devices[id] ??= {});
    for (const [day, n] of Object.entries(days)) mine[day] = Math.max(mine[day] ?? 0, n);
  }
  save(devices);
}

// Summed over every device.
export function getActivity(): Activity {
  const total: Activity = {};
  for (const days of Object.values(getActivityDevices())) {
    for (const [day, n] of Object.entries(days)) total[day] = (total[day] ?? 0) + n;
  }
  return total;
}

// Consecutive days with answers, ending today (or yesterday, so the streak survives until you study today).
export function getStreak(activity: Activity): number {
  const d = new Date();
  if (!activity[dayKey(d)]) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (activity[dayKey(d)]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// Pull, merge, push. Two devices pushing at once can drop the other's latest counts from the cloud,
// but each still has them locally and puts them back on its next sync.
export async function syncActivity(syncId: string): Promise<void> {
  const url = `${SYNC_API}/sync/${syncId}/_activity`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok && res.status !== 404) throw new Error(`activity pull failed: ${res.status}`);
  if (res.ok) {
    const remote = (await res.json()).devices;
    if (isActivityDevices(remote)) mergeActivity(remote);
  }
  const put = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: 1, devices: getActivityDevices() }),
  });
  if (!put.ok) throw new Error(`activity push failed: ${put.status}`);
}
