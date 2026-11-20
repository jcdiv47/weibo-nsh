// weibo.com's web API (the endpoints weibo.com's own client calls), mapped to the few fields the
// app shows. Undocumented and subject to change: every endpoint lives here, and mapping reads
// fields defensively so a renamed field degrades one value instead of a screen.
import { get } from "./bridge";

export interface User {
  id: string;
  name: string;
  avatar: string;
  verified?: string;
  description?: string;
  location?: string;
  followers?: string;
  followingCount?: number;
  posts?: number;
  /** I follow them. */
  following?: boolean;
  /** They follow me. */
  followsMe?: boolean;
}

export interface Status {
  id: string;
  mblogid: string;
  text: string;
  isLongText: boolean;
  createdAt: string;
  source?: string;
  region?: string;
  user: User;
  reposts: number;
  comments: number;
  likes: number;
  pics: { thumb: string; large: string }[];
  retweeted?: Status;
}

export interface Comment {
  id: string;
  text: string;
  createdAt: string;
  user: User;
  likes: number;
  /** Replies to this comment, of which `preview` is the first few. */
  replyCount: number;
  preview: Comment[];
  /** The author of the comment this replies to (in a thread of replies): name and uid. */
  replyTo?: string;
  replyToUid?: string;
}

/** A page of items and the cursor of the next, `null` at the end. */
export interface Page<T, C = string> {
  items: T[];
  next: C | null;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const stripTags = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

export function toUser(u: any): User {
  return {
    id: str(u?.idstr ?? u?.id),
    name: str(u?.screen_name) || "(unknown)",
    avatar: str(u?.avatar_large || u?.avatar_hd || u?.profile_image_url),
    verified: u?.verified ? str(u?.verified_reason) || "Verified" : undefined,
    description: str(u?.description) || undefined,
    location: str(u?.location) || undefined,
    followers: str(u?.followers_count_str ?? u?.followers_count) || undefined,
    followingCount: u?.friends_count === undefined ? undefined : num(u.friends_count),
    posts: u?.statuses_count === undefined ? undefined : num(u.statuses_count),
    following: u?.following === undefined ? undefined : !!u.following,
    followsMe: u?.follow_me === undefined ? undefined : !!u.follow_me,
  };
}

function toStatus(s: any): Status {
  const ids: string[] = Array.isArray(s?.pic_ids) ? s.pic_ids : [];
  const infos = s?.pic_infos ?? {};
  return {
    id: str(s?.idstr ?? s?.id),
    mblogid: str(s?.mblogid),
    text: str(s?.text_raw) || stripTags(str(s?.text)),
    isLongText: !!s?.isLongText,
    createdAt: str(s?.created_at),
    source: stripTags(str(s?.source)) || undefined,
    region: str(s?.region_name).replace(/^发布于\s*/, "") || undefined,
    user: toUser(s?.user),
    reposts: num(s?.reposts_count),
    comments: num(s?.comments_count),
    likes: num(s?.attitudes_count),
    pics: ids.map((id) => ({
      thumb: str(infos[id]?.bmiddle?.url || infos[id]?.thumbnail?.url) || `https://wx1.sinaimg.cn/orj360/${id}.jpg`,
      large: str(infos[id]?.largest?.url || infos[id]?.large?.url) || `https://wx1.sinaimg.cn/large/${id}.jpg`,
    })),
    retweeted: s?.retweeted_status ? toStatus(s.retweeted_status) : undefined,
  };
}

function toComment(c: any): Comment {
  return {
    id: str(c?.idstr ?? c?.id),
    text: str(c?.text_raw) || stripTags(str(c?.text)),
    createdAt: str(c?.created_at),
    user: toUser(c?.user),
    likes: num(c?.like_counts),
    replyCount: num(c?.total_number),
    preview: Array.isArray(c?.comments) ? c.comments.map(toComment) : [],
    replyTo: c?.reply_comment?.user?.screen_name ? str(c.reply_comment.user.screen_name) : undefined,
    replyToUid: str(c?.reply_comment?.user?.idstr ?? c?.reply_comment?.user?.id) || undefined,
  };
}

// Weibo's cursors are "0" (or absent) at the end.
const cursor = (v: unknown) => (v === undefined || v === null || str(v) === "0" || str(v) === "" ? null : str(v));

// The "最新微博" (latest posts) group: the accounts I follow, strictly newest first. The default
// "全部关注" feed (`unreadfriendstimeline`) ranks posts by its own order and mixes in posts that
// people I follow liked; this one does neither. Its gid is `11000<my uid>` today, but read it from
// the group list by title in case that changes.
let latestGid: Promise<string> | undefined;

function latestGroup(): Promise<string> {
  latestGid ??= get(`/ajax/feed/allGroups?is_new_segment=1&fetch_hot=1`)
    .then((json) => {
      const groups: any[] = (json.groups ?? []).flatMap((g: any) => g?.group ?? []);
      const latest = groups.find((g) => g?.title === "最新微博");
      if (latest?.gid) return str(latest.gid);
      const uid = str(groups.find((g) => g?.uid)?.uid);
      if (!uid) throw new Error("Weibo's group list has no 最新微博 group");
      return `11000${uid}`;
    })
    .catch((e) => {
      latestGid = undefined; // Ask again next time.
      throw e;
    });
  return latestGid;
}

// The latest feed still carries ads (`readtimetype: "adMblog"`, a `promotion` block) from accounts
// I don't follow; drop them, and anything else from an account I don't follow (my own posts aside).
function isFromFollowed(s: any, gid: string): boolean {
  if (s?.readtimetype === "adMblog" || s?.promotion || s?.isAd === 1 || s?.isAd === true || s?.mblogtype === 1) return false;
  const uid = str(s?.user?.idstr ?? s?.user?.id);
  return s?.user?.following !== false || gid === `11000${uid}`;
}

/** The timeline of the accounts I follow, newest first; `maxId` continues an earlier page. */
export async function friendsTimeline(maxId?: string): Promise<Page<Status>> {
  const gid = await latestGroup();
  let next: string | null = maxId ?? null;
  // A page of nothing but ads must neither end the feed nor stall it (no new rows, so no further
  // load-more): read on, a few pages at most.
  for (let tries = 0; tries < 3; tries++) {
    const q = `list_id=${gid}&refresh=4&since_id=0&count=20&fid=${gid}${next ? `&max_id=${encodeURIComponent(next)}` : ""}`;
    const json = await get(`/ajax/feed/friendstimeline?${q}`);
    const raw: any[] = json.statuses ?? [];
    next = raw.length ? cursor(json.max_id_str ?? json.max_id) : null;
    const items = raw.filter((s) => isFromFollowed(s, gid)).map(toStatus);
    if (items.length || !next) return { items, next };
  }
  return { items: [], next };
}

/** A post's full text, for `isLongText` posts whose `text` is cut. */
export async function longText(mblogid: string): Promise<string | null> {
  const json = await get(`/ajax/statuses/longtext?id=${encodeURIComponent(mblogid)}`);
  return json.data?.longTextContent ? str(json.data.longTextContent) : null;
}

/** A post's comments, hottest first; `maxId` continues an earlier page. */
export async function comments(status: Status, maxId?: string): Promise<Page<Comment>> {
  const q =
    `is_reload=1&id=${status.id}&is_show_bulletin=2&is_mix=0&count=20&uid=${status.user.id}&fetch_level=0&locale=zh-CN` +
    (maxId ? `&flow=0&max_id=${encodeURIComponent(maxId)}` : "");
  const json = await get(`/ajax/statuses/buildComments?${q}`);
  return { items: (json.data ?? []).map(toComment), next: cursor(json.max_id) };
}

/** The replies to one comment (its thread), oldest first. */
export async function replies(comment: Comment, statusUid: string, maxId?: string): Promise<Page<Comment>> {
  const q =
    `is_reload=1&id=${comment.id}&is_show_bulletin=2&is_mix=1&fetch_level=1&count=20&uid=${statusUid}&locale=zh-CN` +
    `&max_id=${maxId ? encodeURIComponent(maxId) : "0"}`;
  const json = await get(`/ajax/statuses/buildComments?${q}`);
  return { items: (json.data ?? []).map(toComment), next: cursor(json.max_id) };
}

/** Whether I block an account, as far as the profile answer tells. */
export interface BlockState {
  /** `null`: the answer carries no field that says. */
  blocked: boolean | null;
  /** The fields it was read from, `path=value`. */
  evidence: string[];
}

export interface Profile {
  user: User;
  block: BlockState;
  /** The answer as it came, for finding fields this POC does not read yet. */
  raw: unknown;
}

// No public documentation names weibo.com's block flag. Collect every field that looks like one
// (`block`, `blocked`, `is_block`, `blacklist`, ...) so the profile screen shows what the answer
// carries; read a boolean or 0/1 from them.
function findBlock(root: unknown): BlockState {
  const evidence: string[] = [];
  let blocked: boolean | null = null;
  const walk = (v: unknown, path: string, depth: number) => {
    if (!v || typeof v !== "object" || depth > 3) return;
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      if (/block|black/i.test(k) && (typeof child !== "object" || child === null)) {
        evidence.push(`${p}=${JSON.stringify(child)}`);
        if (typeof child === "boolean") blocked = (blocked ?? false) || child;
        else if (child === 0 || child === 1) blocked = (blocked ?? false) || child === 1;
      } else walk(child, p, depth + 1);
    }
  };
  walk(root, "", 0);
  return { blocked, evidence };
}

