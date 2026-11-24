// Saving a post's picture or video to the device, at any size.
//
// The bytes never pass through the app's JS (NSH writes a file of at most 8 MiB in one piece): a
// hidden web view downloads the file. It opens a page on the file's own host (any page: an error
// page will do), so a link to the file is same-origin and its `download` attribute holds; a click
// on it makes the web engine save the file, streamed to disk, in the app's data directory
// (`downloads/<id>/<name>`, `WebView` `onDownload`). A save then puts it into the photo library on
// iOS (`weibo-media`'s `PhotoLibrary`, the app's own Rust in `ext/`); `shareMedia` hands it to the
// system's share sheet (WeChat, X, Messages, "Save to Files"...). Either way it is removed after.
//
// Before the click the page asks for the file's first byte, so an answer that is no picture or
// video (an expired link, a refusal) fails the save instead of saving an error page.
import { rmdir, unlink } from "fs/promises";
import { Share, signal, type ViewRef, type WebViewDownload } from "nsh";
import { PhotoLibrary } from "weibo-media";

/** A save puts the file into the photo library: iOS. On Android a save could only open the share
 * sheet, as sharing does, so there is no save there. */
export const CAN_SAVE = PhotoLibrary.available();

/** How long a download may take, from the page's start to the file's end. */
const TIMEOUT_MS = 15 * 60_000;

export interface SaveResult {
  /** `"photos"`: added to the photo library (iOS); `"shared"`: the share sheet took it;
   * `"dismissed"`: the share sheet was closed without taking it. */
  outcome: "photos" | "shared" | "dismissed";
  /** Where the temporary file was before removal. */
  path: string;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

/** The file's name: the last part of its URL's path (Weibo's names are unique ids), with an
 * extension from its type when it has none. */
export function fileName(url: string, type = ""): string {
  const path = url.replace(/[?#].*$/, "");
  let name = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1)).replace(/[^A-Za-z0-9._-]/g, "_");
  name = name.replace(/^\.+/, "").slice(-120) || "weibo";
  const ext = EXTENSIONS[type.split(";")[0].trim().toLowerCase()];
  if (ext && !/\.[A-Za-z0-9]{2,4}$/.test(name)) name += `.${ext}`;
  return name;
}

/** The page the download web view opens: the host's root, on the file's origin. */
export const hostPage = (url: string) => `${new URL(url).origin}/`;

/** The script the page runs: check the file answers as a picture or video, then click a
 * same-origin `download` link to it. It reports through `window.nsh.postMessage`. */
export const clickScript = (url: string, name: string, kind: "image" | "video") => `(async () => {
  const say = (m) => window.nsh.postMessage(JSON.stringify(m));
  try {
    const url = ${JSON.stringify(url)};
    const r = await fetch(url, { headers: { Range: "bytes=0-0" }, cache: "no-store" });
    const type = r.headers.get("content-type") || "";
    r.body && r.body.cancel().catch(() => {});
    if (!r.ok || !/^${kind}\\//i.test(type)) return say({ error: "HTTP " + r.status + (type ? " " + type : "") });
    const a = document.createElement("a");
    a.href = url;
    a.download = ${JSON.stringify(name)};
    document.documentElement.appendChild(a);
    a.click();
    say({ clicked: true });
  } catch (e) {
    say({ error: String(e && e.message || e) });
  }
})()`;

/** The download under way: the one `Downloader` runs. One at a time. */
export interface Job {
  url: string;
  name: string;
  kind: "image" | "video";
  /** The page was asked to check and click (once: a page may load again). */
  injected: boolean;
  /** The link was clicked: downloads that come before are not this one's. */
  clicked: boolean;
  /** The download the click started (the first to start after it): only its end counts. */
  id?: string;
  done(path: string): void;
  fail(error: Error): void;
}

export const job = signal<Job | null>(null);

/** Downloads `url` through the hidden web view: resolves with where the file is. */
export function download(url: string, kind: "image" | "video"): Promise<string> {
  if (job()) return Promise.reject(new Error("A download is already under way"));
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      clearTimeout(timer);
      job.set(null);
    };
    const j: Job = {
      url,
      name: fileName(url, kind === "video" ? "video/mp4" : "image/jpeg"),
      kind,
      injected: false,
      clicked: false,
      done: (path) => {
        end();
        resolve(path);
      },
      fail: (error) => {
        end();
        reject(error);
      },
    };
    timer = setTimeout(() => j.fail(new Error("The download took too long")), TIMEOUT_MS);
    job.set(j);
  });
}

