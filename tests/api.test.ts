// The parsers of `api.ts` against Weibo's answers (`fixtures/`), and what they do when an answer
// changes shape. When Weibo changes an endpoint: save its new answer here (the `[weibo drift]` log
// line carries a sample), see which test fails, and fix the mapping in `api.ts`.
import { expect, test } from "nsh/test";
import {
  parseComments,
  parseEditHistory,
  parseFavorites,
  parseGroups,
  parseHotSearch,
  parseLikes,
  parseLongText,
  parseNewer,
  parsePeople,
  parseProfile,
  parseReply,
  parseReposts,
  parseStatus,
  parseSuggest,
  parseTimeline,
  isNewerId,
  parseUserPosts,
  parseUserPostSearch,
  parseUserSearch,
  postIdOf,
  weiboWhen,
  repostStatusText,
  repostText,
  verifiedKind,
} from "../api";
import { diff } from "../diff";
import { driftReports, WeiboChanged } from "../drift";
import allGroups from "./fixtures/allGroups.json";
import buildComments from "./fixtures/buildComments.json";
import editHistory from "./fixtures/editHistory.json";
import favoritesFixture from "./fixtures/favorites.json";
import friends from "./fixtures/friends.json";
import friendstimeline from "./fixtures/friendstimeline.json";
import hotSearch from "./fixtures/hotSearch.json";
import longtext from "./fixtures/longtext.json";
import mymblog from "./fixtures/mymblog.json";
import profileInfo from "./fixtures/profileInfo.json";
import profileInfoBlocked from "./fixtures/profileInfoBlocked.json";
import likeShow from "./fixtures/likeShow.json";
import replies from "./fixtures/replies.json";
import repostTimeline from "./fixtures/repostTimeline.json";
import sideSearch from "./fixtures/sideSearch.json";
import statusShow from "./fixtures/statusShow.json";
import userSearchHtml from "./fixtures/userSearch";

const GID = "110001000000001"; // 11000 + my uid, as allGroups names it.
const copy = <T>(v: T): any => JSON.parse(JSON.stringify(v));
const reported = (endpoint: string, path: string) =>
  driftReports().some((r) => r.endpoint === endpoint && r.missing.includes(path));

// What Weibo answers today.

test("groups: the 最新微博 group and my uid", () => {
  expect(parseGroups(allGroups)).toEqual({ latestGid: GID, uid: "1000000001" });
});

test("timeline: ads and accounts I don't follow left out, my own posts kept", () => {
  const page = parseTimeline(friendstimeline, GID);
  expect(page.items.map((s) => s.id)).toEqual(["5100000000000001", "5100000000000002", "5100000000000005"]);
  expect(page.next).toBe("5100000000000004");
});

test("new posts: only those newer than the first shown count, ads still left out", () => {
  // Weibo's ids grow with time: the fixture's, newest first, made so.
  const page = copy(friendstimeline);
  page.statuses.forEach((s: any, i: number) => (s.idstr = s.id = String(5100000000000009 - i)));
  const newer = parseNewer(page, GID, "5100000000000007");
  expect(newer.items.map((s) => s.id)).toEqual(["5100000000000009", "5100000000000008"]);
  expect(newer.more).toBe(false);
  // Weibo answering with its newest page whatever `since_id` said: nothing new.
  expect(parseNewer(page, GID, "5100000000000009").items).toEqual([]);
});

test("new posts: a full page of nothing but new ones may have more past it", () => {
  const full = copy(friendstimeline);
  const first = full.statuses[0];
  full.statuses = Array.from({ length: 20 }, (_, i) => ({ ...first, id: 5200000000000020 - i, idstr: String(5200000000000020 - i) }));
  const newer = parseNewer(full, GID, "5100000000000001");
  expect(newer.items.length).toBe(20);
  expect(newer.more).toBe(true);
});

test("post ids compare as numbers", () => {
  expect(isNewerId("5100000000000002", "5100000000000001")).toBe(true);
  expect(isNewerId("10000000000000000", "9999999999999999")).toBe(true);
  expect(isNewerId("5100000000000001", "5100000000000001")).toBe(false);
});

