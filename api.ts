// weibo.com's web API (the endpoints weibo.com's own client calls), mapped to the few fields the
// app shows. Undocumented and subject to change: every endpoint lives here, and mapping reads
// fields defensively so a renamed field degrades one value instead of a screen.
import { t } from "nsh/i18n";
import { get, getSearchPage, post } from "./bridge";

export interface User {
  id: string;
  name: string;
  avatar: string;
  verified?: string;
  description?: string;
  location?: string;
  followersCount?: number;
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
  pics: Pic[];
  video?: Video;
  /** What the post's short links (`http://t.cn/...`) stand for, by short link. */
  links: Record<string, Link>;
  retweeted?: Status;
}

export interface Video {
  /** An mp4 to play. */
  src: string;
  poster: string;
  title: string;
  /** Seconds. */
  duration: number;
  portrait: boolean;
}

export interface Link {
  /** What Weibo shows in place of the short link: "网页链接", "xxx的微博视频", "查看图片". */
  title: string;
  /** Where it goes, for a browser. */
  url: string;
  /** The link is the post's own video. */
  video: boolean;
  /** The pictures the link shows ("查看图片", a comment's pictures). */
  pics?: Pic[];
}

export interface Pic {
  thumb: string;
  large: string;
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
  /** Its short links, by short link; picture links carry the pictures. */
  links: Record<string, Link>;
  /** Its pictures (Weibo attaches them as "查看图片" links). */
  pics: Pic[];
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
    followersCount: u?.followers_count === undefined ? undefined : num(u.followers_count),
    followingCount: u?.friends_count === undefined ? undefined : num(u.friends_count),
    posts: u?.statuses_count === undefined ? undefined : num(u.statuses_count),
    following: u?.following === undefined ? undefined : !!u.following,
    followsMe: u?.follow_me === undefined ? undefined : !!u.follow_me,
  };
}

const https = (url: string) => url.replace(/^http:\/\//, "https://");

/** A post's video (`page_info` of type video), at 720p or below where Weibo lists qualities. */
function toVideo(info: any): Video | undefined {
  const media = info?.media_info;
  if (!media || (info?.object_type && info.object_type !== "video")) return undefined;
  const plays: any[] = (Array.isArray(media.playback_list) ? media.playback_list : [])
    .map((p: any) => p?.play_info)
    .filter((p: any) => p?.url && (p.mime === "video/mp4" || /\.mp4/.test(p.url)));
  const best = plays.filter((p) => num(p.height) && Math.min(num(p.width), num(p.height)) <= 720).sort(
    (a, b) => Math.min(num(b.width), num(b.height)) - Math.min(num(a.width), num(a.height)),
  )[0] ?? plays[0];
  const src = str(best?.url || media.mp4_720p_mp4 || media.mp4_hd_url || media.stream_url_hd || media.mp4_sd_url || media.stream_url);
  if (!src) return undefined;
  const w = num(best?.width), h = num(best?.height);
  return {
    src: https(src),
    poster: https(str(info.page_pic?.url ?? info.page_pic)),
    title: str(media.kol_title || media.name || info.page_title || info.content1),
    duration: num(media.duration),
    portrait: w && h ? h > w : media.video_orientation === "vertical",
  };
}

const pic = (id: string, info: any): Pic => ({
  thumb: https(str(info?.bmiddle?.url || info?.thumbnail?.url) || `https://wx1.sinaimg.cn/orj360/${id}.jpg`),
  large: https(str(info?.largest?.url || info?.large?.url) || `https://wx1.sinaimg.cn/large/${id}.jpg`),
});

function toLinks(structs: unknown): Record<string, Link> {
  const links: Record<string, Link> = {};
  for (const u of Array.isArray(structs) ? structs : []) {
    const short = str(u?.short_url);
    if (!short) continue;
    // A browser can't open `sinaweibo://` (the Weibo app's own links): use the web address.
    const url = [u?.long_url, u?.h5_target_url, u?.ori_url].map(str).find((v) => /^https?:/.test(v)) ?? short;
    // `url_type` 39 marks pictures as well as videos: tell them apart by what they point at.
    const video = u?.object_type === "video" || /video/.test(str(u?.ori_url));
    const ids: string[] = Array.isArray(u?.pic_ids) ? u.pic_ids.map(str) : [];
    const pics = ids.length ? ids.map((id) => pic(id, u?.pic_infos?.[id])) : undefined;
    links[short] = { title: str(u?.url_title) || "网页链接", url, video, pics };
  }
  return links;
}

function toStatus(s: any): Status {
  const ids: string[] = Array.isArray(s?.pic_ids) ? s.pic_ids : [];
  const infos = s?.pic_infos ?? {};
  // Posts of pictures and videos together list both in `mix_media_info`.
  const mix: any[] = Array.isArray(s?.mix_media_info?.items) ? s.mix_media_info.items : [];
  const pics = ids.length
    ? ids.map((id) => pic(id, infos[id]))
    : mix.filter((m) => m?.type === "pic").map((m) => pic(str(m.id), m.data));
  const retweeted = s?.retweeted_status ? toStatus(s.retweeted_status) : undefined;
  let video = toVideo(s?.page_info) ?? toVideo(mix.find((m) => m?.type === "video")?.data);
  // A repost carries the reposted post's video as its own: show it once, in the reposted post.
  if (video && retweeted?.video && (video.src === retweeted.video.src || video.poster === retweeted.video.poster)) {
    video = undefined;
  }
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
    pics,
    video,
    links: toLinks(s?.url_struct),
    retweeted,
  };
}

