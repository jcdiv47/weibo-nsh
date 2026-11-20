// Post and comment text with its `@name` mentions as links to their profiles, and its URLs
// in the same color, as weibo.com shows them.
import { Text } from "nsh";
import { openProfileByName } from "../nav";

/** Weibo's link orange, for mentions and links. */
export const LINK_CLASS = "text-[#eb7350]";

// Weibo screen names: letters (Chinese included), digits, `_` and `-`, up to 30 characters. A
// mention ends at anything else: `//@name:` in repost chains, `@name ` before text.
// URLs (Weibo shortens them to `http://t.cn/...`) up to whitespace or a CJK character.
const TOKEN = /@([\p{L}\p{N}_-]{1,30})|(https?:\/\/[^\s\u3000-\u9fff\uff00-\uffef]+)/gu;
const NAME_CHAR = /[\p{L}\p{N}_]/u;

type Segment = string | { mention: string } | { url: string };

export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index!;
    // `a@b.com` is an address, not a mention.
    if (m[1] && at > 0 && NAME_CHAR.test(text[at - 1])) continue;
    if (at > last) out.push(text.slice(last, at));
    out.push(m[1] ? { mention: m[1] } : { url: m[2] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText(props: { text: string; class?: string }) {
  return (
    <Text class={props.class}>
      {segments(props.text).map((s) =>
        typeof s === "string" ? (
          s
        ) : "url" in s ? (
          <Text class={LINK_CLASS}>{s.url}</Text>
        ) : (
          <Text
            role="link"
            accessibilityLabel={`@${s.mention}'s profile`}
            onPress={() => openProfileByName(s.mention)}
            class={`${LINK_CLASS} active:opacity-60`}
          >
            @{s.mention}
          </Text>
        ),
      )}
    </Text>
  );
}
