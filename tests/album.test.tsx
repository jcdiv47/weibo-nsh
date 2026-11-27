// The album strip on a profile and the album it opens (`pages/Album.tsx`), over stand-in posts
// (`fixtures/albumPosts.ts`): pictures of the account's own posts only, read on past a page of
// posts with none, each opening the viewer or the player.
import { expect, open, test } from "nsh/test";

test("the profile shows its latest pictures and videos, and a press opens them all", async () => {
  const app = await open("./fixtures/AlbumHarness.tsx");
  await app.press("id:open-profile");
  await app.waitFor("label:Album");
  await app.press("label:Album");

  // The album reads on past the second page of posts, which has no pictures, to the third.
  await app.waitFor("label:Picture, Sep 20, 2025");
  expect(app.count("label:Video: 落日, Nov 10")).toBe(1);
  // November's two, October's three and September's one: not the pinned post's, nor the liked one's.
  expect(app.count("text:November")).toBe(1);
  expect(app.count("text:October")).toBe(1);
  expect(app.count("text:September 2025")).toBe(1);
  await app.waitFor("text:No more");
});

test("a picture opens the viewer among all the album's pictures", async () => {
  const app = await open("./fixtures/AlbumHarness.tsx");
  await app.press("id:open-profile");
  await app.press("label:Album");
  await app.waitFor("label:Picture, Sep 20, 2025");

  await app.press("label:Picture, Sep 20, 2025");
  await app.waitFor("text:6 / 6");
});

test("a video in the album opens the player", async () => {
  const app = await open("./fixtures/AlbumHarness.tsx");
  await app.press("id:open-profile");
  await app.press("label:Album");
  await app.press("label:Video: 落日, Nov 10");
  await app.waitFor("label:Position");
});
