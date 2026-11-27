// An account's album: the pictures and videos of their own posts, newest first, each on its own
// (a post of three pictures gives three), grouped by the month they were posted in. Read from the
// posts their profile lists (`userPosts`): there is no album endpoint the app reads.
import type { Pic, Status, Video } from "./api";
import { parseWeiboDate } from "./format";

export interface AlbumItem {
  /** The post's id and the item's place in it: unique in the album. */
  id: string;
  /** The post it is in. */
  status: Status;
  pic?: Pic;
  video?: Video;
  /** When it was posted (ms since the epoch), if Weibo's date reads. */
  at: number | null;
}

/**
 * The pictures and videos of `posts`, in order. Only the account's own: not the posts Weibo mixes
 * in that they commented on or liked (`activity`), nor a reposted post's media. Not their pinned
 * post's either: it heads the posts whatever its date, which would put it out of order here.
 */
export function albumOf(posts: readonly Status[]): AlbumItem[] {
  const items: AlbumItem[] = [];
  const seen = new Set<string>();
  for (const s of posts) {
    if (s.activity || s.pinned || seen.has(s.id)) continue;
    seen.add(s.id);
    const at = parseWeiboDate(s.createdAt);
    s.pics.forEach((pic, i) => items.push({ id: `${s.id}:${i}`, status: s, pic, at }));
    if (s.video) items.push({ id: `${s.id}:video`, status: s, video: s.video, at });
  }
  return items;
}

/** A month of the album (local time): its year and its month, 1 to 12. */
export interface Month {
  year: number;
  month: number;
}

/** A row of the album's list: a month's heading, or up to `ALBUM_COLUMNS` items of that month. */
export type AlbumRow = { id: string; month: Month; items?: undefined } | { id: string; month?: undefined; items: AlbumItem[] };

export const ALBUM_COLUMNS = 3;

/**
 * The album's rows: each month's heading, then its items in rows of `ALBUM_COLUMNS`, the last one
 * short. An item with no date stays in the month before it. A row is keyed by its first item, so
 * it keeps its key as more items fill it.
 */
export function albumRows(items: readonly AlbumItem[]): AlbumRow[] {
  const rows: AlbumRow[] = [];
  let current: string | undefined;
  let row: AlbumItem[] | undefined;
  for (const item of items) {
    if (item.at !== null) {
      const d = new Date(item.at);
      const month = { year: d.getFullYear(), month: d.getMonth() + 1 };
      const key = `${month.year}-${month.month}`;
      if (key !== current) {
        current = key;
        // Weibo lists a post once; a month seen again (posts out of order) gets a heading of its own.
        rows.push({ id: `month:${key}:${rows.length}`, month });
        row = undefined;
      }
    }
    if (!row || row.length === ALBUM_COLUMNS) {
      row = [];
      rows.push({ id: `row:${item.id}`, items: row });
    }
    row.push(item);
  }
  return rows;
}
