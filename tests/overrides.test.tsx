// Likes and saves given here (`StatusCard`, `CommentBody`, `FavoriteButton`): a refusal leaves no
// change of its own behind, so a fresh copy of the post shows as Weibo has it; signing out
// (`forgetAccount`) forgets them, and the posts and comments pages passed along (`nav.ts`).
import type { WebViewRef } from "nsh";
import { beforeEach, expect, test } from "nsh/test";
import { type Comment, forgetAccount, type Status } from "../api";
import { weibo } from "../bridge";
import { commentLikeOf, toggleCommentLike } from "../components/CommentBody";
import { isFavorited, toggleFavorite } from "../components/FavoriteButton";
import { likeOf, toggleLike } from "../components/StatusCard";
import { commentById, keepPost, openReplies, postById } from "../nav";

// Weibo's answer to every write, as the bridge's page would give it.
let accept = true;
weibo.attach({
  load() {},
  async evaluate() {
    return { value: { status: 200, url: "https://weibo.com/", json: accept ? { ok: 1 } : { ok: 0, msg: "refused" }, text: null } };
  },
} as unknown as WebViewRef);

let n = 0;
const post = (): Status => ({
  id: `p${++n}`,
  mblogid: "x",
  createdAt: "Thu Nov 19 21:04:11 +0800 2026",
  text: "",
  links: {},
  user: { id: "u1", name: "Alice", avatar: "" },
  pics: [],
  reposts: 0,
  comments: 0,
  likes: 3,
  liked: false,
  favorited: false,
  editCount: 0,
  isLongText: false,
});
const comment = (): Comment => ({
  id: `c${++n}`,
  text: "",
  links: {},
  user: { id: "u2", name: "Bob", avatar: "" },
  createdAt: "Thu Nov 19 21:05:00 +0800 2026",
  likes: 3,
  liked: false,
  pics: [],
  replyCount: 0,
  preview: [],
});

beforeEach(() => {
  accept = true;
});

test("a refused save leaves no change behind: a fresh copy of the post shows as Weibo has it", async () => {
  const s = post();
  accept = false;
  await toggleFavorite(s);
  expect(isFavorited(s)).toBe(false);
  // Saved since (on weibo.com), and read again: the post's own state shows.
  s.favorited = true;
  expect(isFavorited(s)).toBe(true);
});

test("a refused save after an accepted one goes back to the accepted one", async () => {
  const s = post();
  await toggleFavorite(s);
  expect(isFavorited(s)).toBe(true);
  accept = false;
  await toggleFavorite(s);
  expect(isFavorited(s)).toBe(true);
});

test("a refused comment like leaves no change behind", async () => {
  const c = comment();
  accept = false;
  await toggleCommentLike(c);
  expect(commentLikeOf(c)).toEqual({ liked: false, likes: 3 });
  // Liked since, and read again: the comment's own counts show.
  c.liked = true;
  c.likes = 9;
  expect(commentLikeOf(c)).toEqual({ liked: true, likes: 9 });
});

test("a refused comment like after an accepted one goes back to the accepted one", async () => {
  const c = comment();
  await toggleCommentLike(c);
  accept = false;
  await toggleCommentLike(c);
  expect(commentLikeOf(c)).toEqual({ liked: true, likes: 4 });
});

test("signing out forgets likes, saves and the posts and comments passed along", async () => {
  const s = post();
  const c = comment();
  await toggleLike(s);
  await toggleCommentLike(c);
  await toggleFavorite(s);
  keepPost(s.id, s);
  openReplies(s, c);
  expect(postById(s.id)).toBe(s);
  expect(commentById(c.id)).toBe(c);

  await forgetAccount();

  // The next account's copies of the same post and comment show as Weibo has them for it.
  const next = { ...s, liked: false, likes: 3, favorited: false };
  const nextComment = { ...c, liked: false, likes: 3 };
  expect(likeOf(next)).toEqual({ liked: false, likes: 3 });
  expect(isFavorited(next)).toBe(false);
  expect(commentLikeOf(nextComment)).toEqual({ liked: false, likes: 3 });
  expect(postById(s.id)).toBeUndefined();
  expect(commentById(c.id)).toBeUndefined();
});
