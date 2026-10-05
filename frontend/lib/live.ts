// Tiny live-sync engine: tracks in-flight saves so background refetches
// never overwrite a local mutation that hasn't reached Postgres yet.

let inFlight = 0;

export function isSyncing(): boolean {
  return inFlight > 0;
}

export async function trackSync<T>(promise: Promise<T>): Promise<T> {
  inFlight += 1;
  try {
    return await promise;
  } finally {
    inFlight -= 1;
  }
}

// Bail-out setter: keeps the previous state reference when the incoming
// rows are identical, so save-on-change effects don't refire in a loop.
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
