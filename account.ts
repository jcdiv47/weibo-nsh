// What the app holds in memory of the signed-in account: likes, saves and follows given here, the
// posts and comments pages pass along, the composer's drafts. Each module that holds some registers
// how to forget it; `forgetAccount` (api.ts) runs them all, so whoever signs in next sees none of
// it. This module imports nothing, so any module can register without an import cycle.

const forgetters = new Set<() => void>();

/** Registers `forget`, which drops what its module holds of the account. Call it at module scope. */
export function onForgetAccount(forget: () => void): void {
  forgetters.add(forget);
}

/** Drops everything the app holds in memory of the account. */
export function forgetInMemory(): void {
  for (const forget of forgetters) forget();
}
