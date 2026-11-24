// The two pages of a wide screen (`nav.ts`): as the Duo opens, what is read moves to the reader;
// as it closes, the reader's pages go back on top of the list's.
import { beforeEach, expect, test } from "nsh/test";
import { fitColumns, nav, reader } from "../nav";

beforeEach(() => {
  nav.setRoutes([{ name: "timeline" }]);
  reader.setRoutes([{ name: "unopened" }]);
});

test("opening moves the pages from the first post onwards to the reader", () => {
  nav.setRoutes([
    { name: "timeline" },
    { name: "profile", uid: "1" },
    { name: "post", id: "a" },
    { name: "replies", postId: "a", commentId: "c" },
  ]);
  fitColumns(true);
  expect(nav.routes()).toEqual([{ name: "timeline" }, { name: "profile", uid: "1" }]);
  expect(reader.routes()).toEqual([
    { name: "post", id: "a" },
    { name: "replies", postId: "a", commentId: "c" },
  ]);
});

test("opening with nothing read leaves the reader unopened", () => {
  nav.setRoutes([{ name: "timeline" }, { name: "search" }]);
  fitColumns(true);
  expect(nav.routes()).toEqual([{ name: "timeline" }, { name: "search" }]);
  expect(reader.routes()).toEqual([{ name: "unopened" }]);
});

test("closing puts the reader's pages on top of the list's", () => {
  nav.setRoutes([{ name: "timeline" }, { name: "topic", topic: "t" }]);
  reader.setRoutes([{ name: "post", id: "a" }, { name: "edits", id: "a" }]);
  fitColumns(false);
  expect(nav.routes()).toEqual([
    { name: "timeline" },
    { name: "topic", topic: "t" },
    { name: "post", id: "a" },
    { name: "edits", id: "a" },
  ]);
  expect(reader.routes()).toEqual([{ name: "unopened" }]);
});

test("closing with nothing read changes nothing", () => {
  fitColumns(false);
  expect(nav.routes()).toEqual([{ name: "timeline" }]);
});
