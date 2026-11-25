// Post and comment text, as weibo.com shows it: `@name` mentions link to their profiles,
// `#topics#` to their posts, short links show what they stand for ("网页链接", "xxx的微博视频")
// and open it: the post's video in the player, a Weibo post ("微博正文") on its page in the app,
// anything else in the browser. "图一" to "图九" open the post's picture they name. Emoticon codes ("[允悲]") show as their pictures, once known
// (`emoticons.ts`), a little taller than the text around them.
import { Image, openUrl, Text } from "nsh";
import { t } from "nsh/i18n";
import { type Link, postIdOf, type Status } from "../api";
import { emoticons } from "../emoticons";
import { openPostById, openProfileByName, openTopic } from "../nav";
import { Icon } from "./Icon";
import { openViewer } from "./ImageViewer";

/** Weibo's link orange, for mentions and links. */
export const LINK_CLASS = "text-link";
export const LINK_TINT = "tint-link";

// Weibo screen names: letters (Chinese included), digits, `_` and `-`, up to 30 characters. A
// mention ends at anything else: `//@name:` in repost chains, `@name ` before text.
// URLs (Weibo shortens them to `http://t.cn/...`) up to whitespace or a CJK character; topics
// between two `#` on one line.
const TOKEN = /@([\p{L}\p{N}_-]{1,30})|(https?:\/\/[^\s\u3000-\u9fff\uff00-\uffef]+)|(#[^#\n]{1,60}#)/gu;
const NAME_CHAR = /[\p{L}\p{N}_]/u;

type Segment = string | { mention: string } | { url: string } | { topic: string };

export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index!;
    // `a@b.com` is an address, not a mention.
    if (m[1] && at > 0 && NAME_CHAR.test(text[at - 1])) continue;
    if (at > last) out.push(text.slice(last, at));
    out.push(m[1] ? { mention: m[1] } : m[2] ? { url: m[2] } : { topic: m[3] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// "图一" to "图九": a picture of the post, by its place.
const PICTURE_REF = /图([一二三四五六七八九])/g;
const NUMERALS = "一二三四五六七八九";

/** Plain text with its picture references ("图一") apart, as 0-based indices under `count`. */
export function pictureRefs(text: string, count: number): (string | { pic: number; label: string })[] {
  if (!count || !text.includes("图")) return [text];
  const out: (string | { pic: number; label: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(PICTURE_REF)) {
    const at = m.index!;
    const pic = NUMERALS.indexOf(m[1]);
    if (pic >= count) continue;
    if (at > last) out.push(text.slice(last, at));
    out.push({ pic, label: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const EMOTICON = /\[[^\[\]\n]+\]/g;

/** Plain text with its known emoticon codes as their pictures. */
function Plain(props: { text: string }) {
  const parts = () => {
    // Text with no code needn't follow the table: it would draw again whenever any post teaches one.
    if (!props.text.includes("[")) return [props.text];
    const known = emoticons();
    const out: (string | { code: string; src: string })[] = [];
    let last = 0;
    for (const m of props.text.matchAll(EMOTICON)) {
      const src = known[m[0]];
      if (!src) continue;
      if (m.index! > last) out.push(props.text.slice(last, m.index));
      out.push({ code: m[0], src });
      last = m.index! + m[0].length;
    }
    if (last < props.text.length) out.push(props.text.slice(last));
    return out;
  };
  return (
    <>
      {parts().map((p) =>
        typeof p === "string" ? (
          p
        ) : (
          // A little taller than the letters (the text runs 13 to 16 points), as weibo.com draws them;
          // `middle` keeps the line's height. That middle is half the x height above the baseline, a
          // point or so below the middle of Chinese characters, so it goes up a point, as the link
          // icons do.
          <Image
            src={p.src}
            accessibilityLabel={p.code}
            style={{ width: 18, height: 18, verticalAlign: "middle", translate: [0, -1] }}
          />
        ),
      )}
    </>
  );
}

function UrlLink(props: { url: string; link?: Link; onVideo?: () => void }) {
  const video = () => !!props.link?.video && !!props.onVideo;
  return (
    <Text
      role="link"
      accessibilityLabel={props.link?.title ?? props.url}
      onPress={() => {
        const link = props.link;
        // Pages saved before links knew their posts: read the address.
        const post = link?.post ?? postIdOf(link?.url ?? props.url);
        if (video()) props.onVideo!();
        else if (post) openPostById(post);
        else if (link?.pics?.length) openViewer(link.pics, 0);
        else openUrl(link?.url ?? props.url).catch(() => {});
      }}
      class={`${LINK_CLASS} active:opacity-60`}
    >
      <If when={props.link} else={props.url}>
        {(link) => (
          <>
            {/* `align-middle` centers it on the letters, as the emoticons are; on the baseline it
                sits above them. That middle is half the x height above the baseline, a point or so
                below the middle of Chinese characters, so it goes up a point. */}
            <Icon name={video() ? "player-play" : "link"} class={`size-4 align-middle -translate-y-px ${LINK_TINT}`} /> {link().title}
          </>
        )}
      </If>
    </Text>
  );
}

export function RichText(props: {
  text: string;
  class?: string;
  /** The post's short links (`Status.links`). */
  links?: Record<string, Link>;
  /** Plays the post's video, for its video link. */
  onVideo?: () => void;
  /** Mentions in the text's color (comments), still links. */
  plainMentions?: boolean;
  /** Leaves out picture links ("查看图片"): the pictures show beside the text. */
  hidePictureLinks?: boolean;
  /** Ends the text with this in the link color, not itself a link: "全文" after a cut long post,
   * whose card opens the post on a press anyway. */
  more?: string;
  /** The post's pictures: "图一" to "图九" in the text open them. */
  pics?: Status["pics"];
}) {
  const plain = (text: string) =>
    pictureRefs(text, props.pics?.length ?? 0).map((p) =>
      typeof p === "string" ? (
        <Plain text={p} />
      ) : (
        <Text
          role="link"
          accessibilityLabel={t("post.picture", { i: p.pic + 1, n: props.pics!.length })}
          onPress={() => openViewer(props.pics!, p.pic)}
          class={`${LINK_CLASS} active:opacity-60`}
        >
          {p.label}
        </Text>
      ),
    );
  return (
    <Text class={props.class}>
      {segments(props.text).map((s) =>
        typeof s === "string" ? (
          plain(s)
        ) : "url" in s ? (
          props.hidePictureLinks && props.links?.[s.url]?.pics?.length ? (
            ""
          ) : (
            <UrlLink url={s.url} link={props.links?.[s.url]} onVideo={props.onVideo} />
          )
        ) : "topic" in s ? (
          <Text
            role="link"
            accessibilityLabel={t("post.topic", { topic: s.topic })}
            onPress={() => openTopic(s.topic)}
            class={`${LINK_CLASS} active:opacity-60`}
          >
            {s.topic}
          </Text>
        ) : (
          <Text
            role="link"
            accessibilityLabel={t("post.mention", { name: s.mention })}
            onPress={() => openProfileByName(s.mention)}
            class={`${props.plainMentions ? "" : LINK_CLASS} active:opacity-60`}
          >
            @{s.mention}
          </Text>
        ),
      )}
      <If when={props.more}>
        {(more) => (
          <>
            {/[.…]$/.test(props.text.trimEnd()) ? " " : "… "}
            <Text class={LINK_CLASS}>{more()}</Text>
          </>
        )}
      </If>
    </Text>
  );
}