test("timeline: a post's fields, pictures and links", () => {
  const s = parseTimeline(friendstimeline, GID).items[0];
  expect(s).toMatchObject({
    mblogid: "PaAbCdEf1",
    text: "今天的晚霞 http://t.cn/A6abcd",
    createdAt: "Thu Nov 19 21:04:11 +0800 2026",
    source: "iPhone 17 Pro",
    region: "上海",
    reposts: 3,
    comments: 12,
    likes: 108,
    user: { id: "2000000001", name: "晚霞观察员", verified: "摄影博主", verifiedKind: "gold", following: true, followsMe: false },
  });
  expect(s.pics).toEqual([
    {
      thumb: "https://wx1.sinaimg.cn/mw690/006aaaa1ly1hxyz0001.jpg",
      large: "https://wx1.sinaimg.cn/orj960/006aaaa1ly1hxyz0001.jpg",
      original: "https://wx1.sinaimg.cn/large/006aaaa1ly1hxyz0001.jpg",
    },
    // No `pic_infos` for it: the addresses its id makes.
    {
      thumb: "https://wx1.sinaimg.cn/mw690/006aaaa1ly1hxyz0002.jpg",
      large: "https://wx1.sinaimg.cn/orj960/006aaaa1ly1hxyz0002.jpg",
      original: "https://wx1.sinaimg.cn/large/006aaaa1ly1hxyz0002.jpg",
    },
  ]);
  expect(s.links["http://t.cn/A6abcd"]).toEqual({ title: "网页链接", url: "https://example.com/sunset", video: false });
});

test("users: Weibo's verification types to its badges", () => {
  expect(verifiedKind({ verified: false, verified_type: -1 })).toBeUndefined();
  expect(verifiedKind({ verified: true, verified_type: 0, verified_type_ext: 0 })).toBe("personal");
  expect(verifiedKind({ verified: true, verified_type: 0 })).toBe("personal");
  expect(verifiedKind({ verified: true, verified_type: 0, verified_type_ext: 1 })).toBe("gold");
  expect(verifiedKind({ verified: true, verified_type: 0, verified_type_ext: 2 })).toBe("gold");
  for (const type of [1, 2, 3, 4, 5, 6, 7]) expect(verifiedKind({ verified: true, verified_type: type })).toBe("org");
  expect(verifiedKind({ verified: true, verified_type: 220 })).toBe("talent");
  expect(verifiedKind({ verified: true, verified_type: 200 })).toBe("talent");
  // A type the app doesn't know: still verified.
  expect(verifiedKind({ verified: true, verified_type: 10 })).toBe("personal");
});

test("reposts: each a post of its own, the reposted post under it; one without an author left out", () => {
  const page = parseReposts(repostTimeline, 1);
  expect(page.items.map((s) => s.id)).toEqual(["5100000000000301", "5100000000000302"]);
  expect(page.items[0]).toMatchObject({
    text: "好看！//@路人甲:同感",
    region: "浙江",
    user: { id: "2000000011", name: "看云的人" },
    retweeted: { id: "5100000000000001" },
  });
  expect(page.items[1].user).toMatchObject({ name: "城市观察", verifiedKind: "org" });
  expect(page.next).toBe(2);
  expect(parseReposts({ ...copy(repostTimeline), max_page: 2 }, 2).next).toBeNull();
  expect(parseReposts({ ok: 1, data: [] }, 3).next).toBeNull();
});

test("likes: the accounts that liked, a like without one left out", () => {
  const page = parseLikes(likeShow, 1);
  expect(page.items.map((u) => u.name)).toEqual(["点赞的人", "金V博主"]);
  expect(page.items[1]).toMatchObject({ id: "2000000022", verifiedKind: "gold", followersCount: 1200000, following: true });
  // Three likes in all, three read (one without its user): the end.
  expect(page.next).toBeNull();
  expect(parseLikes({ ...copy(likeShow), total_number: 100 }, 1).next).toBe(2);
});

test("favorites: saved posts, wrapped or not, a deleted one left out", () => {
  const page = parseFavorites(favoritesFixture, 1);
  expect(page.items.map((s) => s.id)).toEqual(["5100000000000301", "5100000000000302"]);
  // Listed as saved even where the answer leaves `favorited` out.
  expect(page.items.every((s) => s.favorited)).toBe(true);
  expect(page.items[1]).toMatchObject({ text: "旧样式：包在 status 里", user: { name: "路人甲" } });
  // No total: read on until a page is empty.
  expect(page.next).toBe(2);
  expect(parseFavorites({ ok: 1, count: 20, data: { status: [] } }, 2).next).toBeNull();
  // A bare list under `data` reads the same.
  expect(parseFavorites({ ok: 1, data: copy(favoritesFixture).data.status }, 1).items.length).toBe(2);
  expect(() => parseFavorites({ ok: 1 }, 1)).toThrow(WeiboChanged);
  expect(() => parseFavorites({ ok: 1, data: {} }, 1)).toThrow(WeiboChanged);
});

