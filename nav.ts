// The navigation stacks and the posts pages pass along: a post page reads the post the timeline
// already has instead of fetching it again.
//
// On a phone the app is one stack. On the Mac it is a window of three columns: a sidebar of
// sections (Following, Search, Favorites, My profile), each with a stack of its own in the list
// column, and the detail column at the right, where a post a list's press opens shows with its
// comments (its replies and versions stack over it there).
import { context, signal } from "nsh";
import { createNavStack, type NavStackState } from "nsh/base";
import { type Comment, longText, type Status, type User } from "./api";
import { detailShown, showDetail, WIDE } from "./layout";

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
  | { name: "search-results"; q: string }
  /** Search within one account's posts, from their profile (their name for the field's hint). */
  | { name: "profile-search"; uid: string; userName?: string }
  /** The Mac's detail column before a post is chosen. */
  | { name: "blank" };

export { WIDE };

/** The sections of the Mac's sidebar, each a stack of its own in the list column. */
export type Section = "timeline" | "search" | "favorites" | "me";
export const SECTIONS: readonly Section[] = ["timeline", "search", "favorites", "me"];

/** Each section's first page. */
const rootOf = (s: Section): Route =>
  s === "timeline" ? { name: "timeline" } : s === "search" ? { name: "search" } : s === "favorites" ? { name: "favorites" } : { name: "profile", me: true };

/** The section's stacks; on a phone only the timeline's, which is the app's one stack. */
export const stacks: Record<Section, NavStackState<Route>> = {
  timeline: createNavStack<Route>([rootOf("timeline")]),
  search: createNavStack<Route>([rootOf("search")]),
  favorites: createNavStack<Route>([rootOf("favorites")]),
  me: createNavStack<Route>([rootOf("me")]),
};

/** The section the list column shows (always the timeline on a phone). */
export const section = signal<Section>("timeline");

/** The sections opened so far: their stacks stay mounted, so each keeps its pages and scroll. */
export const visited = signal<ReadonlySet<Section>>(new Set(["timeline"]));

/** Shows a section in the list column; choosing the one that shows goes back to its first page. */
export function showSection(s: Section) {
  if (!WIDE) {
    if (s !== "timeline") nav.push(rootOf(s));
    return;
  }
  if (section() === s) stacks[s].popToRoot();
  section.set(s);
  if (!visited().has(s)) visited.set(new Set([...visited(), s]));
}

/** The stack the list column shows: the app's one stack on a phone. */
const list = () => stacks[section()];

/** The list column's stack (the app's one on a phone), whichever section shows. */
export const nav: NavStackState<Route> = {
  routes: () => list().routes(),
  push: (route) => list().push(route),
  pop: (count) => list().pop(count),
  popToRoot: () => list().popToRoot(),
  replace: (route) => list().replace(route),
  setRoutes: (routes) => list().setRoutes(routes),
  remove: (route) => list().remove(route),
};

/** The Mac's detail column: a post, its replies and versions over it. */
export const detail = createNavStack<Route>([{ name: "blank" }]);

/** The stack a page is in, for its back button: the list column's, unless the page says. */
export const PageStack = context<NavStackState<Route>>(nav);

/** The routes the Mac's detail column shows. */
const inDetail = (route: Route) => route.name === "post" || route.name === "replies" || route.name === "edits";

/**
 * Opens a page. On the Mac a post a list's press opens takes the detail column's place, and one
 * opened from the detail column (`from`, the stack of the page pressed: a repost, a link in a
 * post) stacks over the post there; a post's replies and versions stack there too, and every
 * other page opens in the list column.
 */
function go(route: Route, from?: NavStackState<Route>) {
  if (!WIDE || !inDetail(route)) return nav.push(route);
  showDetail();
  if (route.name === "post" && from !== detail) detail.setRoutes([route]);
  else detail.push(route);
}

/** The post the detail column shows from its first page: its card in a list is marked (none
 * while the column is hidden). */
export const selectedPost = () => {
  if (!WIDE || !detailShown()) return undefined;
  const first = detail.routes()[0];
  return first?.name === "post" ? first.id : undefined;
};

/** What the menu bar's Refresh does: the timeline's top button, which the timeline gives. */
export const timelineTop: { run?: () => void } = {};

/** Back to the first pages, as a sign-out leaves the app. */
export function resetNav() {
  for (const s of SECTIONS) stacks[s].setRoutes([rootOf(s)]);
  detail.setRoutes([{ name: "blank" }]);
  section.set("timeline");
  visited.set(new Set(["timeline"]));
}

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
export function openPost(status: Status, from?: NavStackState<Route>) {
  if (opening()) return;
  const push = (s: Status) => {
    posts.set(s.id, s);
    go({ name: "post", id: s.id }, from);
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
export const openPostById = (id: string, from?: NavStackState<Route>) => {
  if (id) go({ name: "post", id }, from);
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
  go({ name: "replies", postId: status.id, commentId: comment.id });
}

export const commentById = (id: string) => commentsById.get(id);

/** The versions of an edited post. */
export function openEdits(status: Status) {
  posts.set(status.id, status);
  go({ name: "edits", id: status.id });
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
export const openMe = () => showSection("me");

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
export const openFavorites = () => showSection("favorites");

/** Search, from the timeline. */
export const openSearch = () => showSection("search");

/** What `q` finds, over the search page. */
export const openSearchResults = (q: string) => {
  const query = q.trim();
  if (query) nav.push({ name: "search-results", q: query });
};

/** Search within `user`'s posts. */
export const openProfileSearch = (user: User) => {
  if (user.id) nav.push({ name: "profile-search", uid: user.id, userName: user.name });
};
