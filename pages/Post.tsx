// A post and, in tabs under it, its reposts, comments and likes: a press on a comment replies to
// it, one on its replies opens its thread. A bar floats at the bottom, in glass: a field that
// comments on the post, and buttons that repost and like it.
// A post the app has not got (one a "微博正文" link points at) loads by its id first.
import { computed, List, safeArea, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { t } from "nsh/i18n";
import { NotSignedIn } from "../bridge";
import { type Comment, comments, likes, reposts, type Status, status as loadStatus, type User } from "../api";
import { CommentBody, CommentFooter, InlineReply } from "../components/CommentBody";
import { ErrorText, FeedFooter, RetryButton } from "../components/FeedFooter";
import { FavoriteButton } from "../components/FavoriteButton";
import { Icon } from "../components/Icon";
import { createPageScroll, Page, type PageScroll } from "../components/Header";
import { Spinner } from "../components/Spinner";
import { GLASS_PRESS, glass } from "../components/Glass";
import { openComment, openReply, openRepost, openRepostStatus } from "../components/ReplySheet";
import { RichText } from "../components/RichText";
import { SavedNotice } from "../components/SavedNotice";
import { Avatar, likeOf as likeState, StatusCard, toggleLike } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count, relativeTime } from "../format";
import { keepPost, openPost, openProfile, openReplies, postById, withFullText } from "../nav";

