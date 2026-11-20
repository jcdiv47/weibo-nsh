// The session bridge: a WebView signed in to weibo.com runs every API request as the page's own
// same-origin `fetch`, so the HttpOnly session cookies (`SUB`, `SUBP`), the XSRF token and Weibo's
// anti-bot checks all behave as in a browser. The app never sees or stores the cookies. A second
// one on s.weibo.com (same cookies: they are `.weibo.com`'s) reads the search pages topics open.
//
// Two transports, picked once: `evaluate` (iOS, macOS, Android) resolves the page's Promise and
// decodes its JSON natively; elsewhere (Linux today) the page answers through
// `window.nsh.postMessage` and the app matches replies by request id.
import { signal, WebView, type WebViewRef } from "nsh";

export const WEIBO_ORIGIN = "https://weibo.com";
export const LOGIN_URL =
  "https://passport.weibo.com/sso/signin?entry=miniblog&source=miniblog&url=" +
  encodeURIComponent(`${WEIBO_ORIGIN}/`);

// weibo.com sends mobile browsers to m.weibo.cn, whose API differs: pin a desktop user agent so
// the same endpoints answer on iOS as on the desktops.
export const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export type Session = "checking" | "login" | "ready";
export const session = signal<Session>("checking");

/** A request that reached Weibo but did not come back as a signed-in JSON answer. */
export class NotSignedIn extends Error {
  constructor() {
    super("Not signed in to Weibo");
  }
}

interface PageAnswer {
  status: number;
  url: string;
  json: unknown;
  text?: string | null;
}

// The script the page runs: a same-origin fetch with the headers weibo.com's own client sends.
const pageFetch = (path: string, asText: boolean) => `(async () => {
  const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
  const headers = { accept: ${asText ? '"text/html,*/*"' : '"application/json, text/plain, */*"'} };
  if (${!asText}) headers["x-requested-with"] = "XMLHttpRequest";
  if (m) headers["x-xsrf-token"] = decodeURIComponent(m[1]);
  const r = await fetch(${JSON.stringify(path)}, { credentials: "include", headers });
  const text = await r.text();
  let json = null;
  if (${!asText}) { try { json = JSON.parse(text); } catch (e) {} }
  return { status: r.status, url: r.url, json, text: ${asText} ? text : null }; // evaluate takes no undefined
})()`;

const TIMEOUT_MS = 20_000;

/**
 * One hidden web view and the requests that run in it, as its page's own fetches: `weibo` for
 * weibo.com's API, `search` for s.weibo.com's server-rendered search (topics), which weibo.com's
 * pages cannot read across origins.
 */
export class Channel {
  private web: WebViewRef | undefined;
  private useEvaluate: Promise<boolean> | undefined;
  private nextId = 1;
  private waiting = new Map<number, { resolve: (a: PageAnswer) => void; reject: (e: Error) => void; timer: number }>();
  private loaded!: Promise<void>;
  private markLoaded!: () => void;

  constructor(
    /** The page the channel idles on: requests run once it has loaded. */
    readonly idleUrl: string,
  ) {
    this.resetLoaded();
  }

  private resetLoaded() {
    this.loaded = new Promise((resolve) => (this.markLoaded = resolve));
  }

  /** The web view's `ref`. */
  attach(ref: WebViewRef) {
    this.web = ref;
    this.useEvaluate ??= WebView.evaluateAvailable().catch(() => false);
  }

  /** The web view's `onLoadStart`: requests still waiting die with the page they ran in. */
  onLoadStart() {
    this.resetLoaded();
    this.abort("The bridge page navigated");
  }

  /** The web view's `onLoad`. */
  onLoad(url: string) {
    if (url.startsWith(this.idleUrl)) this.markLoaded();
  }

