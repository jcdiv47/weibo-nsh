// weibo.com's web API (the endpoints weibo.com's own client calls), mapped to the few fields the
// app shows. Undocumented and subject to change: every endpoint lives here, and mapping reads
// fields defensively so a renamed field degrades one value instead of a screen. Each endpoint's
// answer goes through a `parse...` function (tested against `tests/fixtures/`), which checks it
// with `drift.ts`: an answer that no longer fits throws `WeiboChanged` instead of showing nothing.
import { t } from "nsh/i18n";
import { forgetInMemory } from "./account";
import { get, getSearchPage, NotSignedIn, post, weibo } from "./bridge";
import { items, list, one, reportDrift, shapes, WeiboChanged } from "./drift";
import { batchEmoticons, learnFromHtml, loadEmoticons } from "./emoticons";
import { clearSaved, loadSaved, save } from "./saved";

export interface User {
  id: string;
  name: string;
  avatar: string;
  /** Why Weibo verified them (`verified_reason`), when it did. */
  verified?: string;
  /** Which badge Weibo gives them, when verified (`verifiedKind`). */
  verifiedKind?: VerifiedKind;
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
  /** I liked it (`attitudes_status`). */
  liked: boolean;
  pics: Pic[];
  video?: Video;
  /** What the post's short links (`http://t.cn/...`) stand for, by short link. */
  links: Record<string, Link>;
  retweeted?: Status;
  /** Times the author edited it since posting (`edit_count`); its versions: `editHistory`. */
  editCount: number;
  /** I saved it to my favorites (收藏, `favorited`). */
  favorited: boolean;
  /** Not their post: one the account commented on or liked, which Weibo mixes into their profile's
   * posts ("她1小时前评论过的微博"). */
  activity?: Activity;
  /** The account pinned it to the top of their profile's posts (置顶, `isTop`). */
  pinned?: boolean;
}

export interface Activity {
  kind: "comment" | "like";
  /** When (ms since the epoch), as near as Weibo says it ("1小时前", "11-18"), if it says. */
  at?: number;
}

export interface Video {
  /** An mp4 to play. */
  src: string;
  poster: string;
  title: string;
  /** Seconds. */
  duration: number;
  portrait: boolean;
  /** The sizes Weibo has it in, best first (`src` among them): the player switches between them,
   * saving takes the best. */
  qualities: Quality[];
}

/** A size of a video: its label ("1080p"), its mp4, its shorter side in pixels (0: unknown). */
export interface Quality {
  label: string;
  url: string;
  height: number;
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
  /** The Weibo post the link points at ("微博正文", "xxx的微博"), by its id or mblogid: opens in the app. */
  post?: string;
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
  /** I liked it. */
  liked: boolean;
  /** Where it was sent from ("广东"): Weibo's `source`, "来自广东". */
  region?: string;
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
// Weibo escapes `&`, `<`, `>` and quotes even in its plain text (`text_raw`, the long text):
// "Fix & Fax" comes as "Fix &amp; Fax". `&amp;` goes last, or "&amp;lt;" would read as "<".
const decodeEntities = (text: string) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const stripTags = (html: string) =>
  decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "$1")
      .replace(/<[^>]+>/g, ""),
  );

/**
 * Weibo's verification badges: `personal` an individual's orange V (`verified_type` 0), `gold`
 * a widely followed individual's gold V (0 with `verified_type_ext` 1 or more), `org` an
 * organization's blue V (1–7: government, company, media, campus, website, app, group), `talent`
 * a 达人 (200, 220). Another type of a verified account counts as `personal`.
 */
export type VerifiedKind = "personal" | "gold" | "org" | "talent";

export function verifiedKind(u: any): VerifiedKind | undefined {
  if (!u?.verified) return undefined;
  const type = num(u.verified_type);
  if (type >= 1 && type <= 7) return "org";
  if (type === 200 || type === 220) return "talent";
  return num(u.verified_type_ext) >= 1 ? "gold" : "personal";
}