export async function profile(uid: string): Promise<Profile> {
  const json = await get(`/ajax/profile/info?uid=${encodeURIComponent(uid)}`);
  return { user: toUser(json.data?.user), block: findBlock(json.data), raw: json.data };
}

// Names to uids, as `@name` mentions in posts carry only the name.
const uids = new Map<string, Promise<string>>();

/** The uid of the account with this screen name; rejects when no account has it. */
export function uidByName(name: string): Promise<string> {
  let uid = uids.get(name);
  if (!uid) {
    uid = get(`/ajax/profile/info?screen_name=${encodeURIComponent(name)}`).then((json) => {
      const id = str(json.data?.user?.idstr ?? json.data?.user?.id);
      if (!id) throw new Error(json.msg ? `@${name}: ${json.msg}` : `No account is named @${name}`);
      return id;
    });
    uid.catch(() => uids.delete(name)); // Ask again next time.
    uids.set(name, uid);
  }
  return uid;
}

/** An account's own posts, newest first; pages count from 1. */
export async function userPosts(uid: string, page = 1): Promise<Page<Status, number>> {
  const json = await get(`/ajax/statuses/mymblog?uid=${encodeURIComponent(uid)}&page=${page}&feature=0`);
  const list = json.data?.list ?? [];
  return { items: list.map(toStatus), next: list.length ? page + 1 : null };
}
