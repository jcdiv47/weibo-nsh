// A paged list's state: its items, the next page's cursor, and whether a load runs or failed.
import { signal } from "nsh";
import type { Page } from "./api";
import { NotSignedIn } from "./bridge";

export function createFeed<T extends { id: string }, C = string>(load: (cursor?: C) => Promise<Page<T, C>>) {
  const items = signal<T[]>([]);
  const next = signal<C | null | undefined>(undefined); // undefined: not loaded yet, null: the end
  const loading = signal(false);
  const refreshing = signal(false);
  const error = signal<string | null>(null);
  let generation = 0;

  async function fetchPage(cursor: C | undefined, replace: boolean) {
    const mine = ++generation;
    loading.set(true);
    error.set(null);
    try {
      const page = await load(cursor);
      if (mine !== generation) return; // A refresh started since.
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
    refresh() {
      refreshing.set(true);
      return fetchPage(undefined, true);
    },
    more() {
      const cursor = next();
      if (loading() || cursor === null) return;
      return fetchPage(cursor ?? undefined, cursor === undefined);
    },
  };
}

export type Feed<T extends { id: string }, C = string> = ReturnType<typeof createFeed<T, C>>;
