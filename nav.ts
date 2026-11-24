// The navigation stacks and the posts pages pass along: a post page reads the post the timeline
// already has instead of fetching it again.
//
// On a wide screen (an iPhone Duo open, an iPad) the app is a book of two pages split at the
// middle, where the Duo folds: the list stack (`nav`) at the left, and at the right the reader
// (`reader`), which holds the post being read, its replies and its versions. Elsewhere the reader
// is not shown and every page goes on `nav`.
import { computed, context, platform, safeArea, signal, windowSize } from "nsh";
import { createNavStack, type NavStackState } from "nsh/base";
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
  | { name: "search-results"; q: string }
  /** Search within one account's posts, from their profile (their name for the field's hint). */
  | { name: "profile-search"; uid: string; userName?: string }
  /** The reader before a post is picked, on a wide screen. */
  | { name: "unopened" };

export const nav = createNavStack<Route>([{ name: "timeline" }]);

/** The right page of a wide screen: what is read (a post, its replies, its versions). */
export const reader = createNavStack<Route>([{ name: "unopened" }]);

/** The narrowest window that shows two pages: each page at least as wide as a large phone. */
const WIDE_MIN_WIDTH = 700;
/** And the shortest: a phone turned on its side is wide but too short for two pages. */
const WIDE_MIN_HEIGHT = 500;

/** The screen shows two pages: the list and the reader. */
export const wide = computed(() => windowSize().width >= WIDE_MIN_WIDTH && windowSize().height >= WIDE_MIN_HEIGHT);

/**
 * Whether the system's vertical bar runs down the screen's edge beside `stack`: on an iPhone Duo,
 * closed (the outer screen), and open on its side next to the reader. iOS moves the status bar
 * and the system header's buttons there, so a page beside it shows its back button and actions as
 * the system's (`Page`'s `actions`) instead of the app's glass header. Elsewhere, and on an iPhone
 * turned on its side (wide, not tall), the edge is only the notch's.
 */
export function inStrip(stack: NavStackState<Route>) {
  if (platform.os !== "ios" || safeArea().right <= 0) return false;
  return wide() ? stack === reader : windowSize().height > windowSize().width;
}

/** The stack a page is in, given by the column it shows in: its back button pops that stack. */
export const Column = context<NavStackState<Route>>(nav);

/** The routes the reader takes on a wide screen. */
const READS = new Set<Route["name"]>(["post", "replies", "edits"]);
export const reads = (route: Route) => READS.has(route.name);

/** The column the last touch went down in: a post opened from the reader stacks on it, one opened
 * from the list replaces what the reader showed. */
let touched: NavStackState<Route> = nav;
export const touchColumn = (stack: NavStackState<Route>) => {
  touched = stack;
};

/** Opens a page: on a wide screen what is read goes to the reader, the rest to the list. */
function go(route: Route) {
  if (!wide() || !reads(route)) return nav.push(route);
  if (touched === reader) reader.push(route);
  else reader.setRoutes([route]);
}

/**
 * Moves the pages between one stack and two as the screen turns wide or narrow (the Duo opens or
 * closes): opened, the pages from the first one read onwards go to the reader; closed, the
 * reader's pages go on top of the list's, so the post being read stays in front.
 */
export function fitColumns(isWide: boolean) {
  if (isWide) {
    const routes = nav.routes();
    const at = routes.findIndex(reads);
    if (at < 1) return;
    reader.setRoutes(routes.slice(at));
    nav.setRoutes(routes.slice(0, at));
  } else {
    const read = reader.routes().filter((r) => r.name !== "unopened");
    if (!read.length) return;
    nav.setRoutes([...nav.routes(), ...read]);
    reader.setRoutes([{ name: "unopened" }]);
  }
  touched = nav;
}

/** The id the reader's first page shows, on a wide screen: its post's card in the list says so. */
export const readingId = computed(() => {
  const first = reader.routes()[0];
  return wide() && first?.name === "post" ? first.id : null;
});

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
    go({ name: "post", id: s.id });
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
  if (id) go({ name: "post", id });
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
  if (uid) go({ name: "profile", uid });
};

/** The profile of an `@name` mention. */
export const openProfileByName = (screenName: string) => {
  if (screenName) go({ name: "profile", screenName });
};

/** The posts of a `#topic#`. */
export const openTopic = (topic: string) => {
  const name = topic.replace(/^#|#$/g, "").trim();
  if (name) go({ name: "topic", topic: name });
};

/** My own profile. */
export const openMe = () => go({ name: "profile", me: true });

/** Who `user` follows, or who follows `user`. */
export const openPeople = (user: User, kind: "following" | "followers") => {
  if (user.id)
    go({
      name: "people",
      uid: user.id,
      kind,
      userName: user.name,
      followingCount: user.followingCount,
      followersCount: user.followersCount,
    });
};

/** The posts I saved (收藏). */
export const openFavorites = () => go({ name: "favorites" });

/** Search, from the timeline. */
export const openSearch = () => go({ name: "search" });

/** What `q` finds, over the search page. */
export const openSearchResults = (q: string) => {
  const query = q.trim();
  if (query) go({ name: "search-results", q: query });
};

/** Search within `user`'s posts. */
export const openProfileSearch = (user: User) => {
  if (user.id) go({ name: "profile-search", uid: user.id, userName: user.name });
};
