// What the timeline's common moves cost, on the stand-in feed of `TimelineHarness.tsx`. Not a test
// of behavior (`tests/` has those): `scripts/perf.sh` runs it with `--trace`, or `--fps` on a
// simulator, and sums up the timings each step logs. Each scenario is one `test`, picked with
// `--filter`. Its name keeps it out of `nsh test` (and CI), as it takes minutes: `scripts/perf.sh`
// runs a copy of it named as a test file.
import { open, test } from "nsh/test";

const SENTENCE = "今天在路上看到一只很胖的猫，蹲在便利店门口晒太阳，路过的人都忍不住停下来拍照。";
const LIST = "text:Following";

test("cold start: the first page of the timeline shows", async () => {
  const app = await open("./TimelineHarness.tsx");
  await app.waitFor(`text:0: ${SENTENCE}`);
}, 120_000);

test("scroll: down the whole feed and back up", async () => {
  const app = await open("./TimelineHarness.tsx");
  await app.waitFor(`text:0: ${SENTENCE}`);
  // 200 posts, about 90 points each and more: a long way down, a page and a half a drag, loading
  // a new page of the feed every so often.
  for (let i = 0; i < 40; i++) await app.scroll(LIST, 1200);
  for (let i = 0; i < 40; i++) await app.scroll(LIST, -1200);
}, 600_000);

test("open: a post's page and back, five times", async () => {
  const app = await open("./TimelineHarness.tsx");
  const first = `text:0: ${SENTENCE}`;
  await app.waitFor(first);
  for (let i = 0; i < 5; i++) {
    await app.press(first);
    await app.waitFor("text:Post");
    // The page's own back button (`BackButton`): on iOS there is no system one to press.
    await app.press("label:Back");
    await app.waitFor("text:Post", { state: "gone" });
  }
}, 300_000);
