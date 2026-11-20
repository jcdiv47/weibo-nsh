// The navigation stack and the posts pages pass along: a post page reads the post the timeline
// already has instead of fetching it again.
import { createNavStack } from "nsh/base";
import type { Status } from "./api";

export type Route =
  | { name: "timeline" }
  | { name: "post"; id: string }
  /** By uid, or by screen name (an `@name` mention), which the page resolves. */
  | { name: "profile"; uid: string }
  | { name: "profile"; screenName: string };

export const nav = createNavStack<Route>([{ name: "timeline" }]);

const posts = new Map<string, Status>();

export function openPost(status: Status) {
  posts.set(status.id, status);
  nav.push({ name: "post", id: status.id });
}

export const postById = (id: string) => posts.get(id);

export const openProfile = (uid: string) => {
  if (uid) nav.push({ name: "profile", uid });
};

/** The profile of an `@name` mention. */
export const openProfileByName = (screenName: string) => {
  if (screenName) nav.push({ name: "profile", screenName });
};