export function toUser(u: any): User {
  return {
    id: str(u?.idstr ?? u?.id),
    name: str(u?.screen_name) || "(unknown)",
    avatar: str(u?.avatar_large || u?.avatar_hd || u?.profile_image_url),
    verified: u?.verified ? str(u?.verified_reason) || "Verified" : undefined,
    verifiedKind: verifiedKind(u),
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
  const side = (p: any) => Math.min(num(p.width), num(p.height));
  // Each size once, the best first; the old single fields when Weibo lists none.
  const qualities: Quality[] = [];
  for (const p of [...plays].sort((a, b) => side(b) - side(a))) {
    const height = side(p);
    if (qualities.some((q) => q.height === height)) continue;
    const label = str(p.quality_label) || (height ? `${height}p` : str(p.quality_desc) || "MP4");
    qualities.push({ label, url: https(str(p.url)), height });
  }
  if (!qualities.length) qualities.push({ label: "MP4", url: https(src), height: 0 });
  const w = num(best?.width), h = num(best?.height);
  return {
    src: https(src),
    poster: https(str(info.page_pic?.url ?? info.page_pic)),
    title: str(media.kol_title || media.name || info.page_title || info.content1),
    duration: num(media.duration),
    portrait: w && h ? h > w : media.video_orientation === "vertical",
    qualities,
  };
}

const pic = (id: string, info: any): Pic => ({
  thumb: https(str(info?.bmiddle?.url || info?.thumbnail?.url) || `https://wx1.sinaimg.cn/orj360/${id}.jpg`),
  large: https(str(info?.largest?.url || info?.large?.url) || `https://wx1.sinaimg.cn/large/${id}.jpg`),
});

// A post's id: its `mid` (digits) or its `mblogid` (9 letters and digits, never all lowercase,
// unlike a path such as `followers`).
const POST_ID = /^(\d{15,19}|(?=[A-Za-z0-9]*[A-Z0-9])[A-Za-z0-9]{9})$/;

/**
 * The post a URL points at, by id or mblogid, if it is one: `weibo.com/<uid>/<id>`,
 * `weibo.com/detail/<id>`, `m.weibo.cn/status/<id>` (or `/detail/`, `/<uid>/<id>`), and the Weibo
 * app's `sinaweibo://detail?mblogid=<id>` (or `?id=`).
 */
export function postIdOf(url: string): string | undefined {
  const app = /^sinaweibo:\/\/detail\/?\?(?:.*&)?(?:mblogid|id)=([A-Za-z0-9]+)/.exec(url);
  if (app) return POST_ID.test(app[1]) ? app[1] : undefined;
  const web = /^https?:\/\/(?:www\.|m\.)?weibo\.(?:com|cn)\/(\w+)\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/.exec(url);
  if (!web) return undefined;
  const [, first, id] = web;
  if (first !== "detail" && first !== "status" && !/^\d+$/.test(first)) return undefined;
  return POST_ID.test(id) ? id : undefined;
}

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
    const post = video ? undefined : [u?.long_url, u?.ori_url, u?.h5_target_url].map((v) => postIdOf(str(v))).find(Boolean);
    links[short] = { title: str(u?.url_title) || "网页链接", url, video, pics, ...(post ? { post } : {}) };
  }
  return links;
}

function toStatus(s: any): Status {
  learnFromHtml(str(s?.text));
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
    text: decodeEntities(str(s?.text_raw)) || stripTags(str(s?.text)),
    isLongText: !!s?.isLongText,
    createdAt: str(s?.created_at),
    source: stripTags(str(s?.source)) || undefined,
    region: str(s?.region_name).replace(/^发布于\s*/, "") || undefined,
    user: toUser(s?.user),
    reposts: num(s?.reposts_count),
    comments: num(s?.comments_count),
    likes: num(s?.attitudes_count),
    liked: num(s?.attitudes_status) === 1,
    pics,
    video,
    links: toLinks(s?.url_struct),
    retweeted,
    editCount: num(s?.edit_count),
    favorited: s?.favorited === true || s?.favorited === 1,
  };
}

function toComment(c: any): Comment {
  learnFromHtml(str(c?.text));
  const text = decodeEntities(str(c?.text_raw)) || stripTags(str(c?.text));
  // A reply's `url_struct` repeats the links of the comment it replies to: keep its own, those
  // its text has, or the parent's pictures show again under each reply.
  const links = Object.fromEntries(Object.entries(toLinks(c?.url_struct)).filter(([short]) => text.includes(short)));
  return {
    id: str(c?.idstr ?? c?.id),
    text,
    createdAt: str(c?.created_at),
    user: toUser(c?.user),
    likes: num(c?.like_counts),
    liked: c?.liked === true || c?.liked === 1,
    region: stripTags(str(c?.source)).replace(/^来自\s*/, "").trim() || undefined,
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
    .then(parseGroups)
    .then(
      (groups) => {
        save("groups", groups);
        return groups;
      },
      async (e) => {
        // Out of reach, or a list in a new shape: the account's group and uid have not changed.
        const saved = e instanceof NotSignedIn ? null : await loadSaved<{ latestGid: string; uid: string }>("groups");
        if (saved?.data.latestGid) return saved.data;
        groupList = undefined; // Ask again next time.
        throw e;
      },
    );
  return groupList;
}

export function parseGroups(json: any): { latestGid: string; uid: string } {
  const EP = "/ajax/feed/allGroups";
  const groups: any[] = list(EP, json, "groups").flatMap((g: any) => g?.group ?? []);
  const uid = str(groups.find((g) => g?.uid)?.uid);
  const latest = groups.find((g) => g?.title === "最新微博");
  if (!latest?.gid && !uid) {
    reportDrift(EP, ["groups[].group[].uid", "groups[].group[].gid"], json);
    throw new WeiboChanged(EP, ["groups[].group[].uid"]);
  }
  if (!latest?.gid) reportDrift(EP, ["最新微博 group"], json);
  return { latestGid: latest?.gid ? str(latest.gid) : `11000${uid}`, uid };
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
    const page = parseTimeline(await get(`/ajax/feed/friendstimeline?${q}`), gid);
    next = page.next;
    if (page.items.length || !next) return page;
  }
  return { items: [], next };
}

