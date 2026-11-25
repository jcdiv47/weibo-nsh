// Weibo's emoticons (表情): the text carries them as codes, "[允悲]", which weibo.com draws as
// pictures. Which code stands for which picture comes from two places, kept in one table:
// - `/ajax/statuses/config`, weibo.com's own list (`data.emoticon.<language>.<group>[]`, each a
//   `phrase` and a `url`), read once signed in. It does not hold every code Weibo draws.
// - each post's and comment's `text`, its HTML, where weibo.com has already put every code it
//   draws as `<img alt="[允悲]" src="...">`. The parsers in `api.ts` learn them as they go.
// A code in neither stays text, as weibo.com leaves it ("[not an emoticon]").
import { signal } from "nsh";

/** The pictures of the emoticons known so far, by code ("[允悲]"). */
export const emoticons = signal<Record<string, string>>({});

function commit(found: Record<string, string>) {
  const known = emoticons();
  if (Object.entries(found).some(([code, url]) => known[code] !== url)) emoticons.set({ ...known, ...found });
}

// While a page is parsed (`batchEmoticons`), what its posts and comments teach is gathered here
// and set once at the end: one change of `emoticons`, not one per post.
let pending: Record<string, string> | undefined;

function learn(found: Record<string, string>) {
  if (pending) Object.assign(pending, found);
  else commit(found);
}

/** Runs `fn`, keeping the emoticons it learns until it ends, then learning them all at once.
 * Nested calls join the outer one. */
export function batchEmoticons<T>(fn: () => T): T {
  if (pending) return fn();
  pending = {};
  try {
    return fn();
  } finally {
    const found = pending;
    pending = undefined;
    commit(found);
  }
}

const IMG = /<img\b[^>]*>/gi;
const ALT = /\salt=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const SRC = /\ssrc=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const attr = (tag: string, re: RegExp) => {
  const m = tag.match(re);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
};

/** The emoticons a post's or comment's HTML `text` draws, by code. */
export function emoticonsOfHtml(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [tag] of html.matchAll(IMG)) {
    const code = attr(tag, ALT);
    const src = attr(tag, SRC);
    if (code && src && /^\[[^\[\]]+\]$/.test(code) && /^https?:/.test(src)) out[code] = src;
  }
  return out;
}

/** Learns the emoticons a post's or comment's HTML `text` draws. */
export function learnFromHtml(html: string) {
  if (html.includes("<img")) learn(emoticonsOfHtml(html));
}

/** The emoticons of `/ajax/statuses/config`, by code; none if its shape changed. */
export function parseEmoticonConfig(json: any): Record<string, string> {
  const out: Record<string, string> = {};
  const languages = json?.data?.emoticon;
  for (const groups of Object.values(languages && typeof languages === "object" ? languages : {})) {
    for (const list of Object.values(groups && typeof groups === "object" ? (groups as object) : {})) {
      for (const e of Array.isArray(list) ? list : []) {
        const code = typeof e?.phrase === "string" ? e.phrase : "";
        const url = typeof e?.url === "string" ? e.url : "";
        if (/^\[[^\[\]]+\]$/.test(code) && /^https?:/.test(url)) out[code] = url;
      }
    }
  }
  return out;
}

let loading: Promise<void> | undefined;

/** Reads weibo.com's list of emoticons, once (again after a failure). */
export function loadEmoticons(get: (path: string) => Promise<unknown>): Promise<void> {
  loading ??= get("/ajax/statuses/config").then(
    (json) => learn(parseEmoticonConfig(json)),
    () => {
      loading = undefined;
    },
  );
  return loading;
}