export function Post(props: { id: string }) {
  const cached = postById(props.id);
  const scroll = createPageScroll();
  if (cached) {
    return (
      <Page title={t("post.title")} right={<FavoriteButton status={cached} />} scroll={scroll}>
        <PostBody status={cached} scroll={scroll} />
      </Page>
    );
  }

  const loaded = signal<Status | null>(null);
  const error = signal<string | null>(null);
  const load = () => {
    error.set(null);
    // The whole text before the post shows, so that it does not grow under the reader.
    loadStatus(props.id).then(withFullText).then(
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
    <Page
      title={t("post.title")}
      right={<If when={loaded()}>{(s) => <FavoriteButton status={s()} />}</If>}
      scroll={scroll}
    >
      <If
        when={loaded()}
        else={
          <View class="items-center gap-3 p-8" style={{ paddingTop: scroll.inset() + 32 }}>
            <If when={error()} else={<Spinner />}>
              <ErrorText error={error()!} />
              <RetryButton onPress={load} />
            </If>
          </View>
        }
      >
        {(s) => <PostBody status={s()} scroll={scroll} />}
      </If>
    </Page>
  );
}

type Tab = "reposts" | "comments" | "likes";

/** A row of the list under the tabs: whichever list the tab shows. */
type Row = { id: string; comment: Comment } | { id: string; repost: Status } | { id: string; like: User };
const commentOf = (r: Row) => ("comment" in r ? r.comment : undefined);
const repostOf = (r: Row) => ("repost" in r ? r.repost : undefined);
const likeOf = (r: Row) => ("like" in r ? r.like : undefined);

/**
 * The post, then three tabs, as weibo.com's post page has them: its reposts, its comments (shown
 * first) and who liked it, each list below them. A tab's list loads when it is first opened, and
 * stays loaded while the page is open: switching back shows it at once.
 */
function PostBody(props: { status: Status; scroll: PageScroll }) {
  const status = props.status;
  const full = signal<Status>(status);
  // Opened before its whole text came (`openPost` gave up waiting): it takes the cut text's place.
  if (status.isLongText) withFullText(status).then((s) => s !== status && full.set(s));
  const feeds = {
    comments: createFeed((cursor?: string) => comments(status, cursor), { saveAs: () => `comments:${status.id}` }),
    // Not saved on the device: the saved store keeps few pages, and these are worth less offline
    // than the timeline's and profiles' that they would push out.
    reposts: createFeed<Status, number>((page) => reposts(status, page ?? 1)),
    likes: createFeed<User, number>((page) => likes(status, page ?? 1)),
  };
  const tab = signal<Tab>("comments");
  const opened = new Set<Tab>(["comments"]);
  feeds.comments.more();
  const open = (to: Tab) => {
    tab.set(to);
    if (!opened.has(to)) {
      opened.add(to);
      feeds[to].more();
    }
  };
  const feed = () => feeds[tab()];
  // Each item keeps one row object while it is loaded, so a change (a page more, a reply sent)
  // hands the list new objects only for the items that changed.
  const wrapped = new WeakMap<object, Row>();
  const wrap = <T extends object>(item: T, make: (item: T) => Row) => {
    let row = wrapped.get(item);
    if (!row) wrapped.set(item, (row = make(item)));
    return row;
  };
  const rows = computed((): Row[] => {
    switch (tab()) {
      case "comments":
        return feeds.comments.items().map((c) => wrap(c, (c) => ({ id: `c${c.id}`, comment: c })));
      case "reposts":
        return feeds.reposts.items().map((s) => wrap(s, (s) => ({ id: `r${s.id}`, repost: s })));
      case "likes":
        return feeds.likes.items().map((u) => wrap(u, (u) => ({ id: `l${u.id}`, like: u })));
    }
  });

  // A reply sent from here joins its comment's thread, as Weibo now has it.
  const sent = (to: Comment) => (reply: Comment | null) =>
    feeds.comments.update((list) =>
      list.map((c) =>
        c.id === to.id
          ? { ...c, replyCount: c.replyCount + 1, preview: reply && c.preview.length < 3 ? [...c.preview, reply] : c.preview }
          : c,
      ),
    );

  // A comment on the post goes at the top of its comments, which the page then shows.
  const commented = (c: Comment | null) => {
    full.update((s) => ({ ...s, comments: s.comments + 1 }));
    if (c) feeds.comments.update((list) => [c, ...list]);
    open("comments");
  };

  return (
    <>
      <List
        {...props.scroll.list()}
        each={rows()}
        keyExtractor={(r) => r.id}
        estimatedItemSize={tab() === "likes" ? 52 : 96}
        onLoadMore={() => feed().more()}
        header={
          <View>
            <StatusCard status={full()} full />
            <Tabs status={full()} tab={tab()} onTab={open} />
            <SavedNotice at={feed().savedAt()} failed={!!feed().error()} onRetry={() => feed().more()} />
          </View>
        }
        footer={
          // The last rows clear the action bar.
          <View style={{ paddingBottom: ACTIONS_HEIGHT + actionsBottom() + 12 }}>
            <FeedFooter
              loading={feed().loading()}
              error={feed().error()}
              done={feed().done()}
              empty={!rows().length}
              onRetry={() => feed().more()}
            />
          </View>
        }
        class="flex-1"
      >
        {/* Rows are recycled across tabs: the row's kind is read again with each item it shows. */}
        {(r) => (
          <If
            when={commentOf(r())}
            else={
              <If when={repostOf(r())} else={<If when={likeOf(r())}>{(u) => <LikeRow user={u()} />}</If>}>
                {(s) => <RepostRow repost={s()} />}
              </If>
            }
          >
            {(c) => (
              <CommentRow
                comment={c()}
                onReply={() => openReply(full(), c(), sent(c()))}
                onRepost={() => openRepost(full(), c())}
                onReplies={() => openReplies(full(), c())}
              />
            )}
          </If>
        )}
      </List>
      <PostActions status={full()} onComment={() => openComment(full(), commented)} />
    </>
  );
}

/** The action bar's capsules' height. */
const ACTIONS_HEIGHT = 50;
/** How far the action bar sits above the screen's bottom: in the home indicator's area, as the
 * system's own bottom bars do, clear of the screen's rounded corners. */
const actionsBottom = () => Math.max(safeArea().bottom - 4, 16);

/**
 * Over the bottom of the post's page, two glass capsules: a field that comments on the post, and
 * the post's repost and like buttons, the like filled while I like it. The counts are the tabs'.
 */
function PostActions(props: { status: Status; onComment: () => void }) {
  const look = () => glass("control");
  const like = () => likeState(props.status);
  return (
    <View class="absolute inset-x-4 flex-row items-center gap-2.5" style={{ bottom: actionsBottom() }}>
      <Button
        accessibilityLabel={t("reply.post_placeholder")}
        onPress={props.onComment}
        class={`h-[50px] flex-1 flex-row items-center gap-2 rounded-full px-[18px] ${GLASS_PRESS} ${look().class}`}
        style={look().style}
      >
        <Icon name="message-circle" class="size-[18px] tint-ink-2" />
        <Text class="text-body leading-5 text-ink-2">{t("reply.post_placeholder")}</Text>
      </Button>
      <View class={`h-[50px] flex-row items-center rounded-full px-1 ${look().class}`} style={look().style}>
        <Button
          accessibilityLabel={t("repost.action")}
          onPress={() => openRepostStatus(props.status)}
          class="size-[46px] items-center justify-center rounded-full active:opacity-60"
        >
          <Icon name="repeat" class="size-[22px] tint-ink" />
        </Button>
        <Button
          accessibilityLabel={t(like().liked ? "comment.unlike" : "comment.like")}
          selected={like().liked}
          onPress={() => toggleLike(props.status)}
          class="size-[46px] items-center justify-center rounded-full active:opacity-60"
        >
          <Icon name={like().liked ? "thumb-up-filled" : "thumb-up"} class={`size-[22px] ${like().liked ? "tint-link" : "tint-ink"}`} />
        </Button>
      </View>
    </View>
  );
}

function Tabs(props: { status: Status; tab: Tab; onTab: (tab: Tab) => void }) {
  const tabs: { id: Tab; label: () => string; n: () => number; a11y: () => string }[] = [
    { id: "reposts", label: () => t("post.tab_reposts"), n: () => props.status.reposts, a11y: () => t("post.reposts", { n: count(props.status.reposts) }) },
    { id: "comments", label: () => t("post.tab_comments"), n: () => props.status.comments, a11y: () => t("post.comments", { n: count(props.status.comments) }) },
    // The likes as the action bar's like button leaves them.
    { id: "likes", label: () => t("post.tab_likes"), n: () => likeState(props.status).likes, a11y: () => t("post.likes", { n: count(likeState(props.status).likes) }) },
  ];
  return (
    <View class="flex-row items-end gap-7 border-b-[0.5px] border-t-8 border-b-hairline border-t-well px-4">
      <Each of={tabs} key={(tb) => tb.id}>
        {(tb) => {
          const on = () => props.tab === tb().id;
          return (
            <Button
              role="tab"
              accessibilityLabel={tb().a11y()}
              selected={on()}
              onPress={() => props.onTab(tb().id)}
              class="items-center gap-2 pt-3 active:opacity-60"
            >
              <Text class={`text-body leading-5 ${on() ? "font-semibold text-ink" : "text-ink-2"}`}>
                {tb().label()}
                {tb().n() ? ` ${count(tb().n())}` : ""}
              </Text>
              <View class={`h-[3px] w-6 rounded-full ${on() ? "bg-weibo" : "bg-transparent"}`} />
            </Button>
          );
        }}
      </Each>
    </View>
  );
}

/** Someone who liked the post: who, nothing more; a press opens their profile. */
function LikeRow(props: { user: User }) {
  return (
    <View
      role="button"
      accessibilityLabel={props.user.name}
      onPress={() => openProfile(props.user.id)}
      class="flex-row items-center gap-2.5 border-b-[0.5px] border-hairline px-4 py-2.5 active:bg-well"
    >
      <Avatar user={props.user} size="sm" still />
      <Text class="flex-1 text-body font-semibold text-ink line-clamp-1">{props.user.name}</Text>
    </View>
  );
}

/** A repost: who, when, and what they said; a press opens it as a post of its own. */
function RepostRow(props: { repost: Status }) {
  const s = () => props.repost;
  return (
    <View
      role="button"
      onPress={() => openPost(s())}
      class="flex-row gap-2.5 border-b-[0.5px] border-hairline px-4 pb-3 pt-3.5 active:bg-well"
    >
      <Avatar user={s().user} size="sm" />
      <View class="flex-1 gap-1.5">
        <View class="flex-row items-center gap-2">
          <Text role="button" onPress={() => openProfile(s().user.id)} class="text-sm leading-[18px] text-ink-2">
            {s().user.name}
          </Text>
          <Text class="text-xs text-ink-3">{relativeTime(s().createdAt)}</Text>
        </View>
        <RichText text={s().text} links={s().links} class="text-body text-ink" />
      </View>
    </View>
  );
}

function CommentRow(props: { comment: Comment; onReply: () => void; onRepost: () => void; onReplies: () => void }) {
  const c = () => props.comment;
  return (
    <View
      role="button"
      accessibilityLabel={t("reply.to", { name: c().user.name })}
      onPress={props.onReply}
      class="flex-row gap-2.5 border-b-[0.5px] border-hairline px-4 pb-3 pt-3.5 active:bg-well"
    >
      <Avatar user={c().user} size="sm" />
      <View class="flex-1 gap-1.5">
        <CommentBody comment={c()} />
        <If when={c().replyCount > 0 || c().preview.length}>
          <View
            role="button"
            accessibilityLabel={t("replies.title", { n: count(c().replyCount) })}
            onPress={props.onReplies}
            class="gap-1 rounded-[8px] bg-well px-2.5 py-2 active:opacity-60"
          >
            <Each of={c().preview} key={(r) => r.id}>
              {(r) => <InlineReply comment={r()} />}
            </Each>
            <If when={c().replyCount > c().preview.length}>
              <View class="flex-row items-center gap-0.5 pt-0.5">
                <Text class="text-meta text-link">{t("post.view_replies", { n: count(c().replyCount) })}</Text>
                <Icon name="chevron-right" class="size-3.5 tint-link" />
              </View>
            </If>
          </View>
        </If>
        <CommentFooter comment={c()} onReply={props.onReply} onRepost={props.onRepost} />
      </View>
    </View>
  );
}