test("text: Weibo's escaped &, <, > read as themselves", () => {
  const s = parseStatus({ ...copy(statusShow), text_raw: "《Fix &amp; Fax》 1 &lt; 2 &gt; 0 &amp;lt;" });
  expect(s.text).toBe("《Fix & Fax》 1 < 2 > 0 &lt;");
});

test("a post says whether I saved it", () => {
  expect(parseStatus({ ...copy(statusShow), favorited: true }).favorited).toBe(true);
  expect(parseStatus(statusShow).favorited).toBe(false);
});

test("reposts and likes in a new shape are a change", () => {
  expect(() => parseReposts({ ok: 1, list: [] }, 1)).toThrow(WeiboChanged);
  expect(() => parseLikes({ ok: 1 }, 1)).toThrow(WeiboChanged);
});

test("timeline: a repost shows the reposted post's video once, at 720p", () => {
  const s = parseTimeline(friendstimeline, GID).items[1];
  expect(s.video).toBeUndefined();
  expect(s.retweeted?.video).toEqual({
    src: "https://f.video.weibocdn.com/720/video0001.mp4",
    poster: "https://wx3.sinaimg.cn/orj480/video0001.jpg",
    title: "城市夜景延时",
    duration: 64,
    portrait: false,
    qualities: [{ label: "720p", url: "https://f.video.weibocdn.com/720/video0001.mp4", height: 720 }],
  });
  // A `sinaweibo://` link opens its web address.
  expect(s.retweeted?.links["http://t.cn/A6vid1"]).toMatchObject({ url: "https://video.weibo.com/show?fid=1", video: true });
});

test("timeline: pictures of a mixed post", () => {
  const s = parseTimeline(friendstimeline, GID).items[2];
  expect(s.isLongText).toBe(true);
  expect(s.pics).toEqual([
    {
      thumb: "https://wx1.sinaimg.cn/mw690/006mine01ly1hmix0001.jpg",
      large: "https://wx1.sinaimg.cn/orj960/006mine01ly1hmix0001.jpg",
      original: "https://wx1.sinaimg.cn/large/006mine01ly1hmix0001.jpg",
    },
  ]);
});

test("long text and its links", () => {
  expect(parseLongText(longtext)).toEqual({
    text: "我自己发的，这是全文。详情见 http://t.cn/A6long1",
    links: { "http://t.cn/A6long1": { title: "网页链接", url: "https://example.com/long", video: false } },
  });
});

test("links to Weibo posts (微博正文) know their post", () => {
  const links = parseLongText({
    ok: 1,
    data: {
      longTextContent: "http://t.cn/A6post1 http://t.cn/A6post2",
      url_struct: [
        { url_title: "微博正文", short_url: "http://t.cn/A6post1", ori_url: "sinaweibo://detail?mblogid=PbCdEfGhI", url_type: 0 },
        { url_title: "微博正文", short_url: "http://t.cn/A6post2", long_url: "https://weibo.com/1000000001/5100000000000201" },
      ],
    },
  })!.links;
  expect(links["http://t.cn/A6post1"]).toMatchObject({ title: "微博正文", post: "PbCdEfGhI" });
  expect(links["http://t.cn/A6post2"]).toMatchObject({ url: "https://weibo.com/1000000001/5100000000000201", post: "5100000000000201" });
});

test("post addresses", () => {
  for (const url of [
    "https://weibo.com/1000000001/PbCdEfGhI",
    "https://www.weibo.com/1000000001/PbCdEfGhI?refer_flag=1001030103_",
    "https://weibo.com/detail/PbCdEfGhI",
    "https://m.weibo.cn/status/PbCdEfGhI",
    "https://m.weibo.cn/detail/PbCdEfGhI",
    "https://m.weibo.cn/1000000001/PbCdEfGhI",
    "sinaweibo://detail?mblogid=PbCdEfGhI",
    "sinaweibo://detail/?id=PbCdEfGhI",
  ])
    expect(postIdOf(url)).toBe("PbCdEfGhI");
  for (const url of [
    "https://weibo.com/u/1000000001",
    "https://weibo.com/1000000001/followers",
    "https://weibo.com/1000000001",
    "https://example.com/1000000001/PbCdEfGhI",
    "https://s.weibo.com/weibo?q=%23x%23",
    "sinaweibo://userinfo?uid=1000000001",
  ])
    expect(postIdOf(url)).toBeUndefined();
});

