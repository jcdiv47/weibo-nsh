// The timeline's new posts: while the timeline is in view, a gentle check every few minutes for
// posts newer than the one it shows first. The bottom button counts them instead of showing its
// arrow (`TopButton`), and a press shows them at once: they came with the check, so the list puts
// them over the shown ones without another request. When more came than one page holds, the press
// loads the first page again instead, so the timeline has no gap.
import { effect, lifecycle, signal, untracked } from "nsh";
import { isNewerId } from "./api";
import type { Feed } from "./feed";

/** How often the timeline checks for new posts while it is in view. */
export const CHECK_EVERY_MS = 2 * 60_000;
/** How soon a check runs once the timeline comes back into view, if the last is that old. */
const RETURN_DELAY_MS = 1500;

export interface News {
  /** How many new posts the last check found that the timeline doesn't show. */
  count(): number;
  /** More may be past those counted (`count` is a lower bound: "20+"). */
  more(): boolean;
  /** Shows the new posts at the top of the timeline. */
  show(): void;
}

export function createNews<T extends { id: string }>(
  feed: Feed<T>,
  check: (sinceId: string) => Promise<{ items: T[]; more: boolean }>,
  /** Whether a check may run now: the timeline in view, the app in front, the network willing. */
  inView: () => boolean,
  /** How often it checks (`CHECK_EVERY_MS`; the tests' own). */
  every = CHECK_EVERY_MS,
): News {
  const found = signal<{ items: T[]; more: boolean }>({ items: [], more: false });
  /** When the timeline last learned what is newest: a check, or a load of its first page. */
  let last = 0;
  let checking = false;
  const top = () => feed.items()[0]?.id;
  // Those found that the timeline doesn't show yet: none once a refresh brought them in.
  const pending = () => {
    const first = top();
    return first ? found().items.filter((i) => isNewerId(i.id, first)) : [];
  };

  // A new first post (a refresh, a pull, the first load) is as good as a check.
  effect(() => {
    if (top()) last = Date.now();
  });

  async function run() {
    const since = untracked(top);
    if (checking || !since || feed.loading() || feed.refreshing() || feed.savedAt() !== null) return;
    if (Date.now() - last < every / 2) return;
    checking = true;
    last = Date.now();
    try {
      const newer = await check(since);
      if (untracked(top) === since) found.set(newer);
    } catch {
      // A failed check shows nothing: the next one tries again.
    } finally {
      checking = false;
    }
  }

  effect(() => {
    if (!inView()) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      void run();
      timer = setTimeout(tick, every);
    };
    const since = Date.now() - last;
    timer = setTimeout(tick, since >= every ? Math.min(RETURN_DELAY_MS, every) : every - since);
    return () => clearTimeout(timer);
  });

  return {
    count: () => pending().length,
    more: () => found().more && pending().length > 0,
    show() {
      const shown = pending();
      const more = found().more;
      found.set({ items: [], more: false });
      if (!shown.length) return;
      if (more) {
        void feed.refresh();
        return;
      }
      const ids = new Set(shown.map((i) => i.id));
      feed.update((list) => [...shown, ...list.filter((i) => !ids.has(i.id))]);
    },
  };
}

/** The app is in front. Offline, a check fails quietly and the next one tries again. (`network()`,
 * which would skip checks offline and in Low Data Mode, is not in the runtime the device builds use
 * yet: importing it leaves the app blank.) */
export function mayCheck(): boolean {
  return lifecycle() !== "background";
}
