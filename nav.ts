// The navigation stack and the posts pages pass along: a post page reads the post the timeline
// already has instead of fetching it again.
import { createNavStack } from "nsh/base";
import type { Comment, Status } from "./api";

export type Route =
  | { name: "timeline" }
  | { name: "post"; id: string }
  /** By uid, or by screen name (an `@name` mention), which the page resolves. */
  | { name: "profile"; uid: string }
  | { name: "profile"; screenName: string }
  /** The signed-in account's own profile. */
  | { name: "profile"; me: true }
  /** Who an account follows, or who follows it. */
  | { name: "people"; uid: string; kind: "following" | "followers" }
  /** A topic's posts, by its name without the `#`s. */
  | { name: "topic"; topic: string }
  /** An edited post's versions, by the post's id. */
  | { name: "edits"; id: string }
  /** All the replies to a comment of a post, by the post's and the comment's ids. */
  | { name: "replies"; postId: string; commentId: string };

export const nav = createNavStack<Route>([{ name: "timeline" }]);

const posts = new Map<string, Status>();

export function openPost(status: Status) {
  posts.set(status.id, status);
  nav.push({ name: "post", id: status.id });
}

export const postById = (id: string) => posts.get(id);

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

/** Who `uid` follows, or who follows `uid`. */
export const openPeople = (uid: string, kind: "following" | "followers") => {
  if (uid) nav.push({ name: "people", uid, kind });
};
