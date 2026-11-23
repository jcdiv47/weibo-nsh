// The timeline's new posts (`news.ts`): counted from a check, shown at the top without another
// request, and gone once a refresh brought them in.
import { signal } from "nsh";
import { expect, test } from "nsh/test";
import type { Page } from "../api";
import { createFeed } from "../feed";
import { createNews } from "../news";

type Item = { id: string };
const items = (...ids: number[]) => ids.map((id) => ({ id: String(id) }));

async function until(condition: () => boolean) {
  for (let i = 0; i < 2000 && !condition(); i++) await new Promise((r) => setTimeout(r, 1));
  expect(condition()).toBe(true);
}

function setup(answer: { items: Item[]; more: boolean }, first: Page<Item> = { items: items(3, 2, 1), next: null }) {
  let pages = 0;
  const feed = createFeed<Item>(async () => (pages++ ? { items: items(6, 5, 4, 3, 2, 1), next: null } : first));
  const checks: string[] = [];
  const inView = signal(true);
  const news = createNews(
    feed,
    async (since) => {
      checks.push(since);
      return answer;
    },
    () => inView(),
    20,
  );
  feed.more();
  return { feed, news, checks, inView, pages: () => pages };
}

test("counts the new posts and shows them at the top without another load", async () => {
  const { feed, news, checks, pages } = setup({ items: items(5, 4, 3), more: false });
  await until(() => news.count() > 0);
  expect(checks[0]).toBe("3");
  expect(news.count()).toBe(2); // 3 is shown already.
  expect(news.more()).toBe(false);
  news.show();
  expect(feed.items().map((i) => i.id)).toEqual(["5", "4", "3", "2", "1"]);
  expect(news.count()).toBe(0);
  expect(pages()).toBe(1);
});

test("more than a page: showing them loads the first page again", async () => {
  const { feed, news, pages } = setup({ items: items(6, 5, 4), more: true });
  await until(() => news.count() > 0);
  expect(news.more()).toBe(true);
  news.show();
  await until(() => !feed.refreshing() && pages() === 2);
  expect(feed.items().map((i) => i.id)).toEqual(["6", "5", "4", "3", "2", "1"]);
  expect(news.count()).toBe(0);
});

test("a refresh that brings them in clears the count", async () => {
  const { feed, news } = setup({ items: items(5, 4), more: false });
  await until(() => news.count() > 0);
  await feed.refresh();
  expect(news.count()).toBe(0);
});

test("no checks while the timeline is out of view", async () => {
  const { news, checks, inView } = setup({ items: items(5), more: false });
  inView.set(false);
  await new Promise((r) => setTimeout(r, 80));
  expect(checks.length).toBe(0);
  expect(news.count()).toBe(0);
  inView.set(true);
  await until(() => checks.length > 0);
});
