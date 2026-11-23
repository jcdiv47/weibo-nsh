// The session bridge: a WebView signed in to weibo.com runs every API request as the page's own
// same-origin `fetch`, so the HttpOnly session cookies (`SUB`, `SUBP`), the XSRF token and Weibo's
// anti-bot checks all behave as in a browser. The app never sees or stores the cookies. A second
// one on s.weibo.com (same cookies: they are `.weibo.com`'s) reads the search pages topics open.
//
// Requests run through `WebViewRef.evaluate`, which resolves the page's Promise and decodes its
// JSON natively on both iOS and Android.
import { signal, type WebViewRef } from "nsh";

export const WEIBO_ORIGIN = "https://weibo.com";
export const LOGIN_URL =
  "https://passport.weibo.com/sso/signin?entry=miniblog&source=miniblog&url=" +
  encodeURIComponent(`${WEIBO_ORIGIN}/`);

// weibo.com sends mobile browsers to m.weibo.cn, whose API differs: pin a desktop user agent so
// weibo.com's web endpoints answer on iOS and Android.
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
// A `form` makes it a POST of that form, as the client sends its writes (follow, block).
const pageFetch = (path: string, asText: boolean, form?: Record<string, string>) => `(async () => {
  const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
  const headers = { accept: ${asText ? '"text/html,*/*"' : '"application/json, text/plain, */*"'} };
  if (${!asText}) headers["x-requested-with"] = "XMLHttpRequest";
  if (m) headers["x-xsrf-token"] = decodeURIComponent(m[1]);
  const form = ${JSON.stringify(form ?? null)};
  const init = { credentials: "include", headers };
  if (form) {
    init.method = "POST";
    headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(form).toString();
  }
  const r = await fetch(${JSON.stringify(path)}, init);
  const text = await r.text();
  let json = null;
  if (${!asText}) { try { json = JSON.parse(text); } catch (e) {} }
  return { status: r.status, url: r.url, json, text: ${asText} ? text : null }; // evaluate takes no undefined
})()`;

const TIMEOUT_MS = 20_000;
/** A second revive within this long is the same death: its first reload is already on the way. */
const REVIVE_GAP_MS = 3_000;

/** A request the page's navigation cut off (a reload, a new page). */
const cutByNavigation = (e: unknown) => /navigated/i.test(String((e as Error)?.message ?? e));

/**
 * A request whose web view died under it: iOS ends a WKWebView's web content process when it
 * likes (the app in the background a while, memory short), and the view then runs nothing, every
 * request failing with "the web view went away", until it loads a page again.
 */
const cutByDeath = (e: unknown) => {
  const err = e as { code?: string; message?: string } | undefined;
  if (cutByNavigation(e)) return false;
  return (
    err?.code === "ERR_NSH_WEBVIEW_ABORTED" ||
    err?.code === "ERR_NSH_WEBVIEW_TERMINATED" ||
    /went away|process ended/i.test(String(err?.message ?? e))
  );
};

/**
 * One hidden web view and the requests that run in it, as its page's own fetches: `weibo` for
 * weibo.com's API, `search` for s.weibo.com's server-rendered search (topics), which weibo.com's
 * pages cannot read across origins.
 */
export class Channel {
  private web: WebViewRef | undefined;
  private loaded!: Promise<void>;
  private markLoaded!: () => void;
  private isLoaded = true; // So the constructor's resetLoaded makes the first promise.
  private revivedAt = -Infinity;

  constructor(
    /** The page the channel idles on: requests run once it has loaded. */
    readonly idleUrl: string,
    /** The page to load again when the web view's process died: the idle page, unless signing in. */
    private readonly revivalUrl: () => string = () => idleUrl,
  ) {
    this.resetLoaded();
  }

  // A page still loading keeps its promise, so whoever waits on it hears when it is up.
  private resetLoaded() {
    if (!this.isLoaded) return;
    this.isLoaded = false;
    this.loaded = new Promise((resolve) => (this.markLoaded = resolve));
  }

  /** The web view's `ref`. */
  attach(ref: WebViewRef) {
    this.web = ref;
  }

  /** The web view's `onLoadStart`: requests still waiting wait for the new page. */
  onLoadStart() {
    this.resetLoaded();
  }

  /** The web view's `onLoad`. */
  onLoad(url: string) {
    if (!url.startsWith(this.idleUrl)) return;
    this.isLoaded = true;
    this.markLoaded();
  }

  /**
   * The web view's `onError`: a web content process that ended (`ERR_NSH_WEBVIEW_TERMINATED`)
   * loads its page again. True when it was that.
   */
  onError(e: { code?: string; message?: string }): boolean {
    if (e.code !== "ERR_NSH_WEBVIEW_TERMINATED") return false;
    this.revive();
    return true;
  }

