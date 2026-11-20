// The last answers that loaded, kept on the device (`Storage`): a page opens on what it showed
// last time while it loads, and keeps showing it, marked as saved, when Weibo can't be reached or
// answers in a shape the app no longer reads. Only what the app maps is kept (`api.ts`'s types),
// the newest few dozen entries, and all of it goes when the account signs out.
import { Storage } from "nsh";

const PREFIX = "saved:v1:";
const INDEX = `${PREFIX}#index`;
/** Entries kept; the least recently saved go first. */
const MAX_ENTRIES = 40;

export interface Saved<T> {
  /** When it was saved (ms since the epoch). */
  at: number;
  data: T;
}

// When each entry was saved, by key: which ones to drop when there are too many.
let index: Promise<Record<string, number>> | undefined;
const readIndex = () =>
  (index ??= Storage.getItem(INDEX).then(
    (v) => {
      try {
        const parsed = JSON.parse(v ?? "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    },
    () => ({}),
  ));

/** What was saved under `key`, or `null`. Never rejects. */
export async function loadSaved<T>(key: string): Promise<Saved<T> | null> {
  try {
    const v = await Storage.getItem(PREFIX + key);
    if (!v) return null;
    const saved = JSON.parse(v);
    return typeof saved?.at === "number" && saved.data !== undefined && saved.data !== null ? saved : null;
  } catch {
    return null;
  }
}

const oldestFirst = (idx: Record<string, number>) => Object.keys(idx).sort((a, b) => idx[a] - idx[b]);

/** Saves `data` under `key`, dropping the oldest entries past the limit. Never rejects. */
export async function save<T>(key: string, data: T): Promise<void> {
  try {
    const idx = await readIndex();
    const value = JSON.stringify({ at: Date.now(), data } satisfies Saved<T>);
    idx[key] = Date.now();
    for (const old of oldestFirst(idx).slice(0, Math.max(0, Object.keys(idx).length - MAX_ENTRIES))) {
      delete idx[old];
      await Storage.removeItem(PREFIX + old);
    }
    try {
      await Storage.setItem(PREFIX + key, value);
    } catch {
      // Storage is full: drop the older half of the others and try once more.
      const others = oldestFirst(idx).filter((k) => k !== key);
      for (const old of others.slice(0, Math.ceil(others.length / 2))) {
        delete idx[old];
        await Storage.removeItem(PREFIX + old);
      }
      try {
        await Storage.setItem(PREFIX + key, value);
      } catch {
        delete idx[key];
      }
    }
    await Storage.setItem(INDEX, JSON.stringify(idx));
  } catch {
    // Saving is a convenience: a failure loses nothing the app shows.
  }
}

/** Forgets everything saved (signing out: the next account must not see this one's posts). */
export async function clearSaved(): Promise<void> {
  index = Promise.resolve({});
  try {
    for (const key of await Storage.keys()) if (key.startsWith(PREFIX)) await Storage.removeItem(key);
  } catch {
    // Nothing more to do.
  }
}
