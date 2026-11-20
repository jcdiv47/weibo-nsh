// A post and its comments; a comment's replies open in place.
import { List, signal, Text, View } from "nsh";
import { Button, NavPage } from "nsh/base";
import { t } from "nsh/i18n";
import { type Comment, comments, longText, replies, type Status } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { Header } from "../components/Header";
import { RichText } from "../components/RichText";
import { SavedNotice } from "../components/SavedNotice";
import { Avatar, Pictures, StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count, relativeTime } from "../format";
import { openProfile, openProfileByName, postById } from "../nav";

interface Thread {
  items: Comment[];
  next: string | null;
  loading: boolean;
  error?: string;
}

export function Post(props: { id: string }) {
  const status = postById(props.id);
  if (!status) {
    return (
      <NavPage title={t("post.title")} header={<Header title={t("post.title")} />}>
        <Text class="p-4 text-muted-foreground">{t("post.gone")}</Text>
      </NavPage>
    );
  }
  const full = signal<Status>(status);
  if (status.isLongText && status.mblogid) {
    longText(status.mblogid).then(
      (t) => t && full.set({ ...status, text: t.text, links: { ...status.links, ...t.links } }),
      () => {},
    );
  }
  const feed = createFeed((cursor?: string) => comments(status, cursor), { saveAs: () => `comments:${status.id}` });
  feed.more();

  // Opened threads by comment id: rows are recycled, so their state lives in the page.
  const threads = signal<Record<string, Thread>>({});
  const setThread = (id: string, t: Thread) => threads.update((all) => ({ ...all, [id]: t }));
  async function loadReplies(c: Comment) {
    const cur = threads()[c.id];
    if (cur?.loading || (cur && cur.next === null)) return;
    setThread(c.id, { items: cur?.items ?? [], next: cur?.next ?? null, loading: true });
    try {
      const page = await replies(c, status!.user.id, cur?.next ?? undefined);
      setThread(c.id, { items: [...(cur?.items ?? []), ...page.items], next: page.next, loading: false });
    } catch (e) {
      setThread(c.id, { items: cur?.items ?? [], next: cur?.next ?? null, loading: false, error: String(e) });
    }
  }

  return (
    <NavPage title={t("post.title")} header={<Header title={t("post.title")} />}>
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
          <CommentRow comment={c()} thread={threads()[c().id]} onReplies={() => loadReplies(c())} />
        )}
      </List>
    </NavPage>
  );
}

function CommentBody(props: { comment: Comment; small?: boolean }) {
  // No `flex-1`: in a column it sets a zero basis, and the replies' bodies collapsed onto each other.
  return (
    <View class="gap-1">
      <View class="flex-row items-center gap-2">
        <Text
          role="button"
          onPress={() => openProfile(props.comment.user.id)}
          class={`${props.small ? "text-xs" : "text-sm"} font-semibold text-foreground`}
        >
          {props.comment.user.name}
        </Text>
        <If when={props.comment.replyTo}>
          <Text
            role="link"
            onPress={() => {
              const c = props.comment;
              if (c.replyToUid) openProfile(c.replyToUid);
              else if (c.replyTo) openProfileByName(c.replyTo);
            }}
            class="text-xs text-muted-foreground active:opacity-60"
          >
            → {props.comment.replyTo}
          </Text>
        </If>
        <Text class="text-xs text-muted-foreground">{relativeTime(props.comment.createdAt)}</Text>
        <View class="flex-1" />
        <If when={props.comment.likes}>
          <Text class="text-xs text-muted-foreground">♥ {count(props.comment.likes)}</Text>
        </If>
      </View>
      <RichText
        text={props.comment.text.trimEnd()}
        links={props.comment.links}
        plainMentions
        hidePictureLinks
        class={`select-text ${props.small ? "text-sm" : "text-[15px]"} leading-6 text-foreground`}
      />
      <Pictures pics={props.comment.pics} small />
    </View>
  );
}

function CommentRow(props: { comment: Comment; thread?: Thread; onReplies: () => void }) {
  const shown = () => (props.thread ? props.thread.items : props.comment.preview);
  const more = () =>
    props.thread ? props.thread.next !== null : props.comment.replyCount > props.comment.preview.length;
  return (
    <View class="flex-row gap-3 border-b border-border px-4 py-3">
      <Avatar user={props.comment.user} size="sm" />
      <View class="flex-1 gap-2">
        <CommentBody comment={props.comment} />
        <If when={shown().length || more()}>
          <View class="gap-2 rounded-lg bg-muted px-3 py-2">
            <Each of={shown()} key={(r) => r.id}>
              {(r) => <CommentBody comment={r()} small />}
            </Each>
            <If when={props.thread?.error}>
              <Text class="text-xs text-destructive">{props.thread?.error}</Text>
            </If>
            <If when={more()}>
              <Button onPress={props.onReplies} disabled={props.thread?.loading} class="self-start active:opacity-60">
                <Text class="text-xs text-primary">
                  {props.thread?.loading
                    ? t("common.loading")
                    : props.thread
                      ? t("post.more_replies")
                      : t("post.view_replies", { n: count(props.comment.replyCount) })}
                </Text>
              </Button>
            </If>
          </View>
        </If>
      </View>
    </View>
  );
}