/** A page of the latest group's timeline, ads and accounts I don't follow left out. */
export function parseTimeline(json: any, gid: string): Page<Status> {
  const EP = "/ajax/feed/friendstimeline";
  const raw = list(EP, json, "statuses");
  if (raw.length && json.max_id_str === undefined && json.max_id === undefined) reportDrift(EP, ["max_id_str|max_id"], json);
  const next = raw.length ? cursor(json.max_id_str ?? json.max_id) : null;
  return { items: batchEmoticons(() => items(EP, raw.filter((s) => isFromFollowed(s, gid)), shapes.status).map(toStatus)), next };
}

/** Whether post id `a` is newer than `b`: Weibo's ids are numbers too long for a JS number, which
 * grow with time; a longer one is the larger. */
export function isNewerId(a: string, b: string): boolean {
  return a.length !== b.length ? a.length > b.length : a > b;
}

/** The posts of the timeline newer than the one shown first, and whether there are more of them
 * than came: what the new posts button counts (`news.ts`). */
export interface Newer {
  items: Status[];
  more: boolean;
}

const NEWER_COUNT = 20;

/** The posts newer than `sinceId` in the latest group, newest first, one request. */
export async function newerPosts(sinceId: string): Promise<Newer> {
  const gid = await latestGroup();
  const q = `list_id=${gid}&refresh=4&since_id=${encodeURIComponent(sinceId)}&count=${NEWER_COUNT}&fid=${gid}`;
  return parseNewer(await get(`/ajax/feed/friendstimeline?${q}`), gid, sinceId);
}

/** The answer to `since_id`, read as a timeline page. Weibo has answered with the newest page
 * whatever `since_id` said: only the posts newer than `sinceId` count either way. When every post
 * that came is new and the page is about full, more may be past it (`more`): showing them takes the
 * first page again, not these before the shown ones, which would leave a gap. */
export function parseNewer(json: any, gid: string, sinceId: string): Newer {
  const raw = list("/ajax/feed/friendstimeline", json, "statuses");
  const newer = raw.filter((s: any) => isNewerId(str(s?.idstr ?? s?.id), sinceId));
  const page = parseTimeline({ ...json, statuses: newer }, gid);
  return { items: page.items, more: newer.length > 0 && newer.length === raw.length && raw.length >= NEWER_COUNT / 2 };
}

/** Reads weibo.com's list of emoticons (`emoticons.ts`), once. Not through `get`: a failure here
 * leaves the codes as text, and must not ask for a sign-in. */
export const emoticonList = () =>
  loadEmoticons(async (path) => {
    const answer = await weibo.run(path);
    if (answer.status !== 200 || !answer.json) throw new Error(`Weibo answered ${answer.status} for ${path}`);
    return answer.json;
  });

/** A post's full text and its links, for `isLongText` posts whose `text` is cut. */
export async function longText(mblogid: string): Promise<{ text: string; links: Record<string, Link> } | null> {
  return parseLongText(await get(`/ajax/statuses/longtext?id=${encodeURIComponent(mblogid)}`));
}

export function parseLongText(json: any): { text: string; links: Record<string, Link> } | null {
  // Asked only of long posts: no text is a change of shape, but the cut text still reads.
  if (!json?.data?.longTextContent) {
    reportDrift("/ajax/statuses/longtext", ["data.longTextContent"], json);
    return null;
  }
  // The full text has links the cut one does not: they come with it.
  return { text: decodeEntities(str(json.data.longTextContent)), links: toLinks(json.data.url_struct) };
}

/** A post's comments, hottest first; `maxId` continues an earlier page. */
export async function comments(status: Status, maxId?: string): Promise<Page<Comment>> {
  const q =
    `is_reload=1&id=${status.id}&is_show_bulletin=2&is_mix=0&count=20&uid=${status.user.id}&fetch_level=0&locale=zh-CN` +
    (maxId ? `&flow=0&max_id=${encodeURIComponent(maxId)}` : "");
  return parseComments(await get(`/ajax/statuses/buildComments?${q}`));
}

