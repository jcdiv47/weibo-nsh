// A comment's thread: the comment, then all its replies, oldest first. A press on the comment or
// on a reply answers it.
import { List, signal, Text, View } from "nsh";
import { t } from "nsh/i18n";
import { type Comment, replies, type Status } from "../api";
import { CommentBody, CommentFooter } from "../components/CommentBody";
import { FeedFooter } from "../components/FeedFooter";
import { createPageScroll, Page } from "../components/Header";
import { openReply, openRepost } from "../components/ReplySheet";
import { Avatar } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count } from "../format";
import { commentById, postById } from "../nav";

function ReplyRow(props: {
  comment: Comment;
  root?: boolean;
  onPress: () => void;
  onRepost: () => void;
}) {
  return (
    <View
      role="button"
      accessibilityLabel={t("reply.to", { name: props.comment.user.name })}
      onPress={props.onPress}
      class={`flex-row px-4 pt-3.5 active:bg-well ${props.root ? "gap-3 border-b-8 border-well pb-4" : "gap-2.5 border-b-[0.5px] border-hairline pb-3"}`}
    >
      <Avatar user={props.comment.user} size={props.root ? "md" : "sm"} />
      <View class={`flex-1 ${props.root ? "gap-2" : "gap-1.5"}`}>
        <CommentBody comment={props.comment} root={props.root} />
        <CommentFooter comment={props.comment} onReply={props.onPress} onRepost={props.onRepost} />
      </View>
    </View>
  );
}

export function Replies(props: { postId: string; commentId: string }) {
  const status = postById(props.postId);
  const root = commentById(props.commentId);
  if (!status || !root) {
    return (
      <Page title={t("post.title")}>
        <Text class="p-4 text-ink-2">{t("post.gone")}</Text>
      </Page>
    );
  }
  const total = signal(root.replyCount);
  const title = () => t("replies.title", { n: count(total()) });
  const feed = createFeed((cursor?: string) => replies(root, status.user.id, cursor));
  feed.more();

  // A reply sent from here goes at the end of the thread, where Weibo files it.
  const reply = (s: Status, to: Comment) =>
    openReply(s, to, (sent) => {
      total.update((n) => n + 1);
      if (sent) feed.update((list) => (list.some((c) => c.id === sent.id) ? list : [...list, sent]));
    });

  const scroll = createPageScroll();
  return (
    <Page title={title()} scroll={scroll}>
      <List
        {...scroll.list()}
        each={feed.items()}
        keyExtractor={(c) => c.id}
        estimatedItemSize={80}
        onLoadMore={() => feed.more()}
        header={<ReplyRow comment={root} root onPress={() => reply(status, root)} onRepost={() => openRepost(status, root)} />}
        footer={
          <FeedFooter
            loading={feed.loading()}
            error={feed.error()}
            done={feed.done()}
            empty={!feed.items().length}
            onRetry={() => feed.more()}
          />
        }
        class="flex-1"
      >
        {(c) => (
          <ReplyRow
            comment={c()}
            onPress={() => reply(status, c())}
            onRepost={() => openRepost(status, c(), root)}
          />
        )}
      </List>
    </Page>
  );
}
