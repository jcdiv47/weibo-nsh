// A paged list's state: its items, the next page's cursor, and whether a load runs or failed.
// With `saveAs`, its first page is kept on the device (`saved.ts`): the next time it opens on it
// while the first page loads, as if refreshing it (`refreshing`), and keeps it, marked by
// `savedAt`, if that load fails.
import { signal } from "nsh";
import type { Page } from "./api";
import { NotSignedIn } from "./bridge";
import { loadSaved, save } from "./saved";

export interface FeedOptions {
  /** The key its first page is saved under; `null` (or none): not saved. Read at each first load. */
  saveAs?: () => string | null;
}

export function createFeed<T extends { id: string }, C = string>(
  load: (cursor?: C) => Promise<Page<T, C>>,
  options: FeedOptions = {},
) {
  const items = signal<T[]>([]);
  const next = signal<C | null | undefined>(undefined); // undefined: not loaded yet, null: the end
  const loading = signal(false);
  const refreshing = signal(false);
  const error = signal<string | null>(null);
  /** The items shown are the saved ones, saved then: none has loaded since. */
  const savedAt = signal<number | null>(null);
  let generation = 0;

  async function fetchPage(cursor: C | undefined, replace: boolean) {
    const mine = ++generation;
    loading.set(true);
    error.set(null);
    const key = replace ? (options.saveAs?.() ?? null) : null;
    // Nothing shown yet: show what was saved while this loads, or instead of it if it fails.
    let loaded = false;
    const saved =
      key && !items().length
        ? loadSaved<Page<T, C>>(key).then((s) => {
            if (!s || loaded || mine !== generation || items().length || !Array.isArray(s.data?.items)) return;
            items.set(s.data.items);
            next.set(s.data.next ?? null);
            savedAt.set(s.at);
            refreshing.set(true); // The page's refresh indicator turns until the new page is in.
          }, () => {})
        : undefined;
    try {
      const page = await load(cursor);
      loaded = true;
      if (mine !== generation) return; // A refresh started since.
      if (replace) savedAt.set(null);
      if (key) save(key, page);
      if (replace) items.set(page.items);
      else {
        // Pages overlap when new posts arrive between requests: drop repeated ids.
        items.update((list) => {
          const seen = new Set(list.map((i) => i.id));
          return [...list, ...page.items.filter((i) => !seen.has(i.id))];
        });
      }
      // Loaders return `next: null` at the end; a page may be empty after filtering yet not last.
      next.set(page.next);
    } catch (e) {
      await saved; // The error shows with the saved items, not before them.
      if (mine === generation && !(e instanceof NotSignedIn)) error.set(String((e as Error)?.message ?? e));
    } finally {
      if (mine === generation) {
        loading.set(false);
        refreshing.set(false);
      }
    }
  }

  return {
    items: () => items(),
    loading: () => loading(),
    refreshing: () => refreshing(),
    error: () => error(),
    done: () => next() === null,
    savedAt: () => savedAt(),
    /** Changes the items in place (a reply sent, a count bumped), as a load would. */
    update(fn: (list: T[]) => T[]) {
      items.update(fn);
    },
    refresh() {
      refreshing.set(true);
      return fetchPage(undefined, true);
    },
    more() {
      if (loading()) return;
      // Past the saved items, or retrying after they showed: load the first page again.
      if (savedAt() !== null) return fetchPage(undefined, true);
      const cursor = next();
      if (cursor === null) return;
      return fetchPage(cursor ?? undefined, cursor === undefined);
    },
  };
}

export type Feed<T extends { id: string }, C = string> = ReturnType<typeof createFeed<T, C>>;