/** A page of comments, or of a comment's replies. */
export function parseComments(json: any): Page<Comment> {
  const EP = "/ajax/statuses/buildComments";
  return { items: batchEmoticons(() => items(EP, list(EP, json, "data"), shapes.comment).map(toComment)), next: cursor(json.max_id) };
}

/** A post's reposts, newest first, each a post (its `retweeted` the post); pages count from 1. */
export async function reposts(status: Status, page = 1): Promise<Page<Status, number>> {
  return parseReposts(await get(`/ajax/statuses/repostTimeline?id=${status.id}&page=${page}&moduleID=feed&count=20`), page);
}

export function parseReposts(json: any, page: number): Page<Status, number> {
  const EP = "/ajax/statuses/repostTimeline";
  const raw = list(EP, json, "data");
  // `max_page` counts the pages. Without it, read on until a page is empty.
  if (raw.length && json.max_page === undefined) reportDrift(EP, ["max_page"], json);
  const more = json.max_page === undefined ? raw.length > 0 : page < num(json.max_page);
  return { items: batchEmoticons(() => items(EP, raw, shapes.status).map(toStatus)), next: raw.length && more ? page + 1 : null };
}

/** Who liked a post, latest first; pages count from 1. */
export async function likes(status: Status, page = 1): Promise<Page<User, number>> {
  return parseLikes(
    await get(`/ajax/statuses/likeShow?id=${status.id}&attitude_type=0&attitude_enable=1&page=${page}&count=20`),
    page,
  );
}

export function parseLikes(json: any, page: number): Page<User, number> {
  const EP = "/ajax/statuses/likeShow";
  // Each like is `{ user, attitude }`.
  const raw = list(EP, json, "data").map((like: any) => like?.user);
  // `total_number` counts the likes. Without it, read on until a page is empty.
  if (raw.length && json.total_number === undefined) reportDrift(EP, ["total_number"], json);
  const more = json.total_number === undefined ? raw.length > 0 : num(json.total_number) > page * raw.length;
  return { items: items(EP, raw, shapes.user).map(toUser), next: raw.length && more ? page + 1 : null };
}

/** The replies to one comment (its thread), oldest first. */
export async function replies(comment: Comment, statusUid: string, maxId?: string): Promise<Page<Comment>> {
  const q =
    `is_reload=1&id=${comment.id}&is_show_bulletin=2&is_mix=1&fetch_level=1&count=20&uid=${statusUid}&locale=zh-CN` +
    `&max_id=${maxId ? encodeURIComponent(maxId) : "0"}`;
  return parseComments(await get(`/ajax/statuses/buildComments?${q}`));
}

/**
 * Replies to a comment, or to a reply in its thread (`comment`), as weibo.com's reply box does:
 * Weibo files it in the comment's thread and, for a reply, prefixes "回复@name:" itself.
 * Returns the reply when Weibo answers with it. `alsoRepost`: repost the post with it too (同时转发).
 */
export async function replyComment(status: Status, comment: Comment, text: string, alsoRepost = false): Promise<Comment | null> {
  const json = await post("/ajax/comments/reply", {
    id: status.id,
    cid: comment.id,
    comment: text,
    pic_id: "",
    is_repost: alsoRepost ? "1" : "0",
    comment_ori: "0",
    is_comment: "0",
  });
  return parseReply(json);
}

/**
 * Comments on the post itself, as weibo.com's comment box under a post does. Returns the comment
 * when Weibo answers with it. `alsoRepost`: repost the post with it too (同时转发).
 */
export async function commentStatus(status: Status, text: string, alsoRepost = false): Promise<Comment | null> {
  const json = await post("/ajax/comments/create", {
    id: status.id,
    comment: text,
    pic_id: "",
    is_repost: alsoRepost ? "1" : "0",
    comment_ori: "0",
    is_comment: "0",
  });
  return parseReply(json);
}

/** Likes a post, or takes the like back, as weibo.com's like button under a post does. */
export async function likeStatus(status: Status, like: boolean): Promise<void> {
  await post(`/ajax/statuses/${like ? "setLike" : "cancelLike"}`, { id: status.id });
}

/** Likes a comment, or takes the like back, as weibo.com's comment like button does. */
export async function likeComment(comment: Comment, like: boolean): Promise<void> {
  await post(`/ajax/statuses/${like ? "updateLike" : "destroyLike"}`, { object_id: comment.id, object_type: "comment" });
}

/**
 * What weibo.com's repost box for a comment starts with: "//@author:text", then the comment it
 * replies to in a thread (`parent`) and, when the post is a repost, the post's own text, each as
 * " //@name:text". What I write goes in front.
 */
