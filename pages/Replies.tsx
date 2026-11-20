// A comment's thread: the comment, then all its replies, oldest first. A press on the comment or
// on a reply answers it.
import { List, signal, Text, View } from "nsh";
import { NavPage } from "nsh/base";
import { t } from "nsh/i18n";
import { type Comment, replies, type Status } from "../api";
import { CommentBody } from "../components/CommentBody";
import { FeedFooter } from "../components/FeedFooter";
import { Header } from "../components/Header";
import { openReply } from "../components/ReplySheet";
import { Avatar } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count } from "../format";
import { commentById, postById } from "../nav";

function ReplyRow(props: { comment: Comment; root?: boolean; parent?: Comment; onPress: () => void }) {
  return (
    <View
      role="button"
      accessibilityLabel={t("reply.to", { name: props.comment.user.name })}
      onPress={props.onPress}
      class={`flex-row gap-3 border-b border-border px-4 py-3 active:bg-muted/40 ${props.root ? "" : "pl-8"}`}
    >
      <Avatar user={props.comment.user} size="sm" />
      <View class="flex-1">
        <CommentBody comment={props.comment} small={!props.root} parent={props.parent} />
      </View>
    </View>
  );
}

export function Replies(props: { postId: string; commentId: string }) {
  const status = postById(props.postId);
  const root = commentById(props.commentId);
  if (!status || !root) {
    return (
      <NavPage title={t("post.title")} header={<Header title={t("post.title")} />}>
        <Text class="p-4 text-muted-foreground">{t("post.gone")}</Text>
      </NavPage>
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

  return (
    <NavPage title={title()} header={<Header title={title()} />}>
      <List
        each={feed.items()}
        keyExtractor={(c) => c.id}
        estimatedItemSize={80}
        onLoadMore={() => feed.more()}
        header={<ReplyRow comment={root} root onPress={() => reply(status, root)} />}
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
        {(c) => <ReplyRow comment={c()} parent={root} onPress={() => reply(status, c())} />}
      </List>
    </NavPage>
  );
}