test("comments: pictures, previewed replies without their parent's links", () => {
  const page = parseComments(buildComments);
  expect(page.next).toBe("139000000000000");
  const [first, second] = page.items;
  expect(first).toMatchObject({ id: "5200000000000001", likes: 25, replyCount: 3, user: { name: "路人甲" } });
  expect(first.pics).toEqual([
    {
      thumb: "https://wx2.sinaimg.cn/mw690/008cmt01ly1hcmt0001.jpg",
      large: "https://wx2.sinaimg.cn/orj960/008cmt01ly1hcmt0001.jpg",
      original: "https://wx2.sinaimg.cn/large/008cmt01ly1hcmt0001.jpg",
    },
  ]);
  expect(first.preview.map((r) => r.text)).toEqual(["同感"]);
  expect(first.preview[0].pics).toEqual([]);
  expect(second.preview).toEqual([]);
  // "来自广东": where it was sent from, without the "来自".
  expect(first.region).toBe("广东");
  expect(second.region).toBeUndefined();
  expect(first.liked).toBe(true);
  expect(second.liked).toBe(false);
});

test("replies: whom each answers; the last page", () => {
  const page = parseComments(replies);
  expect(page.next).toBeNull();
  expect(page.items[1]).toMatchObject({ replyTo: "路人乙", replyToUid: "4000000002" });
});

test("profile: counts, relationship, not blocked", () => {
  const p = parseProfile(profileInfo);
  expect(p.user).toMatchObject({
    id: "2000000001",
    followersCount: 123456,
    followingCount: 321,
    posts: 4567,
    location: "上海",
    following: true,
    followsMe: true,
  });
  expect(p.block.blocked).toBe(false);
});

test("profile: blocked, with weibo.com's message", () => {
  const p = parseProfile(profileInfoBlocked);
  expect(p.block.blocked).toBe(true);
  expect(p.block.message).toBe("你已将对方拉黑，无法查看其微博");
});

test("an account's posts, by page", () => {
  const page = parseUserPosts(mymblog, 1);
  expect(page.items.map((s) => s.text)).toEqual(["早安", "周末去了那家新开的书店", "风把网球吹到了隔壁球场"]);
  expect(page.next).toBe(2);
  expect(parseUserPosts({ ok: 1, data: { list: [] } }, 3).next).toBeNull();
});

test("an account's posts that hold a search, by page", () => {
  // searchProfile answers as mymblog does: the posts under `data.list`.
  const page = parseUserPostSearch({ ok: 1, data: { list: copy(mymblog).data.list.slice(0, 1), total: 1 } }, 1);
  expect(page.items.map((s) => s.text)).toEqual(["早安"]);
  expect(page.next).toBe(2);
  expect(parseUserPostSearch({ ok: 1, data: { list: [] } }, 2).next).toBeNull();
  expect(() => parseUserPostSearch({ ok: 1, data: {} }, 1)).toThrow(WeiboChanged);
});

// 2026-11-22 14:30 in Beijing.
const NOW = Date.UTC(2026, 10, 22, 6, 30);

test("an account's posts: the ones they commented on or liked say so, and when", () => {
  const [own, commented, liked] = parseUserPosts(mymblog, 1, NOW).items;
  expect(own.activity).toBeUndefined();
  expect(commented.user.name).toBe("书店旁边");
  expect(commented.activity).toEqual({ kind: "comment", at: NOW - 3_600_000 });
  expect(liked.activity).toEqual({ kind: "like", at: Date.UTC(2026, 10, 17, 16) }); // 11-18 00:00 in Beijing.
});

test("a post the account pinned says so; their other posts and inserted ones do not", () => {
  const json = copy(mymblog);
  json.data.list[0].isTop = 1;
  json.data.list[0].title = { text: "置顶" };
  json.data.list[1].isTop = 1; // An inserted post is told as what they did, not pinned.
  expect(parseUserPosts(json, 1, NOW).items.map((s) => s.pinned)).toEqual([true, undefined, undefined]);
  delete json.data.list[0].isTop; // Its title alone says it.
  expect(parseUserPosts(json, 1, NOW).items[0].pinned).toBe(true);
  expect(parseUserPosts(mymblog, 1, NOW).items[0].pinned).toBeUndefined();
});

