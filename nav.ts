// The navigation stack and the posts pages pass along: a post page reads the post the timeline
// already has instead of fetching it again.
import { signal } from "nsh";
import { createNavStack } from "nsh/base";
import { type Comment, longText, type Status, type User } from "./api";

export type Route =
  | { name: "timeline" }
  | { name: "post"; id: string }
  /** By uid, or by screen name (an `@name` mention), which the page resolves. */
  | { name: "profile"; uid: string }
  | { name: "profile"; screenName: string }
  /** The signed-in account's own profile. */
  | { name: "profile"; me: true }
  /** Who an account follows, or who follows it (its name and counts for the title and tabs). */
  | {
      name: "people";
      uid: string;
      kind: "following" | "followers";
      userName?: string;
      followingCount?: number;
      followersCount?: number;
    }
  /** A topic's posts, by its name without the `#`s. */
  | { name: "topic"; topic: string }
  /** An edited post's versions, by the post's id. */
  | { name: "edits"; id: string }
  /** All the replies to a comment of a post, by the post's and the comment's ids. */
  | { name: "replies"; postId: string; commentId: string }
  /** The posts I saved (收藏). */
  | { name: "favorites" }
  /** Search: hot searches, then suggestions as a search is typed. */
  | { name: "search" }
  /** What a search found: posts and accounts, under two tabs. */
  | { name: "search-results"; q: string };

export const nav = createNavStack<Route>([{ name: "timeline" }]);

const posts = new Map<string, Status>();

const fullTexts = new Map<string, Promise<Awaited<ReturnType<typeof longText>>>>();

/**
 * A long post (`isLongText`, its `text` cut) with its whole text and that text's links, asked
 * once per post (only the text is kept: the rest is the post as given); any other post as it is.
 * If none comes, the post comes back with its cut text, which still reads, and the next call asks
 * again.
 */
export function withFullText(status: Status): Promise<Status> {
  if (!status.isLongText || !status.mblogid) return Promise.resolve(status);
  let text = fullTexts.get(status.id);
  if (!text) {
    text = longText(status.mblogid).catch(() => null);
    fullTexts.set(status.id, text);
  }
  const asked = text;
  return asked.then((t) => {
    if (!t) {
      if (fullTexts.get(status.id) === asked) fullTexts.delete(status.id);
      return status;
    }
    return { ...status, text: t.text, links: { ...status.links, ...t.links }, isLongText: false };
  });
}

/** How long a press on a long post waits for its whole text before opening its page anyway. */
const FULL_TEXT_WAIT_MS = 1500;

/** The post whose page is about to open, while it waits for its whole text: its card stays pressed. */
export const opening = signal<string | null>(null);

/**
 * Opens a post's page. A long post's page waits for the whole text first: if the text came in
 * while the page slides in, it would grow and push the pictures down mid-slide. Other presses on
 * posts do nothing until it opens.
 */
export function openPost(status: Status) {
  if (opening()) return;
  const push = (s: Status) => {
    posts.set(s.id, s);
    nav.push({ name: "post", id: s.id });
  };
  if (!status.isLongText || !status.mblogid) return push(status);
  opening.set(status.id);
  const late = new Promise<Status>((resolve) => setTimeout(() => resolve(status), FULL_TEXT_WAIT_MS));
  Promise.race([withFullText(status), late]).then((s) => {
    opening.set(null);
    push(s);
  });
}

/**
 * A post by its id or mblogid (a link to it), which the page loads when it has not got it. Pages
 * stack: a post linked from a post linked from a post opens on top, and back returns each.
 */
export const openPostById = (id: string) => {
  if (id) nav.push({ name: "post", id });
};

export const postById = (id: string) => posts.get(id);

/** Keeps a post a page loaded by id, for the pages it opens (its replies, its versions). */
export const keepPost = (id: string, status: Status) => {
  posts.set(id, status);
  posts.set(status.id, status);
};

const commentsById = new Map<string, Comment>();

/** The thread of a comment: the comment and all its replies. */
export function openReplies(status: Status, comment: Comment) {
  posts.set(status.id, status);
  commentsById.set(comment.id, comment);
  nav.push({ name: "replies", postId: status.id, commentId: comment.id });
}

export const commentById = (id: string) => commentsById.get(id);

/** The versions of an edited post. */
export function openEdits(status: Status) {
  posts.set(status.id, status);
  nav.push({ name: "edits", id: status.id });
}

export const openProfile = (uid: string) => {
  if (uid) nav.push({ name: "profile", uid });
};

/** The profile of an `@name` mention. */
export const openProfileByName = (screenName: string) => {
  if (screenName) nav.push({ name: "profile", screenName });
};

/** The posts of a `#topic#`. */
export const openTopic = (topic: string) => {
  const name = topic.replace(/^#|#$/g, "").trim();
  if (name) nav.push({ name: "topic", topic: name });
};

/** My own profile. */
export const openMe = () => nav.push({ name: "profile", me: true });

/** Who `user` follows, or who follows `user`. */
export const openPeople = (user: User, kind: "following" | "followers") => {
  if (user.id)
    nav.push({
      name: "people",
      uid: user.id,
      kind,
      userName: user.name,
      followingCount: user.followingCount,
      followersCount: user.followersCount,
    });
};

/** The posts I saved (收藏). */
export const openFavorites = () => nav.push({ name: "favorites" });

/** Search, from the timeline. */
export const openSearch = () => nav.push({ name: "search" });

/** What `q` finds, over the search page. */
export const openSearchResults = (q: string) => {
  const query = q.trim();
  if (query) nav.push({ name: "search-results", q: query });
};