  /** Loads the page again in a web view whose process died; requests then wait for it. */
  revive() {
    const web = this.web;
    if (!web || Date.now() - this.revivedAt < REVIVE_GAP_MS) return;
    this.revivedAt = Date.now();
    this.resetLoaded();
    web.load({ src: this.revivalUrl() });
  }

  /** Loads `src` in the web view; requests wait until it is back on the idle page. */
  load(src: string) {
    this.web?.load({ src });
  }

  /**
   * Runs `path` as the page's fetch. `waitForPage`: first wait for the idle page (the main
   * channel's pages only start once it is up). A request the page's navigation cut off (a reload)
   * or its web view's death (which loads the page again) runs again once, when the page is back.
   */
  async run(path: string, asText = false, waitForPage = false, form?: Record<string, string>): Promise<PageAnswer> {
    if (waitForPage) await this.waitLoaded();
    try {
      return await this.runOnce(path, asText, form);
    } catch (e) {
      const died = cutByDeath(e);
      if (died) this.revive();
      // A cut-off GET runs again; a POST might have gone through, so it reports the failure.
      if (form || !(died || cutByNavigation(e))) throw e;
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

  private async runOnce(path: string, asText: boolean, form?: Record<string, string>): Promise<PageAnswer> {
    const web = this.web;
    if (!web) throw new Error("The session bridge is not mounted");
    const { value } = await web.evaluate(pageFetch(path, asText, form), { timeout: TIMEOUT_MS });
    return value as unknown as PageAnswer;
  }
}

/**
 * weibo.com's API; idles on a plain text file, so the web view runs none of weibo.com's app. A web
 * view that died while signing out runs the sign-out again.
 */
export const weibo = new Channel(`${WEIBO_ORIGIN}/robots.txt`, () =>
  signingOut() ? LOGOUT_URL : session() === "login" ? LOGIN_URL : `${WEIBO_ORIGIN}/robots.txt`,
);
/** s.weibo.com's search pages; idles on its icon, the one plain file it serves. */
export const search = new Channel("https://s.weibo.com/favicon.ico");

/**
 * weibo.com's own sign-out, as its menu's 退出 runs it (`logout()` in its app): Sina's SSO ends the
 * session and clears its cookies, which the app cannot touch itself. Its pages pass the browser on
 * with scripts (`logout.php`, `crossdomain2.php?action=logout`, ...) and end on a sign-in page,
 * `passport.weibo.com/sso/signin`; weibo.com then answers its feeds with 403 "请登录后使用".
 */
const LOGOUT_URL = "https://login.sina.com.cn/sso/logout.php?entry=miniblog&r=";
/** A sign-in page: where the sign-out chain ends (weibo.com's own sends to `/newlogin`). */
const signInPage = (url: string) => /passport\.weibo\.com\/sso\/signin|weibo\.com\/newlogin/i.test(url);
/** How long the sign-out page may take before the app asks for a sign-in anyway. */
const SIGN_OUT_WAIT_MS = 15_000;

/** True from a sign-out until its page has run: the pages are gone, the sign-in page next. */
export const signingOut = signal(false);
let signOutTimer: number | undefined;

/** Signs out: runs weibo.com's sign-out page in the bridge, then asks for a sign-in. */
export function signOut() {
  if (signingOut() || session() !== "ready") return;
  signingOut.set(true);
  signOutTimer = setTimeout(signedOutNow, SIGN_OUT_WAIT_MS);
  weibo.load(LOGOUT_URL);
}

/**
 * The bridge's `onLoad` and `onError` while signing out: the sign-in page the chain ends on means
 * it ran; an error ends it too (as does `SIGN_OUT_WAIT_MS`). Either way the app's sign-in page comes
 * next: if the session somehow survived, signing in shows it.
 */
export function signOutLoaded(url: string | null) {
  if (!signingOut() || (url !== null && !signInPage(url))) return;
  signedOutNow();
}

function signedOutNow() {
  if (!signingOut()) return;
  clearTimeout(signOutTimer);
  signingOut.set(false);
  session.set("login");
}

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

/**
 * POSTs a form to a weibo.com path, as weibo.com's client sends its writes, and returns the JSON.
 * Throws unless Weibo answers `ok > 0` (`result: "true"` for some).
 */
export async function post<T = any>(path: string, form: Record<string, string>): Promise<T> {
  const answer = await weibo.run(path, false, false, form);
  const json = answer.json as { ok?: number; result?: unknown; msg?: string; message?: string } | null;
  if (signedOut(answer) || !json || json.ok === -100) {
    session.set("login");
    throw new NotSignedIn();
  }
  if (!((json.ok ?? 0) > 0 || json.result === true || json.result === "true")) {
    throw new Error(json.msg || json.message || `Weibo answered ok=${json.ok} for ${path}`);
  }
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