function toComment(c: any): Comment {
  const text = str(c?.text_raw) || stripTags(str(c?.text));
  // A reply's `url_struct` repeats the links of the comment it replies to: keep its own, those
  // its text has, or the parent's pictures show again under each reply.
  const links = Object.fromEntries(Object.entries(toLinks(c?.url_struct)).filter(([short]) => text.includes(short)));
  return {
    id: str(c?.idstr ?? c?.id),
    text,
    createdAt: str(c?.created_at),
    user: toUser(c?.user),
    likes: num(c?.like_counts),
    replyCount: num(c?.total_number),
    preview: Array.isArray(c?.comments) ? c.comments.map(toComment) : [],
    replyTo: c?.reply_comment?.user?.screen_name ? str(c.reply_comment.user.screen_name) : undefined,
    replyToUid: str(c?.reply_comment?.user?.idstr ?? c?.reply_comment?.user?.id) || undefined,
    links,
    pics: Object.values(links).flatMap((l) => l.pics ?? []),
  };
}

// Weibo's cursors are "0" (or absent) at the end.
const cursor = (v: unknown) => (v === undefined || v === null || str(v) === "0" || str(v) === "" ? null : str(v));

// The "最新微博" (latest posts) group: the accounts I follow, strictly newest first. The default
// "全部关注" feed (`unreadfriendstimeline`) ranks posts by its own order and mixes in posts that
// people I follow liked; this one does neither. Its gid is `11000<my uid>` today, but read it from
// the group list by title in case that changes.
// The group list, read once: it names the 最新微博 group and, in each group's `uid`, me.
let groupList: Promise<{ latestGid: string; uid: string }> | undefined;

function groupInfo(): Promise<{ latestGid: string; uid: string }> {
  groupList ??= get(`/ajax/feed/allGroups?is_new_segment=1&fetch_hot=1`)
    .then((json) => {
      const groups: any[] = (json.groups ?? []).flatMap((g: any) => g?.group ?? []);
      const uid = str(groups.find((g) => g?.uid)?.uid);
      const latest = groups.find((g) => g?.title === "最新微博");
      if (!latest?.gid && !uid) throw new Error("Weibo's group list has no 最新微博 group");
      return { latestGid: latest?.gid ? str(latest.gid) : `11000${uid}`, uid };
    })
    .catch((e) => {
      groupList = undefined; // Ask again next time.
      throw e;
    });
  return groupList;
}

const latestGroup = () => groupInfo().then((g) => g.latestGid);

/** My uid (the signed-in account's). */
export const myUid = () =>
  groupInfo().then((g) => {
    if (!g.uid) throw new Error("Weibo's group list does not name the signed-in account");
    return g.uid;
  });

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

