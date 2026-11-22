// Saving pictures and videos: the file's name, a video's qualities, and the hidden web view's
// download, step by step.
import { expect, test } from "nsh/test";
import { parseTimeline } from "../api";
import { download, downloader, fileName, hostPage, job } from "../download";
import friendstimeline from "./fixtures/friendstimeline.json";

test("a file is named as its URL names it", () => {
  expect(fileName("https://wx1.sinaimg.cn/large/006aaaa1ly1hxyz0001.jpg")).toBe("006aaaa1ly1hxyz0001.jpg");
  expect(fileName("https://f.video.weibocdn.com/o0/abc.mp4?label=mp4_720p&Expires=1&ssig=x%2Fy")).toBe("abc.mp4");
  // No extension: its type gives one; odd characters go.
  expect(fileName("https://f.video.weibocdn.com/play/a b", "video/mp4")).toBe("a_b.mp4");
  expect(fileName("https://example.com/", "image/png")).toBe("weibo.png");
});

test("a video lists its qualities, best first, each size once", () => {
  const answer = JSON.parse(JSON.stringify(friendstimeline));
  // The post's own video, which shows once its repost is gone.
  delete answer.statuses[1].retweeted_status;
  const s = parseTimeline(answer, "110001000000001").items.find((i) => i.video)!;
  expect(s.video?.src).toBe("https://f.video.weibocdn.com/720/video0001.mp4");
  expect(s.video?.qualities).toEqual([
    { label: "1080p", url: "https://f.video.weibocdn.com/hd/video0001.mp4", height: 1080 },
    { label: "720p", url: "https://f.video.weibocdn.com/720/video0001.mp4", height: 720 },
  ]);
});

test("a download opens a page on the file's host", () => {
  expect(hostPage("https://f.video.weibocdn.com/o0/abc.mp4?label=mp4_720p")).toBe("https://f.video.weibocdn.com/");
});

const URL_ = "https://f.video.weibocdn.com/o0/abc.mp4?Expires=1";

test("a download clicks once, then takes the file the click made", async () => {
  const saved = download(URL_, "video");
  expect(job()?.name).toBe("abc.mp4");
  const injected: string[] = [];
  downloader.onLoad((s) => injected.push(s));
  downloader.onLoad((s) => injected.push(s)); // The page loaded again: no second click.
  expect(injected.length).toBe(1);
  expect(injected[0]).toContain(JSON.stringify(URL_));
  // A download before the click is not this one's.
  downloader.onDownload({ state: "finished", id: "0", url: "x", filename: "x", path: "/d/0/x", source: "transfer" });
  expect(job()).not.toBeNull();
  downloader.onMessage(JSON.stringify({ clicked: true }));
  downloader.onDownload({ state: "started", id: "1", url: URL_, filename: "abc.mp4", path: "/d/1/abc.mp4", source: "transfer" });
  downloader.onDownload({ state: "finished", id: "1", url: URL_, filename: "abc.mp4", path: "/d/1/abc.mp4", source: "transfer", bytes: 50_000_000 });
  expect(await saved).toBe("/d/1/abc.mp4");
  expect(job()).toBeNull();
});

test("a file that answers as no video fails the save", async () => {
  const saved = download(URL_, "video");
  downloader.onLoad(() => {});
  downloader.onMessage(JSON.stringify({ error: "HTTP 403 text/html" }));
  await expect(saved).rejects.toThrow("HTTP 403 text/html");
  expect(job()).toBeNull();
});

test("a failed download fails the save; one at a time", async () => {
  const saved = download(URL_, "video");
  await expect(download(URL_, "video")).rejects.toThrow("already");
  downloader.onLoad(() => {});
  downloader.onMessage(JSON.stringify({ clicked: true }));
  downloader.onDownload({ state: "failed", id: "2", url: URL_, filename: "abc.mp4", path: "", source: "transfer", message: "network lost" });
  await expect(saved).rejects.toThrow("network lost");
});