/** What the hidden web view hears, for the job under way. */
export const downloader = {
  onLoad(inject: (script: string) => void) {
    const j = job();
    if (!j || j.injected) return;
    j.injected = true;
    inject(clickScript(j.url, j.name, j.kind));
  },
  onMessage(data: string) {
    const j = job();
    if (!j) return;
    let m: { clicked?: boolean; error?: string } = {};
    try {
      m = JSON.parse(data);
    } catch {}
    if (m.error) j.fail(new Error(m.error));
    else if (m.clicked) j.clicked = true;
  },
  onDownload(d: WebViewDownload) {
    const j = job();
    if (!j || !j.clicked) return;
    if (d.state === "started" && !j.id) j.id = d.id;
    if (d.id !== j.id) return;
    if (d.state === "finished") j.done(d.path);
    else if (d.state === "failed" || d.state === "cancelled") j.fail(new Error(d.message || d.code || d.state));
  },
  onError(message: string) {
    job()?.fail(new Error(message));
  },
};

/** Removes a downloaded file and its `downloads/<id>` directory. */
async function remove(path: string) {
  await unlink(path).catch(() => {});
  await rmdir(path.slice(0, path.lastIndexOf("/"))).catch(() => {});
}

/** The view a share sheet points at (what was pressed), read when the sheet opens: on an iPad it
 * shows there rather than over the middle of the window. */
export type Anchor = () => ViewRef | undefined;

/** Saves the picture or video at `url` into the photo library (iOS: `CAN_SAVE`). Rejects with
 * `code` `"EACCES"` when the user does not let the app add to Photos. */
export async function saveMedia(url: string, kind: "image" | "video"): Promise<SaveResult> {
  const path = await take(url, kind);
  try {
    await PhotoLibrary.save(path, kind === "video");
    return { outcome: "photos", path };
  } finally {
    await remove(path);
  }
}

/** Hands a downloaded file to the share sheet, then removes it: the targets copied it. `onSheet`
 * hears that the sheet is opening: the wait is over, the user is in the sheet. */
async function shareFile(path: string, anchor?: Anchor, onSheet?: () => void): Promise<SaveResult> {
  try {
    onSheet?.();
    const { action } = await Share.show({ files: [path], anchor: anchor?.() });
    return { outcome: action, path };
  } finally {
    await remove(path);
  }
}

/** Shares the picture or video at `url` to another app (WeChat, X, Messages...) through the
 * system's share sheet, which lists the apps installed that take it. */
export async function shareMedia(
  url: string,
  kind: "image" | "video",
  anchor?: Anchor,
  onSheet?: () => void,
): Promise<SaveResult> {
  return shareFile(await take(url, kind), anchor, onSheet);
}

/** A file fetched ahead (`prefetch`) for the save or share the user is likely to choose next. */
let ahead: { url: string; file: Promise<string>; timer: ReturnType<typeof setTimeout> } | null = null;

/** How long a file fetched ahead waits for a save or share before it is removed. */
const AHEAD_MS = 2 * 60_000;

/** Starts downloading the file at `url` into the app's storage before the user chooses (a picture's
 * menu opened), so that a save or share then starts from the file at once instead of waiting for
 * it. Nothing when it is already fetched or another download is under way. */
export function prefetch(url: string, kind: "image" | "video") {
  if (ahead?.url === url || job()) return;
  drop();
  const file = download(url, kind);
  file.catch(() => {});
  ahead = { url, file, timer: setTimeout(drop, AHEAD_MS) };
}

/** The file of `url`: the one fetched ahead, else downloaded now (after one fetched ahead for
 * another picture is done and removed). */
async function take(url: string, kind: "image" | "video"): Promise<string> {
  if (ahead?.url === url) {
    const { file, timer } = ahead;
    clearTimeout(timer);
    ahead = null;
    return file;
  }
  await drop();
  return download(url, kind);
}

/** Removes the file fetched ahead (once it is there): no save or share took it. */
async function drop() {
  if (!ahead) return;
  const { file, timer } = ahead;
  clearTimeout(timer);
  ahead = null;
  await file.then(remove, () => {});
}