/** A post's full text and its links, for `isLongText` posts whose `text` is cut. */
export async function longText(mblogid: string): Promise<{ text: string; links: Record<string, Link> } | null> {
  const json = await get(`/ajax/statuses/longtext?id=${encodeURIComponent(mblogid)}`);
  // The full text has links the cut one does not: they come with it.
  return json.data?.longTextContent
    ? { text: str(json.data.longTextContent), links: toLinks(json.data.url_struct) }
    : null;
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
  /** What weibo.com shows in place of the posts while I block them ("你已将对方拉黑…"). */
  message?: string;
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
  // The profile answer says it outright: `block: true` and a `blockText` ("你已将对方拉黑…") while
  // I block them; neither (an empty `blockText`) otherwise.
  const data = root as { block?: unknown; blockText?: unknown } | null;
  if (data && "blockText" in data) blocked = data.block === true || !!data.blockText;
  const message = typeof data?.blockText === "string" && data.blockText ? data.blockText : undefined;
  return { blocked, evidence, message };
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
      if (!id) throw new Error(json.msg ? `@${name}: ${json.msg}` : t("profile.no_such_name", { name }));
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

/** One post by id (`mid`). */
export async function status(id: string): Promise<Status> {
  return toStatus(await get(`/ajax/statuses/show?id=${encodeURIComponent(id)}&locale=zh-CN`));
}

// Runs `f` over `items`, `limit` at a time, keeping their order.
async function mapLimit<T, R>(items: T[], limit: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await f(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * The posts of a topic (`#name#`), as s.weibo.com's search lists them (its default order, real
 * time first); pages count from 1. weibo.com has no JSON for topics: read the posts' ids from the
 * search page, then each post from weibo.com's API, a few at a time.
 */
export async function topicPosts(topic: string, page = 1): Promise<Page<Status, number>> {
  const q = `#${topic.replace(/^#|#$/g, "")}#`;
  const html = await getSearchPage(`/weibo?q=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ""}`);
  const ids = [...new Set([...html.matchAll(/\bmid="(\d{10,})"/g)].map((m) => m[1]))];
  const posts = await mapLimit(ids, 4, (id) => status(id).catch(() => null));
  const pages = [...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1]));
  const last = Math.max(page, ...pages);
  return { items: posts.filter((p): p is Status => !!p), next: ids.length && page < last ? page + 1 : null };
}

// Writes, as weibo.com's own client sends them (its profile page's buttons). Their answers do not
// say the new state reliably (`friendships/create` answers `following: false`): read the profile
// again after one.

/** Follows an account. */
export async function follow(uid: string): Promise<void> {
  await post("/ajax/friendships/create", { friend_uid: uid, page: "profile", lpage: "profile" });
}

/** Unfollows an account. (`destory`: Weibo's spelling.) */
export async function unfollow(uid: string): Promise<void> {
  await post("/ajax/friendships/destory", { uid });
}

/**
 * Blocks an account (拉黑): hides their posts, stops their interactions with me and their
 * following me, as weibo.com's "加入黑名单" with every box ticked. It ends my following them too.
 */
export async function block(uid: string): Promise<void> {
  await post("/ajax/statuses/filterUser", { uid, status: "1", interact: "1", follow: "1" });
}

/** Unblocks an account (解除黑名单). Following them again is a separate `follow`. */
export async function unblock(uid: string): Promise<void> {
  await post("/ajax/statuses/deleteFilters", { uid });
}

/** Accounts an account follows (`following`) or that follow it (`followers`); pages count from 1. */
export async function people(uid: string, kind: "following" | "followers", page = 1): Promise<Page<User, number>> {
  const q =
    kind === "followers"
      ? `relate=fans&page=${page}&uid=${encodeURIComponent(uid)}&type=fans&newFollowerCount=0`
      : `uid=${encodeURIComponent(uid)}&page=${page}`;
  const json = await get(`/ajax/friendships/friends?${q}`);
  const users: any[] = Array.isArray(json.users) ? json.users : [];
  // `next_cursor` is 0 on the last page.
  return { items: users.map(toUser), next: users.length && num(json.next_cursor) ? page + 1 : null };
}