test("an inserted post Weibo no longer marks in analysis_extra is told by its title", () => {
  const json = copy(mymblog);
  for (const s of json.data.list) delete s.analysis_extra;
  expect(parseUserPosts(json, 1, NOW).items.map((s) => s.activity?.kind)).toEqual([undefined, "comment", "like"]);
});

test("Weibo's short times", () => {
  expect(weiboWhen("刚刚", NOW)).toBe(NOW);
  expect(weiboWhen("5分钟前", NOW)).toBe(NOW - 300_000);
  expect(weiboWhen("今天 09:30", NOW)).toBe(Date.UTC(2026, 10, 22, 1, 30));
  expect(weiboWhen("昨天 21:40", NOW)).toBe(Date.UTC(2026, 10, 21, 13, 40));
  expect(weiboWhen("2025-11-18", NOW)).toBe(Date.UTC(2025, 10, 17, 16));
  expect(weiboWhen("12-30", NOW)).toBe(Date.UTC(2025, 11, 29, 16)); // Later than today: last year.
  expect(weiboWhen("不久前", NOW)).toBeUndefined();
});

test("one post", () => {
  expect(parseStatus(statusShow)).toMatchObject({ id: "5100000000000201", text: "#晚霞# 今天也很好看", likes: 50 });
});

test("a post's edit count", () => {
  expect(parseStatus(statusShow).editCount).toBe(0);
  expect(parseStatus({ ...copy(statusShow), edit_count: 4 }).editCount).toBe(4);
});

test("edit history: versions newest first, with their own text, time and pictures", () => {
  const page = parseEditHistory(editHistory, "5100000000000001", 1);
  expect(page.items.map((v) => v.createdAt)).toEqual([
    "Wed Nov 18 14:01:56 +0800 2026",
    "Wed Nov 18 13:51:29 +0800 2026",
    "Wed Nov 18 13:48:49 +0800 2026",
  ]);
  // Weibo's versions all have the id -1: each gets one of its own.
  expect(new Set(page.items.map((v) => v.id)).size).toBe(3);
  expect(page.items[0].text).toBe("今天的晚霞是橘红色的，从六点一直烧到七点。\n明天再去江边看看。");
  expect(page.items[0].pics).toEqual([
    {
      thumb: "https://wx1.sinaimg.cn/mw690/006aaaa1ly1hedit0002.jpg",
      large: "https://wx1.sinaimg.cn/orj960/006aaaa1ly1hedit0002.jpg",
      original: "https://wx1.sinaimg.cn/large/006aaaa1ly1hedit0002.jpg",
    },
  ]);
  expect(page.items[2].pics).toEqual([]);
  // All 3 of `total` came on this page.
  expect(page.next).toBeNull();
  expect(parseEditHistory({ ...copy(editHistory), total: 8 }, "1", 1).next).toBe(2);
  expect(parseEditHistory({ ok: 1, statuses: [], total: 3 }, "1", 2).next).toBeNull();
});

test("edit history: a cut text reads the long one", () => {
  const json = copy(editHistory);
  json.statuses[0].text_raw = "今天的晚霞是橘红色的…";
  expect(parseEditHistory(json, "1", 1).items[0].text).toBe(editHistory.statuses[0].longText!.content);
});

test("diff: what was added and removed between versions", () => {
  expect(diff("今天的晚霞是红色的。", "今天的晚霞是橘红色的，从六点一直烧到七点。")).toEqual([
    { kind: "same", text: "今天的晚霞是" },
    { kind: "added", text: "橘" },
    { kind: "same", text: "红色的" },
    { kind: "added", text: "，从六点一直烧到七点" },
    { kind: "same", text: "。" },
  ]);
  expect(diff("abc", "abc")).toEqual([{ kind: "same", text: "abc" }]);
  expect(diff("", "new")).toEqual([{ kind: "added", text: "new" }]);
  // Rejoined, each side is its text again.
  const parts = diff("小红书分发的是你感兴趣的内容主题与话题，微博", "小红书分发的是你感兴趣的内容话题，微博分发");
  expect(parts.filter((p) => p.kind !== "added").map((p) => p.text).join("")).toBe("小红书分发的是你感兴趣的内容主题与话题，微博");
  expect(parts.filter((p) => p.kind !== "removed").map((p) => p.text).join("")).toBe("小红书分发的是你感兴趣的内容话题，微博分发");
});

