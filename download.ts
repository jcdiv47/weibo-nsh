// Saving a post's picture or video to the device, at any size.
//
// The bytes never pass through the app's JS (NSH writes a file of at most 8 MiB in one piece): a
// hidden web view downloads the file. It opens a page on the file's own host (any page: an error
// page will do), so a link to the file is same-origin and its `download` attribute holds; a click
// on it makes the web engine save the file, streamed to disk, in the app's data directory
// (`downloads/<id>/<name>`, `WebView` `onDownload`). The file is then:
//
// - on iOS and Android handed to the system's share sheet, where "Save Image" / "Save Video" put
//   it in Photos (or "Save to Files", another app...), and removed;
// - on the desktops moved into the user's Downloads folder, or where the system keeps the app out
//   of it (macOS, until the user lets it in) handed to the share sheet as on a phone.
//
// `shareMedia` downloads the same way and hands the file to the share sheet on every platform that
// has one: WeChat, X and the other apps installed that take pictures or videos are there.
//
// Before the click the page asks for the file's first byte, so an answer that is no picture or
// video (an expired link, a refusal) fails the save instead of saving an error page.
import { exists, mkdir, rename, rmdir, unlink } from "fs/promises";
import { Share, platform, signal, type WebViewDownload } from "nsh";
import os from "os";

const MOBILE = platform.os === "ios" || platform.os === "android";

/** How long a download may take, from the page's start to the file's end. */
const TIMEOUT_MS = 15 * 60_000;

export interface SaveResult {
  /** `"downloads"`: moved into the Downloads folder (desktops); `"shared"`: the share sheet took
   * it; `"dismissed"`: the share sheet was closed without taking it. */
  outcome: "downloads" | "shared" | "dismissed";
  /** Where the file is (`"downloads"`) or was. */
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

/** A name in `dir` no file has yet: `name`, else `name (2)`, `name (3)`... */
async function freeName(dir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 1; ; n++) {
    const path = `${dir}/${n === 1 ? name : `${base} (${n})${ext}`}`;
    if (!(await exists(path))) return path;
  }
}

async function toDownloads(path: string): Promise<string> {
  const dir = `${os.homedir()}/Downloads`;
  // Not `recursive`: that walks up from the home directory, which the app may not write.
  if (!(await exists(dir))) await mkdir(dir);
  const to = await freeName(dir, path.slice(path.lastIndexOf("/") + 1));
  await rename(path, to);
  await rmdir(path.slice(0, path.lastIndexOf("/"))).catch(() => {});
  return to;
}

/** Saves the picture or video at `url`. */
export async function saveMedia(url: string, kind: "image" | "video"): Promise<SaveResult> {
  const path = await download(url, kind);
  if (!MOBILE) {
    try {
      return { outcome: "downloads", path: await toDownloads(path) };
    } catch (e) {
      if (!(await Share.available())) {
        await remove(path);
        throw e;
      }
    }
  }
  return shareFile(path);
}

/** Hands a downloaded file to the share sheet, then removes it: the targets copied it. */
async function shareFile(path: string): Promise<SaveResult> {
  try {
    const { action } = await Share.show({ files: [path] });
    return { outcome: action, path };
  } finally {
    await remove(path);
  }
}

/** Shares the picture or video at `url` to another app (WeChat, X, Messages...) through the
 * system's share sheet, which lists the apps installed that take it. */
export async function shareMedia(url: string, kind: "image" | "video"): Promise<SaveResult> {
  return shareFile(await download(url, kind));
}
