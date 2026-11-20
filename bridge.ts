// The session bridge: one WebView signed in to weibo.com runs every API request as the page's own
// same-origin `fetch`, so the HttpOnly session cookies (`SUB`, `SUBP`), the XSRF token and Weibo's
// anti-bot checks all behave as in a browser. The app never sees or stores the cookies.
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
}

let web: WebViewRef | undefined;
let useEvaluate: Promise<boolean> | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve: (a: PageAnswer) => void; reject: (e: Error) => void; timer: number }>();

/** Called by the bridge WebView's `ref`. */
export function attach(ref: WebViewRef) {
  web = ref;
  useEvaluate ??= WebView.evaluateAvailable().catch(() => false);
}

/** The bridge WebView's `onMessage`: replies of the postMessage transport. */
export function onBridgeMessage(data: string) {
  let reply: { id?: number; v?: PageAnswer; error?: string };
  try {
    reply = JSON.parse(data);
  } catch {
    return; // A message of Weibo's own page, not ours.
  }
  const pending = reply.id === undefined ? undefined : waiting.get(reply.id);
  if (!pending) return;
  waiting.delete(reply.id!);
  clearTimeout(pending.timer);
  if (reply.error !== undefined || !reply.v) pending.reject(new Error(reply.error ?? "Empty reply"));
  else pending.resolve(reply.v);
}

/** Fails every request still waiting: the page they ran in is gone. */
export function abortPending(reason: string) {
  for (const [id, p] of waiting) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
    waiting.delete(id);
  }
}

// The script the page runs: a same-origin fetch with the headers weibo.com's own client sends.
const pageFetch = (path: string) => `(async () => {
  const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
  const headers = { accept: "application/json, text/plain, */*", "x-requested-with": "XMLHttpRequest" };
  if (m) headers["x-xsrf-token"] = decodeURIComponent(m[1]);
  const r = await fetch(${JSON.stringify(path)}, { credentials: "include", headers });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: r.status, url: r.url, json };
})()`;

const TIMEOUT_MS = 20_000;

async function run(path: string): Promise<PageAnswer> {
  if (!web) throw new Error("The session bridge is not mounted");
  if (await useEvaluate) {
    const { value } = await web.evaluate(pageFetch(path), { timeout: TIMEOUT_MS });
    return value as unknown as PageAnswer;
  }
  const id = nextId++;
  return new Promise<PageAnswer>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error(`Timed out: ${path}`));
    }, TIMEOUT_MS);
    waiting.set(id, { resolve, reject, timer });
    web!.injectJavaScript(
      `${pageFetch(path)}.then(v => window.nsh.postMessage(JSON.stringify({ id: ${id}, v })),` +
        ` e => window.nsh.postMessage(JSON.stringify({ id: ${id}, error: String(e) })));`,
    );
  });
}

/**
 * GETs a weibo.com path (`/ajax/...`) as the signed-in page and returns its JSON.
 * Throws `NotSignedIn` (and asks for a sign-in) when Weibo answers with a login page or `ok != 1`.
 */
export async function get<T = any>(path: string): Promise<T> {
  const answer = await run(path);
  const json = answer.json as { ok?: number } | null;
  const redirected = /passport\.weibo|login\.sina/.test(answer.url);
  if (redirected || answer.status === 401 || answer.status === 403 || !json || json.ok === -100) {
    session.set("login");
    throw new NotSignedIn();
  }
  if (json.ok !== 1) throw new Error(`Weibo answered ok=${json.ok} for ${path}`);
  return json as T;
}
