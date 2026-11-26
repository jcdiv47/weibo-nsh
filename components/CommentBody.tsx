// A comment as Weibo's app lays it out: the author's name over the text and pictures; under them
// (and under its replies' preview) when and where it was sent from at the left, likes, repost and
// reply at the right. In the preview, each reply is one run of text, "name: text", with no time
// or likes.
import { signal, Text, View } from "nsh";
import { t } from "nsh/i18n";
import { onForgetAccount } from "../account";
import { type Comment, likeComment } from "../api";
import { count, relativeTime } from "../format";
import { failed, toggledOn } from "../haptics";
import { openProfile } from "../nav";
import { Icon } from "./Icon";
import { LINK_CLASS, RichText } from "./RichText";
import { Pictures } from "./StatusCard";

// Who a reply answers isn't shown apart: Weibo starts its text with "回复@name:" already.
// A component, not a call: a recycled row passes its new comment to the same `RichText`.
function CommentText(props: { comment: Comment; class: string }) {
  return <RichText text={props.comment.text.trimEnd()} links={props.comment.links} plainMentions hidePictureLinks class={props.class} />;
}

/** The author's name, then the text and pictures. `root`: the comment heading its thread, its
 * name bold and its text larger. */
export function CommentBody(props: { comment: Comment; root?: boolean }) {
  // No `flex-1`: in a column it sets a zero basis, and the replies' bodies collapsed onto each other.
  return (
    <View class={props.root ? "gap-2" : "gap-1.5"}>
      <Text
        role="button"
        onPress={() => openProfile(props.comment.user.id)}
        class={`self-start active:opacity-60 ${props.root ? "text-body leading-5 font-semibold text-ink" : "text-sm leading-[18px] text-ink-2"}`}
      >
        {props.comment.user.name}
      </Text>
      <CommentText comment={props.comment} class={`select-text ${props.root ? "text-base leading-[26px]" : "text-body"} text-ink`} />
      <Pictures pics={props.comment.pics} small />
    </View>
  );
}

/** A reply in its comment's preview: "name: text" in one run, then its pictures. */
export function InlineReply(props: { comment: Comment }) {
  return (
    <View class="gap-1">
      <Text class="text-sm leading-[22px] text-ink">
        <Text role="button" onPress={() => openProfile(props.comment.user.id)} class={`${LINK_CLASS} active:opacity-60`}>
          {props.comment.user.name}
        </Text>
        {": "}
        <CommentText comment={props.comment} class="" />
      </Text>
      <Pictures pics={props.comment.pics} small />
    </View>
  );
}

// Likes given or taken back here, by comment id. The lists hold plain objects, and a recycled row
// shows another comment: the row reads its comment's like from here first.
const likeChanges = signal<Record<string, { liked: boolean; likes: number }>>({});
export const commentLikeOf = (c: Comment) => likeChanges()[c.id] ?? { liked: c.liked, likes: c.likes };
const liking = new Set<string>();
onForgetAccount(() => likeChanges.set({}));

/** Likes the comment, or takes the like back, at once; if Weibo refuses, as it was. */
export async function toggleCommentLike(c: Comment) {
  if (liking.has(c.id)) return;
  const before = likeChanges()[c.id];
  const was = commentLikeOf(c);
  const now = { liked: !was.liked, likes: Math.max(0, was.likes + (was.liked ? -1 : 1)) };
  likeChanges.update((m) => ({ ...m, [c.id]: now }));
  if (now.liked) toggledOn();
  liking.add(c.id);
  try {
    await likeComment(c, now.liked);
    c.liked = now.liked;
    c.likes = now.likes;
  } catch {
    failed();
    // As it was: no change of its own left, so the comment's own counts show, fresh ones after a refresh.
    likeChanges.update(({ [c.id]: _, ...rest }) => (before ? { ...rest, [c.id]: before } : rest));
  } finally {
    liking.delete(c.id);
  }
}

/** When and where from at the left; like, repost and reply at the right, each in a lane of its own. */
export function CommentFooter(props: { comment: Comment; onReply: () => void; onRepost: () => void }) {
  const c = () => props.comment;
  const like = () => commentLikeOf(c());
  const meta = () => [relativeTime(c().createdAt), c().region && t("post.comment_region", { region: c().region })].filter(Boolean).join(" · ");
  return (
    <View class="flex-row items-center gap-2 pt-0.5">
      <Text class="shrink text-xs text-ink-2 line-clamp-1">{meta()}</Text>
      <View class="flex-1" />
      <View
        role="button"
        accessibilityLabel={`${t(like().liked ? "comment.unlike" : "comment.like")}, ${t("post.likes", { n: count(like().likes) })}`}
        onPress={() => toggleCommentLike(c())}
        hitSlop={8}
        class="w-[52px] shrink-0 flex-row items-center justify-end gap-[3px] active:opacity-60"
      >
        <If when={like().likes}>
          <Text class={`text-xs ${like().liked ? "text-link" : "text-ink-2"}`}>{count(like().likes)}</Text>
        </If>
        <Icon name={like().liked ? "thumb-up-filled" : "thumb-up"} class={`size-4 ${like().liked ? "tint-link" : "tint-ink-2"}`} />
      </View>
      <View
        role="button"
        accessibilityLabel={t("repost.action")}
        onPress={props.onRepost}
        hitSlop={8}
        class="w-10 shrink-0 flex-row justify-end active:opacity-60"
      >
        <Icon name="repeat" class="size-4 tint-ink-2" />
      </View>
      <View
        role="button"
        accessibilityLabel={t("reply.to", { name: c().user.name })}
        onPress={props.onReply}
        hitSlop={8}
        class="w-10 shrink-0 flex-row justify-end active:opacity-60"
      >
        <Icon name="message-circle" class="size-4 tint-ink-2" />
      </View>
    </View>
  );
}
