// A post and its comments; a comment's replies open in place.
import { List, signal, Text, View } from "nsh";
import { Button, NavPage } from "nsh/base";
import { type Comment, comments, longText, replies, type Status } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { Header } from "../components/Header";
import { Avatar, StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count, relativeTime } from "../format";
import { openProfile, postById } from "../nav";

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
      <NavPage title="Post" header={<Header title="Post" />}>
        <Text class="p-4 text-muted-foreground">This post is no longer loaded.</Text>
      </NavPage>
    );
  }
  const fullText = signal<string | undefined>(undefined);
  if (status.isLongText && status.mblogid) {
    longText(status.mblogid).then((t) => t && fullText.set(t), () => {});
  }
  const feed = createFeed((cursor?: string) => comments(status, cursor));
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
    <NavPage title="Post" header={<Header title="Post" />}>
      <List
        each={feed.items()}
        keyExtractor={(c) => c.id}
        estimatedItemSize={96}
        onLoadMore={() => feed.more()}
        header={
          <View>
            <StatusCard status={status} full text={fullText()} />
            <Text class="px-4 pt-3 pb-1 text-sm font-semibold text-muted-foreground">
              Comments {count(status.comments)}
            </Text>
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
  return (
    <View class="flex-1 gap-1">
      <View class="flex-row items-center gap-2">
        <Text
          role="button"
          onPress={() => openProfile(props.comment.user.id)}
          class={`${props.small ? "text-xs" : "text-sm"} font-semibold text-foreground`}
        >
          {props.comment.user.name}
        </Text>
        <If when={props.comment.replyTo}>
          <Text class="text-xs text-muted-foreground">→ {props.comment.replyTo}</Text>
        </If>
        <Text class="text-xs text-muted-foreground">{relativeTime(props.comment.createdAt)}</Text>
        <View class="flex-1" />
        <If when={props.comment.likes}>
          <Text class="text-xs text-muted-foreground">♥ {count(props.comment.likes)}</Text>
        </If>
      </View>
      <Text class={`select-text ${props.small ? "text-sm" : "text-[15px]"} leading-6 text-foreground`}>
        {props.comment.text}
      </Text>
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
                    ? "Loading…"
                    : props.thread
                      ? "More replies"
                      : `View ${count(props.comment.replyCount)} replies`}
                </Text>
              </Button>
            </If>
          </View>
        </If>
      </View>
    </View>
  );
}
