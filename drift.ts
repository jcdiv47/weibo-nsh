// Noticing when Weibo changes its answers. The mappers in `api.ts` read defensively, so a renamed
// field would only blank a value; this checks the few fields a screen cannot do without, says so
// once in the log with a sample of the answer (to paste into `tests/fixtures/`), and turns a whole
// answer that no longer fits into a `WeiboChanged` error instead of an empty or blank screen.
import { t } from "nsh/i18n";

/** Weibo answered, signed in and `ok`, but not in the shape this app reads. */
export class WeiboChanged extends Error {
  constructor(
    /** The endpoint, `/ajax/...` without its query. */
    readonly endpoint: string,
    /** What was missing, as field paths. */
    readonly missing: string[],
  ) {
    super(t("error.weibo_changed", { endpoint: endpoint.replace(/^\/ajax\//, "") }));
    this.name = "WeiboChanged";
  }
}

/**
 * What an item must carry: `required` fields it is useless without (dropped, and reported),
 * `expected` ones whose absence blanks a value (reported only). A path is dotted (`user.idstr`);
 * `a|b` takes either.
 */
export interface Shape {
  required: string[];
  expected?: string[];
}

export const shapes = {
  status: {
    required: ["idstr|id", "user.idstr|user.id", "text_raw|text", "created_at"],
    expected: ["user.screen_name", "mblogid", "reposts_count", "comments_count", "attitudes_count"],
  },
  comment: {
    required: ["idstr|id", "user.idstr|user.id", "text_raw|text"],
    expected: ["created_at", "user.screen_name"],
  },
  user: {
    required: ["idstr|id"],
    expected: ["screen_name", "avatar_large|avatar_hd|profile_image_url"],
  },
} satisfies Record<string, Shape>;

function at(v: unknown, path: string): unknown {
  let cur = v;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const present = (v: unknown, path: string) =>
  path.split("|").some((p) => {
    const x = at(v, p);
    return x !== undefined && x !== null && x !== "";
  });

/** The paths of `paths` that `v` lacks. */
export const missing = (v: unknown, paths: string[]) => paths.filter((p) => !present(v, p));

export interface DriftReport {
  endpoint: string;
  missing: string[];
  /** The start of the item or answer that lacked them, as JSON. */
  sample: string;
}

const reports = new Map<string, DriftReport>();

/** What was reported so far, once per endpoint and set of missing fields. */
export const driftReports = () => [...reports.values()];

/** Notes that an answer of `endpoint` lacked `paths`: logged once per endpoint and paths. */
export function reportDrift(endpoint: string, paths: string[], sample: unknown) {
  const key = `${endpoint} ${paths.join(",")}`;
  if (reports.has(key)) return;
  let json: string;
  try {
    json = JSON.stringify(sample) ?? String(sample);
  } catch {
    json = String(sample);
  }
  const report = { endpoint, missing: paths, sample: json.slice(0, 4000) };
  reports.set(key, report);
  console.warn(`[weibo drift] ${endpoint}: missing ${paths.join(", ")}\n${report.sample}`);
}

/**
 * The array at `path` of an answer. Its absence means the answer changed shape: reported, and
 * thrown as `WeiboChanged`, since an empty list would read as "nothing here" or "the end".
 */
export function list(endpoint: string, answer: unknown, path: string): unknown[] {
  const v = at(answer, path);
  if (Array.isArray(v)) return v;
  reportDrift(endpoint, [path], answer);
  throw new WeiboChanged(endpoint, [path]);
}

/** The object at `path` of an answer, checked against `shape`; throws `WeiboChanged` if unusable. */
export function one(endpoint: string, answer: unknown, path: string, shape: Shape): any {
  const v = path ? at(answer, path) : answer;
  const prefix = path ? `${path}.` : "";
  if (!v || typeof v !== "object") {
    reportDrift(endpoint, [path || "(answer)"], answer);
    throw new WeiboChanged(endpoint, [path || "(answer)"]);
  }
  const lacks = missing(v, shape.required);
  if (lacks.length) {
    reportDrift(endpoint, lacks.map((p) => prefix + p), v);
    throw new WeiboChanged(endpoint, lacks.map((p) => prefix + p));
  }
  const thin = missing(v, shape.expected ?? []);
  if (thin.length) reportDrift(endpoint, thin.map((p) => prefix + p), v);
  return v;
}

/**
 * The items of a list that fit `shape`: those lacking a required field are dropped, and absent
 * expected fields reported. A list none of whose items fit throws `WeiboChanged`.
 */
export function items(endpoint: string, raw: unknown[], shape: Shape): any[] {
  const kept: any[] = [];
  for (const item of raw) {
    const lacks = missing(item, shape.required);
    if (lacks.length) {
      reportDrift(endpoint, lacks, item);
      continue;
    }
    const thin = missing(item, shape.expected ?? []);
    if (thin.length) reportDrift(endpoint, thin, item);
    kept.push(item);
  }
  if (raw.length && !kept.length) throw new WeiboChanged(endpoint, missing(raw[0], shape.required));
  return kept;
}