export function repostText(status: Status, comment: Comment, parent?: Comment): string {
  const quote = (name: string, text: string) => `//@${name}:${text.trim()}`;
  return [
    quote(comment.user.name, comment.text),
    parent && quote(parent.user.name, parent.text),
    status.retweeted && quote(status.user.name, status.text),
  ]
    .filter(Boolean)
    .join(" ");
}

/** Reposts the post (`status`) with a comment on it quoted in `text`, as weibo.com's repost box for a
 * comment does. `alsoComment`: post `text` as a comment on it too (同时评论). */
export async function repostComment(status: Status, comment: Comment, text: string, alsoComment = false): Promise<void> {
  await repostStatus(status, text, alsoComment, comment.id);
}

/**
 * What weibo.com's repost box for a post starts with: nothing for an original post; for a repost,
 * its own text as "//@author:text", so the chain carries on.
 */
export function repostStatusText(status: Status): string {
  return status.retweeted ? `//@${status.user.name}:${status.text.trim()}` : "";
}

/** Reposts the post, as weibo.com's repost box does; empty `text` sends Weibo's own "转发微博".
 * `alsoComment`: post `text` as a comment on it too (同时评论). */
export async function repostStatus(status: Status, text: string, alsoComment = false, cid?: string): Promise<void> {
  await post("/ajax/statuses/normal_repost", {
    id: status.id,
    ...(cid ? { cid } : {}),
    comment: text.trim() || "转发微博",
    pic_id: "",
    is_repost: "0",
    comment_ori: "0",
    is_comment: alsoComment ? "1" : "0",
  });
}

/** The reply in `/ajax/comments/reply`'s answer (the comment itself, or under `data`), if any. */
export function parseReply(json: any): Comment | null {
  const c = json?.data && typeof json.data === "object" ? json.data : json;
  return c?.idstr || c?.id ? toComment(c) : null;
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
  return parseProfile(await get(`/ajax/profile/info?uid=${encodeURIComponent(uid)}`));
}

export function parseProfile(json: any): Profile {
  const user = one("/ajax/profile/info", json, "data.user", shapes.user);
  return { user: toUser(user), block: findBlock(json.data), raw: json.data };
}

// Names to uids, as `@name` mentions in posts carry only the name.
const uids = new Map<string, Promise<string>>();

/** The uid of the account with this screen name; rejects when no account has it. */
export function uidByName(name: string): Promise<string> {
  let uid = uids.get(name);
  if (!uid) {
    uid = get(`/ajax/profile/info?screen_name=${encodeURIComponent(name)}`).then(
      (json) => {
        const id = str(json.data?.user?.idstr ?? json.data?.user?.id);
        if (!id) throw new Error(json.msg ? `@${name}: ${json.msg}` : t("profile.no_such_name", { name }));
        save(`uid:${name}`, id);
        return id;
      },
      // Out of reach: the uid this name had last time.
      async (e) => {
        const saved = e instanceof NotSignedIn ? null : await loadSaved<string>(`uid:${name}`);
        if (typeof saved?.data === "string") return saved.data;
        throw e;
      },
    );
    uid.catch(() => uids.delete(name)); // Ask again next time.
    uids.set(name, uid);
  }
  return uid;
}

/** An account's own posts, newest first; pages count from 1. */
export async function userPosts(uid: string, page = 1): Promise<Page<Status, number>> {
  return parseUserPosts(await get(`/ajax/statuses/mymblog?uid=${encodeURIComponent(uid)}&page=${page}&feature=0`), page);
}

export function parseUserPosts(json: any, page: number, now = Date.now()): Page<Status, number> {
  const EP = "/ajax/statuses/mymblog";
  const raw = list(EP, json, "data.list");
  return {
    items: batchEmoticons(() =>
      items(EP, raw, shapes.status).map((s: any) => {
        const status = toStatus(s);
        const activity = toActivity(s, now);
        if (activity) return { ...status, activity };
        return isPinned(s) ? { ...status, pinned: true } : status;
      }),
    ),
    next: raw.length ? page + 1 : null,
  };
}

/**
 * The posts of one account that hold `q`, newest first, as the search box of weibo.com's profile
 * page finds them (originals and reposts, with or without pictures or video); pages count from 1.
 */
export async function searchUserPosts(uid: string, q: string, page = 1): Promise<Page<Status, number>> {
  const kinds = "&hasori=1&hastext=1&haspic=1&hasvideo=1&hasmusic=1&hasret=1";
  return parseUserPostSearch(
    await get(`/ajax/statuses/searchProfile?uid=${encodeURIComponent(uid)}&page=${page}&q=${encodeURIComponent(q)}${kinds}`),
    page,
  );
}

