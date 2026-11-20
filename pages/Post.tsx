// A post and its comments: a press on a comment replies to it, one on its replies opens its thread.
// A post the app has not got (one a "微博正文" link points at) loads by its id first.
import { List, signal, Text, View } from "nsh";
import { Button, NavPage } from "nsh/base";
import { t } from "nsh/i18n";
import { NotSignedIn } from "../bridge";
import { type Comment, comments, longText, type Status, status as loadStatus } from "../api";
import { CommentBody } from "../components/CommentBody";
import { FeedFooter } from "../components/FeedFooter";
import { Header } from "../components/Header";
import { Spinner } from "../components/Spinner";
import { openReply } from "../components/ReplySheet";
import { SavedNotice } from "../components/SavedNotice";
import { Avatar, StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count } from "../format";
import { keepPost, openReplies, postById } from "../nav";

export function Post(props: { id: string }) {
  const cached = postById(props.id);
  if (cached) {
    return (
      <NavPage title={t("post.title")} header={<Header title={t("post.title")} />}>
        <PostBody status={cached} />
      </NavPage>
    );
  }

  const loaded = signal<Status | null>(null);
  const error = signal<string | null>(null);
  const load = () => {
    error.set(null);
    loadStatus(props.id).then(
      (s) => {
        keepPost(props.id, s);
        loaded.set(s);
      },
      (e) => {
        if (!(e instanceof NotSignedIn)) error.set(String(e?.message ?? e));
      },
    );
  };
  load();
  // One page, there from the start: the post takes the spinner's place when it comes.
  return (
    <NavPage title={t("post.title")} header={<Header title={t("post.title")} />}>
      <If
        when={loaded()}
        else={
          <View class="items-center gap-3 p-8">
            <If when={error()} else={<Spinner />}>
              <Text class="text-center text-sm text-muted-foreground">{error()}</Text>
              <Button onPress={load} class="rounded-(--radius) border border-border px-4 py-2 active:opacity-60">
                <Text class="text-foreground">{t("common.retry")}</Text>
              </Button>
            </If>
          </View>
        }
      >
        {(s) => <PostBody status={s()} />}
      </If>
    </NavPage>
  );
}

/** The post and its comments, under the page's header. */
function PostBody(props: { status: Status }) {
  const status = props.status;
  const full = signal<Status>(status);
  if (status.isLongText && status.mblogid) {
    longText(status.mblogid).then(
      (t) => t && full.set({ ...status, text: t.text, links: { ...status.links, ...t.links } }),
      () => {},
    );
  }
  const feed = createFeed((cursor?: string) => comments(status, cursor), { saveAs: () => `comments:${status.id}` });
  feed.more();

  // A reply sent from here joins its comment's thread, as Weibo now has it.
  const sent = (to: Comment) => (reply: Comment | null) =>
    feed.update((list) =>
      list.map((c) =>
        c.id === to.id
          ? { ...c, replyCount: c.replyCount + 1, preview: reply && c.preview.length < 3 ? [...c.preview, reply] : c.preview }
          : c,
      ),
    );

  return (
    <List
      each={feed.items()}
      keyExtractor={(c) => c.id}
      estimatedItemSize={96}
      onLoadMore={() => feed.more()}
      header={
        <View>
          <StatusCard status={full()} full />
          <Text class="px-4 pt-3 pb-1 text-sm font-semibold text-muted-foreground">
            {t("post.comments", { n: count(status.comments) })}
          </Text>
          <SavedNotice at={feed.savedAt()} failed={!!feed.error()} onRetry={() => feed.more()} />
        </View>
      }
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
        <CommentRow
          comment={c()}
          onReply={() => openReply(full(), c(), sent(c()))}
          onReplies={() => openReplies(full(), c())}
        />
      )}
    </List>
  );
}

function CommentRow(props: { comment: Comment; onReply: () => void; onReplies: () => void }) {
  const c = () => props.comment;
  return (
    <View
      role="button"
      accessibilityLabel={t("reply.to", { name: c().user.name })}
      onPress={props.onReply}
      class="flex-row gap-3 border-b border-border px-4 py-3 active:bg-muted/40"
    >
      <Avatar user={c().user} size="sm" />
      <View class="flex-1 gap-2">
        <CommentBody comment={c()} />
        <If when={c().replyCount > 0 || c().preview.length}>
          <View
            role="button"
            accessibilityLabel={t("replies.title", { n: count(c().replyCount) })}
            onPress={props.onReplies}
            class="gap-2 rounded-lg bg-muted px-3 py-2 active:opacity-60"
          >
            <Each of={c().preview} key={(r) => r.id}>
              {(r) => <CommentBody comment={r()} small />}
            </Each>
            <If when={c().replyCount > c().preview.length}>
              <Text class="text-xs text-primary">{t("post.view_replies", { n: count(c().replyCount) })}</Text>
            </If>
          </View>
        </If>
      </View>
    </View>
  );
}