  /** The web view's `onMessage`: replies of the postMessage transport. */
  onMessage(data: string) {
    let reply: { id?: number; v?: PageAnswer; error?: string };
    try {
      reply = JSON.parse(data);
    } catch {
      return; // A message of Weibo's own page, not ours.
    }
    const pending = reply.id === undefined ? undefined : this.waiting.get(reply.id);
    if (!pending) return;
    this.waiting.delete(reply.id!);
    clearTimeout(pending.timer);
    if (reply.error !== undefined || !reply.v) pending.reject(new Error(reply.error ?? "Empty reply"));
    else pending.resolve(reply.v);
  }

  /** Fails every request still waiting: the page they ran in is gone. */
  abort(reason: string) {
    for (const [id, p] of this.waiting) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
      this.waiting.delete(id);
    }
  }

  /**
   * Runs `path` as the page's fetch. `waitForPage`: first wait for the idle page (the main
   * channel's pages only start once it is up). A request the page's navigation cut off (a reload)
   * runs again once, when the page is back.
   */
  async run(path: string, asText = false, waitForPage = false): Promise<PageAnswer> {
    if (waitForPage) await this.waitLoaded();
    try {
      return await this.runOnce(path, asText);
    } catch (e) {
      if (!/navigated/i.test(String((e as Error)?.message ?? e))) throw e;
      await this.waitLoaded();
      return this.runOnce(path, asText);
    }
  }

  private async waitLoaded() {
    let timer: number | undefined;
    await Promise.race([
      this.loaded,
      new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`Timed out loading ${this.idleUrl}`)), TIMEOUT_MS))),
    ]).finally(() => clearTimeout(timer));
  }

  private async runOnce(path: string, asText: boolean): Promise<PageAnswer> {
    const web = this.web;
    if (!web) throw new Error("The session bridge is not mounted");
    if (await this.useEvaluate) {
      const { value } = await web.evaluate(pageFetch(path, asText), { timeout: TIMEOUT_MS });
      return value as unknown as PageAnswer;
    }
    const id = this.nextId++;
    return new Promise<PageAnswer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`Timed out: ${path}`));
      }, TIMEOUT_MS);
      this.waiting.set(id, { resolve, reject, timer });
      web.injectJavaScript(
        `${pageFetch(path, asText)}.then(v => window.nsh.postMessage(JSON.stringify({ id: ${id}, v })),` +
          ` e => window.nsh.postMessage(JSON.stringify({ id: ${id}, error: String(e) })));`,
      );
    });
  }
}

/** weibo.com's API; idles on a plain text file, so the web view runs none of weibo.com's app. */
export const weibo = new Channel(`${WEIBO_ORIGIN}/robots.txt`);
/** s.weibo.com's search pages; idles on its icon, the one plain file it serves. */
export const search = new Channel("https://s.weibo.com/favicon.ico");

const signedOut = (answer: PageAnswer) =>
  /passport\.weibo|login\.sina/.test(answer.url) || answer.status === 401 || answer.status === 403;

/**
 * GETs a weibo.com path (`/ajax/...`) as the signed-in page and returns its JSON.
 * Throws `NotSignedIn` (and asks for a sign-in) when Weibo answers with a login page or `ok != 1`.
 */
export async function get<T = any>(path: string): Promise<T> {
  const answer = await weibo.run(path);
  const json = answer.json as { ok?: number } | null;
  if (signedOut(answer) || !json || json.ok === -100) {
    session.set("login");
    throw new NotSignedIn();
  }
  if (json.ok !== 1) throw new Error(`Weibo answered ok=${json.ok} for ${path}`);
  return json as T;
}

/** GETs an s.weibo.com page (`/weibo?q=...`) as the signed-in page and returns its HTML. */
export async function getSearchPage(path: string): Promise<string> {
  const answer = await search.run(path, true, true);
  if (signedOut(answer)) {
    session.set("login");
    throw new NotSignedIn();
  }
  if (answer.status !== 200) throw new Error(`s.weibo.com answered ${answer.status} for ${path}`);
  return answer.text ?? "";
}