export function parseUserPostSearch(json: any, page: number): Page<Status, number> {
  const EP = "/ajax/statuses/searchProfile";
  const raw = list(EP, json, "data.list");
  // Read on until a page is empty.
  return { items: batchEmoticons(() => items(EP, raw, shapes.status).map(toStatus)), next: raw.length ? page + 1 : null };
}

/** A post the account pinned to the top of their profile: `isTop` (1), or its `title` "置顶". */
export function isPinned(s: any): boolean {
  return s?.isTop === 1 || s?.isTop === true || str(s?.title?.text) === "置顶";
}

/**
 * A post Weibo put among an account's own because they commented on it or liked it: its
 * `analysis_extra` says which (`profile_insert_type:comment_status` / `like_status`), its `title`
 * when, as weibo.com shows it above the post ("她1小时前评论过的微博(2)", "她11-18赞过的微博").
 */
export function toActivity(s: any, now = Date.now()): Activity | undefined {
  const insert = /(?:^|\|)profile_insert_type:(\w+)/.exec(str(s?.analysis_extra))?.[1];
  const title = str(s?.title?.text);
  const kind =
    insert === "comment_status" ? "comment"
    : insert === "like_status" ? "like"
    : /评论过的微博/.test(title) ? "comment"
    : /赞过的微博/.test(title) ? "like"
    : undefined;
  if (!kind) return undefined;
  const when = /^(?:她|他|TA|你|我)?\s*(.*?)\s*(?:评论|赞)过的微博/.exec(title)?.[1];
  const at = when ? weiboWhen(when, now) : undefined;
  return at === undefined ? { kind } : { kind, at };
}

/** Weibo's short times in Beijing time ("刚刚", "5分钟前", "1小时前", "今天 09:30", "昨天 21:40",
 * "11-18", "2025-11-18") as ms since the epoch; undefined for any other. */
export function weiboWhen(when: string, now = Date.now()): number | undefined {
  const BEIJING = 8 * 3_600_000;
  if (when === "刚刚") return now;
  let m = /^(\d+)\s*(秒|分钟|小时|天)前$/.exec(when);
  if (m) return now - Number(m[1]) * { 秒: 1_000, 分钟: 60_000, 小时: 3_600_000, 天: 86_400_000 }[m[2] as "秒"];
  // Beijing's calendar date of `now`, as a UTC date at its midnight.
  const today = new Date(now + BEIJING);
  const day = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo, d, h, mi) - BEIJING;
  m = /^(今天|昨天)\s*(\d{1,2}):(\d{2})$/.exec(when);
  if (m) {
    const back = m[1] === "昨天" ? 1 : 0;
    return day(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back, Number(m[2]), Number(m[3]));
  }
  m = /^(?:(\d{4})[-年])?(\d{1,2})[-月](\d{1,2})日?$/.exec(when);
  if (m) {
    const y = m[1] ? Number(m[1]) : today.getUTCFullYear();
    const at = day(y, Number(m[2]) - 1, Number(m[3]));
    // No year and later than today: last year's.
    return !m[1] && at > now ? day(y - 1, Number(m[2]) - 1, Number(m[3])) : at;
  }
  return undefined;
}

/** One post by id (`mid`). */
export async function status(id: string): Promise<Status> {
  return parseStatus(await get(`/ajax/statuses/show?id=${encodeURIComponent(id)}&locale=zh-CN`));
}

export const parseStatus = (json: any): Status => toStatus(one("/ajax/statuses/show", json, "", shapes.status));

/** One version of an edited post, as it read from `createdAt` until the next edit. */
export interface Version {
  /** Made here (Weibo's versions have none): the post's id and the version's time. */
  id: string;
  text: string;
  createdAt: string;
  pics: Pic[];
  video?: Video;
  links: Record<string, Link>;
}

/** An edited post's versions, newest (the current one) first, the original last; pages count from 1. */
export async function editHistory(mid: string, page = 1): Promise<Page<Version, number>> {
  return parseEditHistory(await get(`/ajax/statuses/editHistory?mid=${encodeURIComponent(mid)}&page=${page}`), mid, page);
}

export function parseEditHistory(json: any, mid: string, page: number): Page<Version, number> {
  const EP = "/ajax/statuses/editHistory";
  const raw = list(EP, json, "statuses");
  const versions = batchEmoticons(() => items(EP, raw, shapes.version).map((v: any): Version => {
    const s = toStatus(v);
    // `text_raw` is the whole text today, long or not; `longText.content` too, in case it is cut.
    const long = decodeEntities(str(v?.longText?.content));
    return {
      id: `${mid}@${s.createdAt}`,
      text: long.length > s.text.length ? long : s.text,
      createdAt: s.createdAt,
      pics: s.pics,
      video: s.video,
      links: s.links,
    };
  }));
  // `total` counts every version, the original too. Without it, read on until a page is empty.
  if (raw.length && json.total === undefined) reportDrift(EP, ["total"], json);
  const more = json.total === undefined ? raw.length > 0 : num(json.total) > page * raw.length;
  return { items: versions, next: raw.length && more ? page + 1 : null };
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
 * time first); pages count from 1.
 */
