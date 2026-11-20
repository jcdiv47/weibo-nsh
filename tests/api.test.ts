// The parsers of `api.ts` against Weibo's answers (`fixtures/`), and what they do when an answer
// changes shape. When Weibo changes an endpoint: save its new answer here (the `[weibo drift]` log
// line carries a sample), see which test fails, and fix the mapping in `api.ts`.
import { expect, test } from "nsh/test";
import {
  parseComments,
  parseGroups,
  parseLongText,
  parsePeople,
  parseProfile,
  parseStatus,
  parseTimeline,
  parseUserPosts,
} from "../api";
import { driftReports, WeiboChanged } from "../drift";
import allGroups from "./fixtures/allGroups.json";
import buildComments from "./fixtures/buildComments.json";
import friends from "./fixtures/friends.json";
import friendstimeline from "./fixtures/friendstimeline.json";
import longtext from "./fixtures/longtext.json";
import mymblog from "./fixtures/mymblog.json";
import profileInfo from "./fixtures/profileInfo.json";
import profileInfoBlocked from "./fixtures/profileInfoBlocked.json";
import replies from "./fixtures/replies.json";
import statusShow from "./fixtures/statusShow.json";

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
    user: { id: "2000000001", name: "晚霞观察员", verified: "摄影博主", following: true, followsMe: false },
  });
  expect(s.pics).toEqual([
    {
      thumb: "https://wx1.sinaimg.cn/wap360/006aaaa1ly1hxyz0001.jpg",
      large: "https://wx1.sinaimg.cn/large/006aaaa1ly1hxyz0001.jpg",
    },
    // No `pic_infos` for it: the addresses its id makes.
    {
      thumb: "https://wx1.sinaimg.cn/orj360/006aaaa1ly1hxyz0002.jpg",
      large: "https://wx1.sinaimg.cn/large/006aaaa1ly1hxyz0002.jpg",
    },
  ]);
  expect(s.links["http://t.cn/A6abcd"]).toEqual({ title: "网页链接", url: "https://example.com/sunset", video: false });
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
  });
  // A `sinaweibo://` link opens its web address.
  expect(s.retweeted?.links["http://t.cn/A6vid1"]).toMatchObject({ url: "https://video.weibo.com/show?fid=1", video: true });
});

test("timeline: pictures of a mixed post", () => {
  const s = parseTimeline(friendstimeline, GID).items[2];
  expect(s.isLongText).toBe(true);
  expect(s.pics).toEqual([
    {
      thumb: "https://wx1.sinaimg.cn/orj360/006mine01ly1hmix0001.jpg",
      large: "https://wx1.sinaimg.cn/large/006mine01ly1hmix0001.jpg",
    },
  ]);
});

test("long text and its links", () => {
  expect(parseLongText(longtext)).toEqual({
    text: "我自己发的，这是全文。详情见 http://t.cn/A6long1",
    links: { "http://t.cn/A6long1": { title: "网页链接", url: "https://example.com/long", video: false } },
  });
});

test("comments: pictures, previewed replies without their parent's links", () => {
  const page = parseComments(buildComments);
  expect(page.next).toBe("139000000000000");
  const [first, second] = page.items;
  expect(first).toMatchObject({ id: "5200000000000001", likes: 25, replyCount: 3, user: { name: "路人甲" } });
  expect(first.pics).toEqual([
    {
      thumb: "https://wx1.sinaimg.cn/orj360/008cmt01ly1hcmt0001.jpg",
      large: "https://wx2.sinaimg.cn/large/008cmt01ly1hcmt0001.jpg",
    },
  ]);
  expect(first.preview.map((r) => r.text)).toEqual(["同感"]);
  expect(first.preview[0].pics).toEqual([]);
  expect(second.preview).toEqual([]);
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
  expect(page.items.map((s) => s.text)).toEqual(["早安"]);
  expect(page.next).toBe(2);
  expect(parseUserPosts({ ok: 1, data: { list: [] } }, 3).next).toBeNull();
});

test("one post", () => {
  expect(parseStatus(statusShow)).toMatchObject({ id: "5100000000000201", text: "#晚霞# 今天也很好看", likes: 50 });
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
