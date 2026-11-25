import { expect, open, test } from "nsh/test";

test("panel mounts at bottom, rises on hardware-keyboard fallback, can reopen mid-close, and unmounts cleanly", async () => {
  const app = await open("./fixtures/ReplyHarness.tsx", {
    width: 390,
    height: 844,
    safeArea: { top: 59, bottom: 34 },
    clock: {},
  });

  // Open comment composer: before a keyboard rises, it sits at `bottom: 0` ready to ride up.
  await app.press("id:open-comment");
  const initial = app.layout("label:Comment on @Alice's post");
  expect(initial).not.toBeNull();
  expect(Math.round(initial!.y + initial!.height)).toBe(844);

  // Without a software keyboard, it stands at the bottom with safe-area padding after the wait window.
  await app.clock!.runFor(650);
  const up = app.layout("label:Comment on @Alice's post");
  expect(up).not.toBeNull();
  expect(up!.height).toBeGreaterThan(initial!.height);
  expect(Math.round(up!.y + up!.height)).toBe(844);

  // Typing and closing keeps the draft and lets touches pass through immediately.
  await app.type("text:Write a comment…", "Draft text");
  await app.press("label:Cancel >> nth=1");

  // Re-opening another target while still closing cancels the unmount and switches cleanly.
  await app.press("id:open-repost");
  await app.clock!.runFor(650);
  const reopened = app.layout("label:Repost @Bob's comment");
  expect(reopened).not.toBeNull();
  expect(Math.round(reopened!.y + reopened!.height)).toBe(844);

  // Closing via the backdrop unmounts cleanly once the exit animation settles.
  await app.press("label:Cancel >> nth=0");
  await app.clock!.runFor(400);
  expect(app.shows("label:Repost @Bob's comment")).toBe(false);

  // Re-opening the first target restores its draft.
  await app.press("id:open-comment");
  await app.clock!.runFor(650);
  expect(app.value("text:Draft text")).toBe("Draft text");
});

test("signing out forgets the drafts", async () => {
  const app = await open("./fixtures/ReplyHarness.tsx", { clock: {} });
  await app.press("id:open-comment");
  await app.clock!.runFor(650);
  await app.type("text:Write a comment…", "Draft text");
  await app.press("label:Cancel >> nth=1");
  await app.clock!.runFor(400);

  await app.press("id:forget");
  await app.press("id:open-comment");
  await app.clock!.runFor(650);
  expect(app.shows("text:Draft text")).toBe(false);
  expect(app.value("text:Write a comment…")).toBe("");
});