export function topicPosts(topic: string, page = 1): Promise<Page<Status, number>> {
  return searchPosts(`#${topic.replace(/^#|#$/g, "")}#`, page);
}

/**
 * The posts s.weibo.com finds for `q` (a keyword, or a `#topic#`), its default order; pages count
 * from 1. weibo.com has no JSON for its search: read the posts' ids from the search page, then each
 * post from weibo.com's API, a few at a time.
 */
export async function searchPosts(q: string, page = 1): Promise<Page<Status, number>> {
  const html = await getSearchPage(`/weibo?q=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ""}`);
  const ids = [...new Set([...html.matchAll(/\bmid="(\d{10,})"/g)].map((m) => m[1]))];
  // A post that is gone fails alone; a change of shape fails them all, and says so.
  let changed: unknown;
  const posts = await mapLimit(ids, 4, (id) =>
    status(id).catch((e) => {
      if (e instanceof WeiboChanged) changed = e;
      return null;
    }),
  );
  if (changed && !posts.some(Boolean)) throw changed;
  return { items: posts.filter((p): p is Status => !!p), next: ids.length && page < lastPage(html, page) ? page + 1 : null };
}

/** The last page a search page links to (its pager), or `page` itself. */
const lastPage = (html: string, page: number) =>
  Math.max(page, ...[...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1])));

/**
 * The accounts s.weibo.com finds for `q`, best match first, about twenty a page; pages count from
 * 1. Its search always finds some (names that look alike), so no answer is "nobody".
 */
export async function searchUsers(q: string, page = 1): Promise<Page<User, number>> {
  return parseUserSearch(await getSearchPage(`/user?q=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ""}`), page);
}

/**
 * The accounts of s.weibo.com's user search page: its cards (`card-user-b`), each with the
 * account's link (`weibo.com/u/<uid>`), name, picture, verification (the badge's title, gold by
 * its icon), description, followers ("粉丝：1393.1万") and follow button ("已关注" once followed).
 * A page with a pager but no card has changed shape.
 */
export function parseUserSearch(html: string, page: number): Page<User, number> {
  const EP = "s.weibo.com/user";
  const cards = html.split(/<div class="card card-user-b\b/).slice(1);
  const users: User[] = [];
  for (const card of cards) {
    const id = /href="(?:https?:)?\/\/weibo\.com\/u\/(\d+)"/.exec(card)?.[1];
    const name = stripTags(/class="name"[^>]*>([\s\S]*?)<\/a>/.exec(card)?.[1] ?? "").trim();
    if (!id || !name) {
      reportDrift(EP, [id ? "name" : "uid"], card.slice(0, 1500));
      continue;
    }
    const badge = /<span\s+title="([^"]*认证[^"]*)"/.exec(card)?.[1];
    const info = card.slice(card.indexOf('class="info"'));
    const paragraphs = [...info.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => stripTags(m[1]).trim());
    const followers = /粉丝：\s*([\d.]+)\s*(万|亿)?/.exec(info);
    const button = /woo-button-content">([^<]*)</.exec(card)?.[1]?.trim();
    users.push({
      id,
      name,
      avatar: https(/<div class="avator">[\s\S]*?<img src="([^"]+)"/.exec(card)?.[1] ?? ""),
      verified: badge,
      verifiedKind: badge ? (/官方|机构/.test(badge) ? "org" : /woo_svg_vgold/.test(card) ? "gold" : "personal") : undefined,
      description: paragraphs.find((p) => p && !/^粉丝：/.test(p)) || undefined,
      followersCount: followers ? Math.round(Number(followers[1]) * (followers[2] === "亿" ? 1e8 : followers[2] === "万" ? 1e4 : 1)) : undefined,
      following: button ? button === "已关注" || button === "互相关注" : undefined,
      followsMe: button === "互相关注" ? true : undefined,
    });
  }
  if (!cards.length && /[?&]page=\d+/.test(html)) {
    reportDrift(EP, ["card-user-b"], html.slice(0, 4000));
    throw new WeiboChanged(EP, ["card-user-b"]);
  }
  return { items: users, next: cards.length && page < lastPage(html, page) ? page + 1 : null };
}

