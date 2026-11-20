// Weibo's dates (`"Tue Nov 19 10:00:00 +0800 2026"`) as a short relative time, and counts, in the
// language the app shows (`meta.lang` of `locales/`: the one `t` picked).
import { t } from "nsh/i18n";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const chinese = () => t("meta.lang") === "zh";

export function parseWeiboDate(s: string): number | null {
  const m = /^\w{3} (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2}) (\d{4})$/.exec(s);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  if (month < 0) return null;
  const offset = (m[6] === "-" ? -1 : 1) * (Number(m[7]) * 60 + Number(m[8]));
  return Date.UTC(Number(m[9]), month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])) - offset * 60_000;
}

export function relativeTime(s: string, now = Date.now()): string {
  const time = parseWeiboDate(s);
  return time === null ? s : timeAgo(time, now);
}

/** A moment (ms since the epoch) as a short relative time: "5m", "3h", "Nov 19". */
export function timeAgo(time: number, now = Date.now()): string {
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return t("time.just_now");
  if (minutes < 60) return t("time.minutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hours", { n: hours });
  const d = new Date(time);
  const year = d.getUTCFullYear();
  const sameYear = year === new Date(now).getUTCFullYear();
  if (chinese()) return `${sameYear ? "" : `${year}年`}${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${sameYear ? "" : `, ${year}`}`;
}

// One decimal, without a trailing ".0".
const short = (n: number) => n.toFixed(1).replace(/\.0$/, "");

/** A count as Weibo shows it: 万 / 亿 in Chinese, K / M / B in English (from ten thousand up, as Weibo). */
export function count(n: number): string {
  if (chinese()) {
    if (n >= 100_000_000) return `${short(n / 100_000_000)}亿`;
    if (n >= 10_000) return `${short(n / 10_000)}万`;
    return String(n);
  }
  if (n >= 1_000_000_000) return `${short(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${short(n / 1_000_000)}M`;
  if (n >= 10_000) return `${short(n / 1_000)}K`;
  return n.toLocaleString("en-US");
}