test("following and followers, by page", () => {
  const page = parsePeople(friends, 1);
  expect(page.items.map((u) => u.name)).toEqual(["晚霞观察员", "转发达人"]);
  expect(page.next).toBe(2);
  expect(parsePeople({ ...copy(friends), next_cursor: 0 }, 5).next).toBeNull();
});

// When Weibo changes an answer.

test("a list under a new name is a change, not an empty feed", () => {
  const json = copy(friendstimeline);
  json.list = json.statuses;
  delete json.statuses;
  expect(() => parseTimeline(json, GID)).toThrow(WeiboChanged);
  expect(reported("/ajax/feed/friendstimeline", "statuses")).toBe(true);
  expect(() => parseComments({ ok: 1, comments: [] })).toThrow(WeiboChanged);
  expect(() => parseUserPosts({ ok: 1, data: { statuses: [] } }, 1)).toThrow(WeiboChanged);
  expect(() => parsePeople({ ok: 1, list: [] }, 1)).toThrow(WeiboChanged);
  expect(() => parseGroups({ ok: 1, data: [] })).toThrow(WeiboChanged);
  expect(() => parseEditHistory({ ok: 1, data: { statuses: [] } }, "1", 1)).toThrow(WeiboChanged);
});

test("an empty list is not a change", () => {
  expect(parseTimeline({ ok: 1, statuses: [], max_id: 0 }, GID)).toEqual({ items: [], next: null });
  expect(parseComments({ ok: 1, data: [], max_id: 0 })).toEqual({ items: [], next: null });
});

test("an item without an id is dropped and reported; the others show", () => {
  const json = copy(friendstimeline);
  delete json.statuses[0].id;
  delete json.statuses[0].idstr;
  expect(parseTimeline(json, GID).items.map((s) => s.id)).toEqual(["5100000000000002", "5100000000000005"]);
  expect(reported("/ajax/feed/friendstimeline", "idstr|id")).toBe(true);
});

test("a page none of whose items fit is a change", () => {
  const json = copy(buildComments);
  for (const c of json.data) c.author = c.user, delete c.user;
  expect(() => parseComments(json)).toThrow(WeiboChanged);
  expect(reported("/ajax/statuses/buildComments", "user.idstr|user.id")).toBe(true);
});

test("a missing count is reported, and the post still shows", () => {
  const json = copy(mymblog);
  json.data.list[0].like_count = json.data.list[0].attitudes_count;
  delete json.data.list[0].attitudes_count;
  expect(parseUserPosts(json, 1).items[0].likes).toBe(0);
  expect(reported("/ajax/statuses/mymblog", "attitudes_count")).toBe(true);
});

test("a profile without its user is a change, with a message that names the endpoint", () => {
  const json = { ok: 1, data: { userInfo: copy(profileInfo).data.user } };
  expect(() => parseProfile(json)).toThrow(WeiboChanged);
  expect(() => parseProfile(json)).toThrow("profile/info");
  expect(() => parseStatus({ ok: 1, mblog: copy(statusShow) })).toThrow(WeiboChanged);
});

test("a long text that lost its text falls back to the cut one, reported", () => {
  expect(parseLongText({ ok: 1, data: { content: "全文" } })).toBeNull();
  expect(reported("/ajax/statuses/longtext", "data.longTextContent")).toBe(true);
});

test("reply: the comment Weibo answers with, at the top or under data; none without one", () => {
  const c = { ok: 1, idstr: "5200000000000099", created_at: "Fri Nov 20 10:00:00 +0800 2026", text_raw: "回复@路人乙:好",
    user: { idstr: "4000000001", screen_name: "路人甲" } };
  expect(parseReply(c)?.id).toBe("5200000000000099");
  expect(parseReply(c)?.text).toBe("回复@路人乙:好");
  expect(parseReply({ ok: 1, data: c })?.user.name).toBe("路人甲");
  expect(parseReply({ ok: 1 })).toBe(null);
});

