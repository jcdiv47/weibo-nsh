// Search, from the timeline's search button: a field under the status bar, Weibo's hot searches
// under it until something is typed, then what Weibo suggests for it (accounts by that name,
// searches that start so). A search opens what it finds over this page: posts and accounts, under
// two tabs; its field brings back this page to change it.
import { effect, type InputRef, type JSX, List, signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { t } from "nsh/i18n";
import {
  follow,
  hotSearches,
  type HotWord,
  searchPosts,
  searchSuggest,
  searchUsers,
  type Status,
  type Suggestions,
  type User,
} from "../api";
import { NotSignedIn } from "../bridge";
import { FeedFooter } from "../components/FeedFooter";
import { BAR, createPageScroll, Page } from "../components/Header";
import { Icon } from "../components/Icon";
import { Spinner } from "../components/Spinner";
import { StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count } from "../format";
import { nav, openSearchResults } from "../nav";
import { PersonRow } from "./People";

/** How long typing pauses before Weibo is asked for suggestions. */
const SUGGEST_DELAY_MS = 250;
/** The most suggested searches shown: Weibo sends thirty or so. */
const MAX_WORDS = 10;

/** The field's capsule: the search icon, then what it holds. */
function Field(props: { children: JSX.Element }) {
  return (
    <View class="h-10 flex-1 flex-row items-center gap-2 rounded-full bg-well pl-3.5 pr-2">
      <Icon name="search" class="size-[18px] tint-ink-2" />
      {props.children}
    </View>
  );
}

/** The bar: the field, then 取消, which leaves search (`depth` pages: results over search, two). */
function SearchBar(props: { children: JSX.Element; depth?: number }) {
  return (
    <View class="flex-row items-center gap-3.5 px-4" style={{ height: BAR }}>
      <Field>{props.children}</Field>
      <Button onPress={() => nav.pop(props.depth ?? 1)} class="h-10 justify-center active:opacity-60">
        <Text class="text-body text-ink">{t("common.cancel")}</Text>
      </Button>
    </View>
  );
}

/** A row that starts with an icon in the column of the accounts' pictures. */
function IconRow(props: { icon: JSX.Element; label: string; onPress: () => void; children: JSX.Element; divider?: boolean }) {
  return (
    <View role="button" accessibilityLabel={props.label} onPress={props.onPress} class="h-12 flex-row items-center gap-3 px-4 active:bg-well">
      <View class="w-11 shrink-0 items-center">{props.icon}</View>
      {props.children}
      <If when={props.divider}>
        <View class="absolute bottom-0 left-0 right-0 h-[0.5px] bg-hairline" />
      </If>
    </View>
  );
}

/** A hot search: its rank (the first three in Weibo's orange), the words, its mark or its count. */
function HotRow(props: { word: HotWord; rank: number }) {
  const w = () => props.word;
  return (
    <View
      role="button"
      accessibilityLabel={w().word}
      onPress={() => openSearchResults(w().query)}
      class="h-12 flex-row items-center gap-2.5 px-4 active:bg-well"
    >
      <Text
        class={`w-[22px] shrink-0 text-center text-headline leading-[22px] ${props.rank <= 3 ? "font-bold text-weibo" : "font-semibold text-ink-3"}`}
      >
        {String(props.rank)}
      </Text>
      <Text class="flex-1 text-body leading-5 text-ink line-clamp-1">{w().word}</Text>
      <View class="w-16 shrink-0 flex-row justify-end">
        <If
          when={w().label}
          else={
            <If when={w().count}>
              <Text class="text-xs text-ink-3">{count(w().count!)}</Text>
            </If>
          }
        >
          {(label) => (
            <View class="rounded-[4px] px-1" style={{ backgroundColor: label().color }}>
              <Text class="text-fine font-semibold leading-4 text-white">{label().text}</Text>
            </View>
          )}
        </If>
      </View>
    </View>
  );
}

/** A suggested search, the part typed in Weibo's orange. */
function WordRow(props: { word: string; typed: string }) {
  const typed = () => (props.word.startsWith(props.typed) ? props.typed : "");
  return (
    <IconRow
      icon={<Icon name="search" class="size-[18px] tint-ink-3" />}
      label={props.word}
      onPress={() => openSearchResults(props.word)}
    >
      <Text class="flex-1 text-body leading-5 text-ink line-clamp-1">
        <Text class="text-weibo">{typed()}</Text>
        {props.word.slice(typed().length)}
      </Text>
    </IconRow>
  );
}

type Row =
  | { id: string; kind: "search"; q: string }
  | { id: string; kind: "user"; user: User }
  | { id: string; kind: "word"; word: string };

/** The search page: hot searches, or suggestions for what is typed. */
export function Search() {
  const text = signal("");
  let input: InputRef | undefined;
  const typed = () => text().trim();

  // Hot searches, once per visit: a list that changes by the minute is not saved.
  const hot = signal<HotWord[]>([]);
  const hotLoading = signal(false);
  const hotError = signal<string | null>(null);
  const loadHot = () => {
    if (hotLoading()) return;
    hotLoading.set(true);
    hotError.set(null);
    hotSearches()
      .then((words) => hot.set(words))
      .catch((e) => {
        if (!(e instanceof NotSignedIn)) hotError.set(String((e as Error)?.message ?? e));
      })
      .finally(() => hotLoading.set(false));
  };
  loadHot();

  // Suggestions for what is typed, once typing pauses; an answer for older text is dropped.
  const suggested = signal<{ q: string; s: Suggestions } | null>(null);
  let asked = 0;
  let timer: number | undefined;
  effect(() => {
    const q = typed();
    clearTimeout(timer);
    const mine = ++asked;
    if (!q) return;
    timer = setTimeout(() => {
      searchSuggest(q).then(
        (s) => mine === asked && suggested.set({ q, s }),
        () => {}, // Suggestions are a help: without them, the search itself still runs.
      );
    }, SUGGEST_DELAY_MS);
  });
  const rows = (): Row[] => {
    const q = typed();
    const s = suggested()?.q === q ? suggested()!.s : undefined;
    return [
      { id: "search", kind: "search", q },
      ...(s?.users ?? []).map((user): Row => ({ id: `u:${user.id}`, kind: "user", user })),
      ...(s?.words ?? [])
        .filter((w) => w !== q)
        .slice(0, MAX_WORDS)
        .map((word): Row => ({ id: `w:${word}`, kind: "word", word })),
    ];
  };

  const submit = () => {
    if (typed()) openSearchResults(typed());
  };
  const scroll = createPageScroll();
  return (
    <Page
      title={t("search.title")}
      scroll={scroll}
      bar={
        <SearchBar>
          <Input
            ref={(r) => (input = r)}
            value={text()}
            onChange={(e) => text.set(e.value)}
            onSubmit={submit}
            placeholder={t("search.placeholder")}
            returnKeyType="search"
            submitBehavior="blurAndSubmit"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={100}
            class="h-10 flex-1 text-body text-ink placeholder:text-ink-3"
          />
          <If when={text()}>
            <Button
              accessibilityLabel={t("search.clear")}
              onPress={() => {
                text.set("");
                input?.focus();
              }}
              class="size-8 items-center justify-center active:opacity-60"
            >
              <Icon name="circle-x-filled" class="size-[18px] tint-ink-3" />
            </Button>
          </If>
        </SearchBar>
      }
    >
      <If
        when={typed()}
        else={
          <List
            {...scroll.list()}
            each={hot()}
            keyExtractor={(w) => w.query}
            estimatedItemSize={48}
            keyboardDismissMode="on-drag"
            header={
              <View class="flex-row items-baseline justify-between px-4 pb-1.5 pt-5">
                <Text role="header" class="text-headline font-bold text-ink">
                  {t("search.hot")}
                </Text>
              </View>
            }
            footer={
              <If when={hotError() || hotLoading() || !hot().length}>
                <FeedFooter loading={hotLoading()} error={hotError()} done empty={!hot().length} onRetry={loadHot} />
              </If>
            }
            class="flex-1"
          >
            {(w, i) => <HotRow word={w()} rank={i() + 1} />}
          </List>
        }
      >
        <List
          {...scroll.list()}
          each={rows()}
          keyExtractor={(r) => r.id}
          estimatedItemSize={56}
          keyboardDismissMode="on-drag"
          class="flex-1"
        >
          {(row) => {
            const r = row();
            switch (r.kind) {
              case "search":
                return (
                  <IconRow
                    icon={<Icon name="arrow-right" class="size-[18px] tint-weibo" />}
                    label={t("search.search_for", { q: r.q })}
                    onPress={submit}
                    divider
                  >
                    <Text class="flex-1 text-body font-semibold leading-5 text-weibo line-clamp-1">
                      {t("search.search_for", { q: r.q })}
                    </Text>
                  </IconRow>
                );
              case "user":
                return <PersonRow user={r.user} />;
              case "word":
                return <WordRow word={r.word} typed={typed()} />;
            }
          }}
        </List>
      </If>
    </Page>
  );
}

type Tab = "posts" | "users";

/** The height of the tabs under the bar, their hairline included. */
const TABS = 44;

/** 微博 and 用户, as a profile's people: the chosen one in ink over Weibo's orange bar. */
function Tabs(props: { value: Tab; onChange: (tab: Tab) => void }) {
  return (
    <View role="tablist" class="h-[44px] flex-row items-end gap-7 border-b-[0.5px] border-hairline bg-ground px-4">
      <Each of={["posts", "users"] as Tab[]}>
        {(tab) => {
          const on = () => props.value === tab();
          return (
            <Button
              role="tab"
              accessibilityLabel={t(`search.tab_${tab()}`)}
              selected={on()}
              onPress={() => props.onChange(tab())}
              class="items-center gap-2 active:opacity-60"
            >
              <Text class={`text-body leading-5 ${on() ? "font-semibold text-ink" : "text-ink-2"}`}>{t(`search.tab_${tab()}`)}</Text>
              <View class={`h-[3px] w-6 rounded-full ${on() ? "bg-weibo" : "bg-transparent"}`} />
            </Button>
          );
        }}
      </Each>
    </View>
  );
}

/** Follows an account from its row; once followed, says so (unfollowing is on their profile). */
function FollowButton(props: { user: User }) {
  const following = signal(!!props.user.following);
  const busy = signal(false);
  const failed = signal(false);
  const press = () => {
    if (busy() || following()) return;
    busy.set(true);
    failed.set(false);
    follow(props.user.id)
      .then(() => following.set(true), () => failed.set(true))
      .finally(() => busy.set(false));
  };
  return (
    <If
      when={!following()}
      else={
        <View class="h-7 shrink-0 justify-center rounded-full bg-well px-3">
          <Text class="text-meta text-ink-2">{props.user.followsMe ? t("people.mutual") : t("profile.following")}</Text>
        </View>
      }
    >
      <Button
        accessibilityLabel={`${t("profile.follow")} ${props.user.name}`}
        onPress={press}
        class={`h-7 shrink-0 flex-row items-center gap-0.5 rounded-full border px-3 active:opacity-60 ${failed() ? "border-danger" : "border-weibo"}`}
      >
        <If when={busy()} else={<Icon name="user-plus" class={`size-3.5 ${failed() ? "tint-danger" : "tint-weibo"}`} />}>
          <Spinner />
        </If>
        <Text class={`text-meta font-semibold ${failed() ? "text-danger" : "text-weibo"}`}>
          {failed() ? t("common.retry") : t("profile.follow")}
        </Text>
      </Button>
    </If>
  );
}

/** What a search found: its posts and its accounts, each list loaded when its tab first shows. */
export function SearchResults(props: { q: string }) {
  const posts = createFeed<Status, number>((page) => searchPosts(props.q, page ?? 1));
  const users = createFeed<User, number>((page) => searchUsers(props.q, page ?? 1));
  const tab = signal<Tab>("posts");
  const opened = new Set<Tab>(["posts"]);
  posts.more();
  const show = (next: Tab) => {
    tab.set(next);
    if (!opened.has(next)) {
      opened.add(next);
      users.more();
    }
  };
  const feed = () => (tab() === "posts" ? posts : users);
  const scroll = createPageScroll({ accessory: TABS, refreshing: () => feed().refreshing() });
  const footer = () => (
    <FeedFooter
      loading={feed().loading()}
      error={feed().error()}
      done={feed().done()}
      empty={!(tab() === "posts" ? posts.items() : users.items()).length}
      onRetry={() => feed().more()}
    />
  );
  return (
    <Page
      title={props.q}
      scroll={scroll}
      accessory={<Tabs value={tab()} onChange={show} />}
      bar={
        <SearchBar depth={2}>
          {/* The search, as typed: a press brings back the search page to change it. */}
          <Button accessibilityLabel={t("search.edit", { q: props.q })} onPress={() => nav.pop()} class="h-10 flex-1 justify-center">
            <Text class="text-body text-ink line-clamp-1">{props.q}</Text>
          </Button>
        </SearchBar>
      }
    >
      <If
        when={tab() === "users"}
        else={
          <List
            {...scroll.list()}
            each={posts.items()}
            keyExtractor={(s) => s.id}
            estimatedItemSize={220}
            refreshing={posts.refreshing()}
            onRefresh={() => posts.refresh()}
            onLoadMore={() => posts.more()}
            footer={footer()}
            class="flex-1"
          >
            {(status) => <StatusCard status={status()} />}
          </List>
        }
      >
        <List
          {...scroll.list()}
          each={users.items()}
          keyExtractor={(u) => u.id}
          estimatedItemSize={84}
          refreshing={users.refreshing()}
          onRefresh={() => users.refresh()}
          onLoadMore={() => users.more()}
          footer={footer()}
          class="flex-1"
        >
          {(u) => <PersonRow user={u()} trailing={<FollowButton user={u()} />} />}
        </List>
      </If>
    </Page>
  );
}
