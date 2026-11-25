// Search (`pages/Search.tsx`) over stand-in bridges (`fixtures/SearchHarness.tsx`): its rows follow
// what is typed, and a follow from the results belongs to its account, not to the row showing it.
import { expect, open, test } from "nsh/test";

test("the first row searches for what is typed now, not for what was typed when it appeared", async () => {
  const app = await open("./fixtures/SearchHarness.tsx");
  await app.press("id:open-search");
  await app.type("text:Search posts and people", "雷");
  await app.waitFor("label:Search “雷”");
  await app.waitFor("label:雷 suggested");

  await app.type("text:雷", "军");
  await app.waitFor("label:Search “雷军”");
  expect(app.shows("label:Search “雷”")).toBe(false);
  // The suggestions follow too, once typing pauses.
  await app.waitFor("label:雷军 suggested");
});

test("a follow shows on its own account's row, and a refusal only on the refused one", async () => {
  const app = await open("./fixtures/SearchHarness.tsx");
  await app.press("id:open-results");
  await app.press("label:People");
  await app.waitFor("label:Follow 雷军");

  // Both asked for at once: the rows wait on their own answers.
  await app.press("label:Follow 雷军");
  await app.press("label:Follow 小米公司 & 生态");
  await app.press("id:answer");

  await app.waitFor("text:Retry");
  expect(app.count("text:Retry")).toBe(1);
  // The followed account says so; the refused one still offers to follow.
  expect(app.shows("label:Follow 雷军")).toBe(false);
  expect(app.shows("label:Follow 小米公司 & 生态")).toBe(true);
  expect(app.shows("label:Follow 雷军199506")).toBe(true);
  expect(app.count("text:Following")).toBe(1);
});

test("signing out forgets a refused follow", async () => {
  const app = await open("./fixtures/SearchHarness.tsx");
  await app.press("id:open-results");
  await app.press("label:People");
  await app.waitFor("label:Follow 小米公司 & 生态");
  await app.press("label:Follow 小米公司 & 生态");
  await app.press("id:answer");
  await app.waitFor("text:Retry");

  await app.press("id:forget");
  await app.waitUntil(() => !app.shows("text:Retry"));
  expect(app.shows("label:Follow 小米公司 & 生态")).toBe(true);
});
