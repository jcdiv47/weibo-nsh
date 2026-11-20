// Weibo's dates (`"Tue Nov 19 10:00:00 +0800 2026"`) as a short relative time.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseWeiboDate(s: string): number | null {
  const m = /^\w{3} (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2}) (\d{4})$/.exec(s);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  if (month < 0) return null;
  const offset = (m[6] === "-" ? -1 : 1) * (Number(m[7]) * 60 + Number(m[8]));
  return Date.UTC(Number(m[9]), month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])) - offset * 60_000;
}

export function relativeTime(s: string, now = Date.now()): string {
  const t = parseWeiboDate(s);
  if (t === null) return s;
  const minutes = Math.floor((now - t) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const d = new Date(t);
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear();
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${sameYear ? "" : `, ${d.getUTCFullYear()}`}`;
}

export function count(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  return String(n);
}
