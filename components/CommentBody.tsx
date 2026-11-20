// A comment as Weibo's app lays it out: the author's name over the text and pictures; under them
// (and under its replies' preview) when and where it was sent from at the left, likes, repost and
// reply at the right. In the preview, each reply is one run of text, "name: text", with no time
// or likes.
import { signal, Text, View } from "nsh";
import { t } from "nsh/i18n";
import { type Comment, likeComment } from "../api";
import { count, relativeTime } from "../format";
import { openProfile, openProfileByName } from "../nav";
import { Icon } from "./Icon";
import { LINK_CLASS, LINK_TINT, RichText } from "./RichText";
import { Pictures } from "./StatusCard";

// `parent`: the comment this one sits under. A reply to it needs no "→ name": being in its
// thread says as much. Only a reply to someone else in the thread names them.
function replyTarget(c: Comment, p?: Comment) {
  if (!c.replyTo || !p) return c.replyTo;
  const toParent = c.replyToUid ? c.replyToUid === p.user.id : c.replyTo === p.user.name;
  return toParent ? undefined : c.replyTo;
}

function openReplyTarget(c: Comment) {
  if (c.replyToUid) openProfile(c.replyToUid);
  else if (c.replyTo) openProfileByName(c.replyTo);
}

const commentText = (c: Comment, cls: string) => (
  <RichText text={c.text.trimEnd()} links={c.links} plainMentions hidePictureLinks class={cls} />
);

/** The author's name, then the text and pictures. */
export function CommentBody(props: { comment: Comment; parent?: Comment }) {
  const replyTo = () => replyTarget(props.comment, props.parent);
  // No `flex-1`: in a column it sets a zero basis, and the replies' bodies collapsed onto each other.
  return (
    <View class="gap-1">
      <View class="flex-row items-center gap-2">
        <Text
          role="button"
          onPress={() => openProfile(props.comment.user.id)}
          class="text-sm text-muted-foreground active:opacity-60"
        >
          {props.comment.user.name}
        </Text>
        <If when={replyTo()}>
          <Text
            role="link"
            onPress={() => openReplyTarget(props.comment)}
            class="text-xs text-muted-foreground active:opacity-60"
          >
            → {replyTo()}
          </Text>
        </If>
      </View>
      {commentText(props.comment, "select-text text-[15px] leading-6 text-foreground")}
      <Pictures pics={props.comment.pics} small />
    </View>
  );
}

/** A reply in its comment's preview: "name: text" in one run, then its pictures. */
export function InlineReply(props: { comment: Comment; parent: Comment }) {
  const replyTo = () => replyTarget(props.comment, props.parent);
  return (
    <View class="gap-1">
      <Text class="text-sm leading-6 text-foreground">
        <Text role="button" onPress={() => openProfile(props.comment.user.id)} class="text-primary active:opacity-60">
          {props.comment.user.name}
        </Text>
        <If when={replyTo()}>
          <Text role="link" onPress={() => openReplyTarget(props.comment)} class="text-primary active:opacity-60">
            {` → ${replyTo()}`}
          </Text>
        </If>
        {": "}
        {commentText(props.comment, "")}
      </Text>
      <Pictures pics={props.comment.pics} small />
    </View>
  );
}

// Likes given or taken back here, by comment id. The lists hold plain objects, and a recycled row
// shows another comment: the row reads its comment's like from here first.
const likeChanges = signal<Record<string, { liked: boolean; likes: number }>>({});
const likeOf = (c: Comment) => likeChanges()[c.id] ?? { liked: c.liked, likes: c.likes };
const liking = new Set<string>();

/** Likes the comment, or takes the like back, at once; if Weibo refuses, as it was. */
async function toggleLike(c: Comment) {
  if (liking.has(c.id)) return;
  const was = likeOf(c);
  const now = { liked: !was.liked, likes: Math.max(0, was.likes + (was.liked ? -1 : 1)) };
  const show = (v: typeof was) => likeChanges.update((m) => ({ ...m, [c.id]: v }));
  show(now);
  liking.add(c.id);
  try {
    await likeComment(c, now.liked);
    c.liked = now.liked;
    c.likes = now.likes;
  } catch {
    show(was);
  } finally {
    liking.delete(c.id);
  }
}

/** When and where from at the left; like, repost and reply at the right. */
export function CommentFooter(props: { comment: Comment; onReply: () => void; onRepost: () => void }) {
  const c = () => props.comment;
  const like = () => likeOf(c());
  return (
    <View class="flex-row items-center gap-2">
      <Text class="text-xs text-muted-foreground">{relativeTime(c().createdAt)}</Text>
      <If when={c().region}>
        <Text class="text-xs text-muted-foreground">{t("post.comment_region", { region: c().region })}</Text>
      </If>
      <View class="flex-1" />
      <View class="flex-row items-center gap-6">
        <View
          role="button"
          accessibilityLabel={`${t(like().liked ? "comment.unlike" : "comment.like")}, ${t("post.likes", { n: count(like().likes) })}`}
          onPress={() => toggleLike(c())}
          class="flex-row items-center gap-1 active:opacity-60"
        >
          <If when={like().likes}>
            <Text class={`text-xs ${like().liked ? LINK_CLASS : "text-muted-foreground"}`}>{count(like().likes)}</Text>
          </If>
          <Icon
            name={like().liked ? "thumb-up-filled" : "thumb-up"}
            class={`size-4 ${like().liked ? LINK_TINT : "tint-muted-foreground"}`}
          />
        </View>
        <View role="button" accessibilityLabel={t("repost.action")} onPress={props.onRepost} class="active:opacity-60">
          <Icon name="repeat" class="size-4 tint-muted-foreground" />
        </View>
        <View
          role="button"
          accessibilityLabel={t("reply.to", { name: c().user.name })}
          onPress={props.onReply}
          class="active:opacity-60"
        >
          <Icon name="message-circle" class="size-4 tint-muted-foreground" />
        </View>
      </View>
    </View>
  );
}
