// Saved first pages (`saved.ts`, `feed.ts`): shown while the first page loads and kept when it
// fails; replaced, and saved again, when it loads.
import { Storage } from "nsh";
import { beforeEach, expect, test } from "nsh/test";
import type { Page } from "../api";
import { createFeed } from "../feed";
import { clearSaved, loadSaved, save } from "../saved";

type Item = { id: string };

// A loader whose answers the test gives, one request at a time.
function loader() {
  const calls: (string | undefined)[] = [];
  let answer: { resolve: (p: Page<Item>) => void; reject: (e: Error) => void } | undefined;
  const load = (cursor?: string) => {
    calls.push(cursor);
    return new Promise<Page<Item>>((resolve, reject) => (answer = { resolve, reject }));
  };
  return {
    load,
    calls,
    resolve: (p: Page<Item>) => answer!.resolve(p),
    reject: (e: Error) => answer!.reject(e),
  };
}

async function until(condition: () => boolean) {
  for (let i = 0; i < 200 && !condition(); i++) await new Promise((r) => setTimeout(r, 1));
  expect(condition()).toBe(true);
}

beforeEach(() => clearSaved());

test("the saved page shows while the first page loads, then gives way to it", async () => {
  await save("feed", { items: [{ id: "old" }], next: "c1" });
  const l = loader();
  const feed = createFeed<Item>(l.load, { saveAs: () => "feed" });
  feed.more();
  await until(() => feed.items().length > 0);
  expect(feed.items()).toEqual([{ id: "old" }]);
  expect(feed.savedAt()).toBeGreaterThan(0);
  expect(feed.loading()).toBe(true);

  l.resolve({ items: [{ id: "new" }], next: "c2" });
  await until(() => !feed.loading());
  expect(feed.items()).toEqual([{ id: "new" }]);
  expect(feed.savedAt()).toBeNull();
  await until(() => true);
  expect((await loadSaved<Page<Item>>("feed"))?.data).toEqual({ items: [{ id: "new" }], next: "c2" });
});

test("a failed first load keeps the saved page, with the error; a retry loads the first page", async () => {
  await save("feed", { items: [{ id: "old" }], next: "c1" });
  const l = loader();
  const feed = createFeed<Item>(l.load, { saveAs: () => "feed" });
  feed.more();
  l.reject(new Error("offline"));
  await until(() => !feed.loading());
  expect(feed.items()).toEqual([{ id: "old" }]);
  expect(feed.error()).toBe("offline");
  expect(feed.savedAt()).toBeGreaterThan(0);

  // Not the saved cursor: the saved items are not continued from.
  feed.more();
  expect(l.calls).toEqual([undefined, undefined]);
  l.resolve({ items: [{ id: "new" }], next: null });
  await until(() => !feed.loading());
  expect(feed.items()).toEqual([{ id: "new" }]);
  expect(feed.error()).toBeNull();
  expect(feed.savedAt()).toBeNull();
});

test("later pages continue from the loaded one's cursor and are not saved", async () => {
  const l = loader();
  const feed = createFeed<Item>(l.load, { saveAs: () => "feed" });
  feed.more();
  l.resolve({ items: [{ id: "a" }], next: "c1" });
  await until(() => !feed.loading());
  feed.more();
  l.resolve({ items: [{ id: "b" }], next: null });
  await until(() => !feed.loading());
  expect(l.calls).toEqual([undefined, "c1"]);
  expect(feed.items().map((i) => i.id)).toEqual(["a", "b"]);
  expect((await loadSaved<Page<Item>>("feed"))?.data.items).toEqual([{ id: "a" }]);
});

test("nothing saved: a failed first load shows the error alone", async () => {
  const l = loader();
  const feed = createFeed<Item>(l.load, { saveAs: () => "feed" });
  feed.more();
  l.reject(new Error("offline"));
  await until(() => !feed.loading());
  expect(feed.items()).toEqual([]);
  expect(feed.error()).toBe("offline");
  expect(feed.savedAt()).toBeNull();
});

test("a feed without saveAs saves nothing", async () => {
  const l = loader();
  const feed = createFeed<Item>(l.load);
  feed.more();
  l.resolve({ items: [{ id: "a" }], next: null });
  await until(() => !feed.loading());
  expect((await Storage.keys()).filter((k) => k.startsWith("saved:"))).toEqual([]);
});

test("a saved entry that does not parse reads as none", async () => {
  await Storage.setItem("saved:v1:broken", "{not json");
  expect(await loadSaved("broken")).toBeNull();
  await Storage.setItem("saved:v1:empty", JSON.stringify({ at: 1, data: null }));
  expect(await loadSaved("empty")).toBeNull();
});

test("the oldest entries go past the limit", async () => {
  for (let i = 0; i < 45; i++) await save(`k${i}`, i);
  expect(await loadSaved("k0")).toBeNull();
  expect(await loadSaved("k4")).toBeNull();
  expect((await loadSaved<number>("k5"))?.data).toBe(5);
  expect((await loadSaved<number>("k44"))?.data).toBe(44);
});

test("signing out forgets what was saved, and only that", async () => {
  await Storage.setItem("other", "kept");
  await save("feed", { items: [{ id: "a" }], next: null });
  await clearSaved();
  expect(await loadSaved("feed")).toBeNull();
  expect(await Storage.getItem("other")).toBe("kept");
});
