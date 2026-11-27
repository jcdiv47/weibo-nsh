// The timeline over a stand-in bridge, for measuring what scrolling it costs (`scripts/perf.sh`,
// `perf/README.md`). The web view's `evaluate` answers from here, as weibo.com would, so the page
// runs its real requests, parsers, list and cards; only the network is missing. The feed is
// `PAGES` pages of `PAGE_SIZE` posts, made from the fixtures' posts with varied text and picture
// counts, so a scroll meets the mix of cards a real timeline has. Posts open their post page, whose
// comments come from the fixtures too.
import { mount, View, type WebViewRef } from "nsh";
import { NavStack } from "nsh/base";
import { weibo } from "../bridge";
import { ImageViewer } from "../components/ImageViewer";
import { ReplySheet } from "../components/ReplySheet";
import { nav } from "../nav";
import { Post } from "../pages/Post";
import { Timeline } from "../pages/Timeline";
import allGroups from "../tests/fixtures/allGroups.json";
import buildComments from "../tests/fixtures/buildComments.json";
import friendstimeline from "../tests/fixtures/friendstimeline.json";
import profileInfo from "../tests/fixtures/profileInfo.json";

const PAGES = 10;
const PAGE_SIZE = 20;
/** The first post's id: later posts count down from it, as Weibo's ids do with age. */
const NEWEST = 5200000000000000;

type Answer = { status: number; url: string; json: unknown; text: string | null };
const json = (body: unknown): Answer => ({ status: 200, url: "https://weibo.com/", json: body, text: null });

const sentence = "今天在路上看到一只很胖的猫，蹲在便利店门口晒太阳，路过的人都忍不住停下来拍照。";
const base = friendstimeline.statuses as any[];
const withPics = base.find((s) => s.pic_ids?.length) ?? base[0];

/** The `n`th post of the feed (0: the newest): text one to six sentences long, nought to nine
 * pictures, every fifth post a repost of another. */
function post(n: number): any {
  const id = String(NEWEST - n);
  const s = JSON.parse(JSON.stringify(base[n % base.length]));
  s.id = Number(id);
  s.idstr = s.mid = id;
  s.mblogid = `P${n}`;
  const text = `${n}: ${sentence.repeat((n % 6) + 1)}`;
  s.text = s.text_raw = text;
  s.textLength = text.length;
  const pics = (n * 7) % 10;
  const info = Object.values(withPics.pic_infos ?? {})[0] as any;
  s.pic_ids = [];
  s.pic_infos = {};
  for (let i = 0; i < pics && info; i++) {
    const pid = `perf${n}x${i}`;
    s.pic_ids.push(pid);
    s.pic_infos[pid] = JSON.parse(JSON.stringify(info).replaceAll(withPics.pic_ids[0], pid));
  }
  if (n % 5 === 4) {
    const original = JSON.parse(JSON.stringify(base[(n + 1) % base.length]));
    original.idstr = original.mid = `${id}1`;
    original.id = Number(original.idstr);
    s.retweeted_status = original;
  } else {
    delete s.retweeted_status;
  }
  return s;
}

/** The page after `maxId` (none: the first), as weibo.com's `friendstimeline` answers. */
function timelinePage(maxId: string | null): unknown {
  const start = maxId === null ? 0 : NEWEST - Number(maxId) + 1;
  const end = Math.min(start + PAGE_SIZE, PAGES * PAGE_SIZE);
  const statuses = [];
  for (let n = start; n < end; n++) statuses.push(post(n));
  const last = end < PAGES * PAGE_SIZE ? String(NEWEST - end + 1) : "0";
  return { ...friendstimeline, statuses, since_id: String(NEWEST), max_id: last, max_id_str: last };
}

function answer(path: string): Answer {
  if (path.startsWith("/ajax/feed/allGroups")) return json(allGroups);
  if (path.startsWith("/ajax/feed/friendstimeline")) {
    const q = new URLSearchParams(path.split("?")[1] ?? "");
    // Nothing newer than what shows: the new posts count stays at none.
    if (q.get("since_id") !== "0") return json({ ...friendstimeline, statuses: [] });
    return json(timelinePage(q.get("max_id")));
  }
  if (path.startsWith("/ajax/profile/info")) return json(profileInfo);
  if (path.startsWith("/ajax/statuses/buildComments")) return json(buildComments);
  return json({ ok: 0, msg: `no stand-in for ${path}` });
}

weibo.attach({
  load() {},
  async evaluate(script: string) {
    // The page's script holds the path as `fetch("<path>", init)`.
    const path = JSON.parse(/fetch\((".*?"), init\)/.exec(script)![1]) as string;
    return { value: answer(path) };
  },
} as unknown as WebViewRef);
weibo.onLoad(weibo.idleUrl);

function Harness() {
  return (
    <View class="flex-1 bg-ground">
      <NavStack state={nav} class="flex-1">
        {(route) => (route.name === "post" ? <Post id={route.id} /> : <Timeline />)}
      </NavStack>
      <ReplySheet />
      <ImageViewer />
    </View>
  );
}

mount(Harness);
