// The bounded maps the pages keep posts, long texts and comments in (`bounded.ts`, `nav.ts`).
import { expect, test } from "nsh/test";
import type { Status } from "../api";
import { BoundedMap } from "../bounded";
import { KEPT, keepPost, postById } from "../nav";

test("past its size, the map drops the entry used longest ago", () => {
  const m = new BoundedMap<string, number>(3);
  m.set("a", 1).set("b", 2).set("c", 3);
  expect(m.get("a")).toBe(1); // "a" is now the one used last; "b" the one used longest ago.
  m.set("d", 4);
  expect(m.size).toBe(3);
  expect(m.has("b")).toBe(false);
  expect([...m.keys()]).toEqual(["c", "a", "d"]);
  // Setting a key again moves it last, without growing the map.
  m.set("c", 30);
  m.set("e", 5);
  expect([...m.entries()]).toEqual([["d", 4], ["c", 30], ["e", 5]]);
  expect(m.get("missing")).toBe(undefined);
});

test("the posts kept for the pages stay bounded, the newest kept", () => {
  const post = (id: string) => ({ id }) as Status;
  for (let i = 0; i < KEPT + 50; i++) keepPost(`p${i}`, post(`p${i}`));
  expect(postById("p0")).toBe(undefined);
  expect(postById("p49")).toBe(undefined);
  expect(postById("p50")?.id).toBe("p50");
  expect(postById(`p${KEPT + 49}`)?.id).toBe(`p${KEPT + 49}`);
});
