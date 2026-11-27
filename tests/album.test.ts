// The album (`album.ts`): which pictures and videos of an account's posts it shows, in what order,
// and how they fall into months and rows.
import { expect, test } from "nsh/test";
import { albumOf, albumRows } from "../album";
import { parseUserPosts, type Status } from "../api";
import { monthLabel } from "../format";
import { albumPage } from "./fixtures/albumPosts";

const posts = (...pages: number[]): Status[] => pages.flatMap((p) => parseUserPosts(albumPage(p), p).items);

test("the album is the account's own pictures and videos, each on its own, newest first", () => {
  const items = albumOf(posts(1, 2, 3));
  // Not the pinned post's picture, nor the liked post's: theirs, not the album's.
  expect(items.map((i) => i.pic?.original ?? i.video?.title)).toEqual([
    "https://wx1.sinaimg.cn/large/nov1.jpg",
    "https://wx1.sinaimg.cn/large/nov2.jpg",
    "落日",
    "https://wx1.sinaimg.cn/large/oct1.jpg",
    "https://wx1.sinaimg.cn/large/oct2.jpg",
    "https://wx1.sinaimg.cn/large/oct3.jpg",
    "https://wx1.sinaimg.cn/large/old1.jpg",
  ]);
  expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  expect(items[2].video?.duration).toBe(75);
});

test("a post listed twice gives its pictures once", () => {
  const page = posts(1);
  expect(albumOf([...page, ...page]).length).toBe(albumOf(page).length);
});

test("the album falls into months, three to a row, a month's last row short", () => {
  const rows = albumRows(albumOf(posts(1, 2, 3)));
  const shape = rows.map((r) => (r.month ? `${r.month.year}-${r.month.month}` : r.items.length));
  expect(shape).toEqual(["2026-11", 3, "2026-10", 3, "2025-9", 1]);
  expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
});

test("a row keeps its key as more of its month comes in", () => {
  const all = albumOf(posts(1, 2, 3));
  const before = albumRows(all.slice(0, 4)); // November's three, then October's first.
  const after = albumRows(all);
  expect(after.slice(0, before.length).map((r) => r.id)).toEqual(before.map((r) => r.id));
});

test("an item with no date stays in the month before it", () => {
  const [first, ...rest] = albumOf(posts(1));
  const rows = albumRows([first, { ...rest[0], at: null }]);
  expect(rows.length).toBe(2);
  expect(rows[1].items?.length).toBe(2);
});

test("a month is named with its year only when it is not this year", () => {
  const now = new Date(2026, 10, 27).getTime();
  expect(monthLabel(2026, 11, now)).toBe("November");
  expect(monthLabel(2025, 9, now)).toBe("September 2025");
});