/** A word of Weibo's hot search list (微博热搜). */
export interface HotWord {
  /** What it shows. */
  word: string;
  /** What to search for: a topic's `#name#`, or the word. */
  query: string;
  /** How many searched it, when given. */
  count?: number;
  /** Weibo's mark ("热", "新", "沸"...) and its color, when it has one. */
  label?: { text: string; color: string };
}

/** Weibo's hot searches (微博热搜), in their order; ads left out. */
export async function hotSearches(): Promise<HotWord[]> {
  return parseHotSearch(await get("/ajax/side/hotSearch"));
}

export function parseHotSearch(json: any): HotWord[] {
  const EP = "/ajax/side/hotSearch";
  return list(EP, json, "data.realtime")
    .filter((w: any) => !w?.is_ad && !w?.topic_ad && str(w?.word))
    .map((w: any): HotWord => {
      const word = str(w.word);
      const text = str(w.small_icon_desc || w.label_name);
      const color = str(w.small_icon_desc_color || w.icon_desc_color);
      return {
        word: str(w.note) || word,
        query: str(w.word_scheme) || word,
        count: w.num === undefined ? undefined : num(w.num),
        label: text && /^#[0-9a-f]{6}$/i.test(color) ? { text, color } : undefined,
      };
    });
}

/** What Weibo suggests while a search is typed: accounts by that name, and searches that start so. */
export interface Suggestions {
  users: User[];
  words: string[];
}

/** weibo.com's suggestions for `q`, as its own search box asks for them. */
export async function searchSuggest(q: string): Promise<Suggestions> {
  return parseSuggest(await get(`/ajax/side/search?q=${encodeURIComponent(q)}`));
}

export function parseSuggest(json: any): Suggestions {
  const EP = "/ajax/side/search";
  // `users` carries whole accounts; `user` only uid and name: kept for an account `users` lacks.
  const full = Array.isArray(json?.data?.users) ? items(EP, json.data.users, shapes.user).map(toUser) : [];
  const short: User[] = (Array.isArray(json?.data?.user) ? json.data.user : [])
    .filter((u: any) => str(u?.uid) && !full.some((f) => f.id === str(u.uid)))
    .map((u: any) => ({ id: str(u.uid), name: str(u.nick) || "(unknown)", avatar: "" }));
  const words = [...new Set(list(EP, json, "data.hotquery").map((w: any) => str(w?.suggestion).trim()).filter(Boolean))];
  return { users: [...full, ...short], words };
}

/**
 * The posts I saved (收藏), the latest saved first; pages count from 1. My uid comes from the group
 * list, as weibo.com's own favorites page asks with it.
 */
export async function favorites(page = 1): Promise<Page<Status, number>> {
  const uid = await myUid();
  return parseFavorites(await get(`/ajax/favorites/all_fav?uid=${encodeURIComponent(uid)}&page=${page}&with_total=true`), page);
}

export function parseFavorites(json: any, page: number): Page<Status, number> {
  const EP = "/ajax/favorites/all_fav";
  // The posts are under `data.status` (`{ count, data: { status: [...] } }`); a bare `data` list
  // is read too, each item the post or, as older answers had it, `{ status, favorited_time }`.
  const path = Array.isArray(json?.data) ? "data" : "data.status";
  const raw = list(EP, json, path).map((f: any) => (f?.status && typeof f.status === "object" ? f.status : f));
  // No total to go by (`count` may be the page's size): read on until a page is empty.
  const more = json?.total_number === undefined ? raw.length > 0 : num(json.total_number) > page * raw.length;
  // A saved post deleted since comes without its author: dropped (and noted) as a post that fits no more.
  const posts = batchEmoticons(() => items(EP, raw, shapes.status).map((s): Status => ({ ...toStatus(s), favorited: true })));
  return { items: posts, next: raw.length && more ? page + 1 : null };
}

/** Saves a post to my favorites (收藏), or takes it out, as weibo.com's 收藏 button does. (`destory`: Weibo's spelling.) */
export async function favorite(status: Status, on: boolean): Promise<void> {
  await post(`/ajax/statuses/${on ? "createFavorites" : "destoryFavorites"}`, { id: status.id });
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
  return parsePeople(await get(`/ajax/friendships/friends?${q}`), page);
}

export function parsePeople(json: any, page: number): Page<User, number> {
  const EP = "/ajax/friendships/friends";
  const raw = list(EP, json, "users");
  // `next_cursor` is 0 on the last page.
  return { items: items(EP, raw, shapes.user).map(toUser), next: raw.length && num(json.next_cursor) ? page + 1 : null };
}

/** Forgets the signed-in account (signing out): what was read of it, what the app holds of it in
 * memory (`account.ts`), and all that was saved. */
export function forgetAccount(): Promise<void> {
  groupList = undefined;
  uids.clear();
  forgetInMemory();
  return clearSaved();
}