test("repost text: the comment quoted, then the one it replies to, then the post when it is a repost", () => {
  const [first] = parseComments(buildComments).items;
  const reply = first.preview[0];
  const post = parseStatus(statusShow);
  expect(repostText(post, first)).toBe(`//@${first.user.name}:${first.text.trim()}`);
  expect(repostText(post, reply, first)).toBe(`//@${reply.user.name}:${reply.text} //@${first.user.name}:${first.text.trim()}`);
  const repost = { ...post, retweeted: post };
  expect(repostText(repost, first)).toBe(`//@${first.user.name}:${first.text.trim()} //@${post.user.name}:${post.text.trim()}`);
});

test("a post I liked says so (attitudes_status 1); one I didn't, or without the field, doesn't", () => {
  expect(parseStatus({ ...copy(statusShow), attitudes_status: 1 }).liked).toBe(true);
  expect(parseStatus({ ...copy(statusShow), attitudes_status: 0 }).liked).toBe(false);
  expect(parseStatus(statusShow).liked).toBe(false);
});

test("a post's repost text: empty for an original post, its own text quoted for a repost", () => {
  const post = parseStatus(statusShow);
  expect(repostStatusText({ ...post, retweeted: undefined })).toBe("");
  expect(repostStatusText({ ...post, retweeted: post })).toBe(`//@${post.user.name}:${post.text.trim()}`);
});

// Search.

test("user search: each card's account, verification, description, followers and follow state", () => {
  const page = parseUserSearch(userSearchHtml, 1);
  expect(page.items.map((u) => u.id)).toEqual(["1000000011", "1000000012", "1000000013"]);
  expect(page.next).toBe(2);
  const [lei, mi, fan] = page.items;
  expect(lei.name).toBe("雷军");
  expect(lei.avatar).toBe("https://tvax4.sinaimg.cn/crop.0.0.1080.1080.180/aaaa.jpg?KID=imgbed,tva&Expires=1795410551&ssig=x");
  expect(lei.verifiedKind).toBe("gold");
  expect(lei.description).toBe("小米创办人，董事长兼CEO；金山软件董事长；天使投资人。");
  expect(lei.followersCount).toBe(27335000);
  expect(lei.following).toBe(false);
  expect(mi.name).toBe("小米公司 & 生态"); // The match's highlight and entities gone.
  expect(mi.verifiedKind).toBe("org");
  expect(mi.following).toBe(true);
  expect(fan.verified).toBe(undefined);
  expect(fan.description).toBe(undefined);
  expect(fan.followersCount).toBe(812);
  expect(fan.avatar.startsWith("https://")).toBe(true);
  expect(fan.following && fan.followsMe).toBe(true);
});

test("user search: the last page has no next; a pager without cards is a changed page", () => {
  expect(parseUserSearch(userSearchHtml, 3).next).toBe(null);
  expect(parseUserSearch("<div>nothing</div>", 1)).toEqual({ items: [], next: null });
  expect(() => parseUserSearch('<a href="/user?q=x&page=2">2</a>', 1)).toThrow(WeiboChanged);
});

test("hot searches: in order, ads out, topics searched as #topic#, marks with their colors", () => {
  const words = parseHotSearch(hotSearch);
  expect(words.map((w) => w.word)).toEqual(["官方通报百万粉丝主播被指私闯果园", "许昌外卖小哥一句脆脆的带火炸鸡", "某部委员工泄密被判"]);
  expect(words[0].query).toBe("#官方通报百万粉丝主播被指私闯果园#");
  expect(words[0].label).toBe(undefined);
  expect(words[1]).toEqual({ word: "许昌外卖小哥一句脆脆的带火炸鸡", query: "许昌外卖小哥一句脆脆的带火炸鸡", count: 638922, label: { text: "热", color: "#ff9406" } });
  expect(() => parseHotSearch({ ok: 1, data: {} })).toThrow(WeiboChanged);
});

test("suggestions: whole accounts first, then those only named; searches once each", () => {
  const s = parseSuggest(sideSearch);
  expect(s.users.map((u) => [u.id, u.name])).toEqual([["1000000011", "雷军"], ["1000000014", "雷军的朋友"]]);
  expect(s.users[0].following).toBe(true);
  expect(s.users[0].verifiedKind).toBe("gold");
  expect(s.words).toEqual(["雷军回应小米售后锦旗", "雷军APEC", "雷军超话"]);
  expect(parseSuggest({ ok: 1, data: { hotquery: [], user: [], users: [] } })).toEqual({ users: [], words: [] });
});
