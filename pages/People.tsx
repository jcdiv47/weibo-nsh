// Who an account follows and who follows it, one list at a time under two tabs (as a post's
// reposts / comments / likes): each account opens its profile. A list loads when first shown and stays while the page is open.
import { List, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { t } from "nsh/i18n";
import { people, type User } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { createPageScroll, Page } from "../components/Header";
import { Icon } from "../components/Icon";
import { SavedNotice } from "../components/SavedNotice";
import { Avatar } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count } from "../format";
import { openProfile } from "../nav";

type Kind = "following" | "followers";

function PersonRow(props: { user: User }) {
  const u = () => props.user;
  return (
    <View
      role="button"
      accessibilityLabel={u().name}
      onPress={() => openProfile(u().id)}
      class="flex-row items-center gap-3 px-4 py-3 active:bg-well"
    >
      <Avatar user={u()} size="person" still />
      <View class="flex-1 gap-0.5">
        <View class="flex-row items-center gap-1.5">
          <Text class="shrink text-body leading-5 font-semibold text-ink line-clamp-1">{u().name}</Text>
          <If when={u().followsMe && u().following}>
            <View class="shrink-0 flex-row items-center gap-[3px] rounded-full bg-well px-1.5 py-px">
              <Icon name="arrows-left-right" class="size-3 tint-ink-2" />
              <Text class="text-xs text-ink-2">{t("people.mutual")}</Text>
            </View>
          </If>
        </View>
        <If when={u().description}>
          <Text class="text-sm leading-[19px] text-ink-2 line-clamp-1">{u().description}</Text>
        </If>
        <Text class="text-xs text-ink-2">{t("profile.followers_count", { n: count(u().followersCount ?? 0) })}</Text>
      </View>
      {/* The divider starts under the names, past the pictures. */}
      <View class="absolute bottom-0 left-[72px] right-0 h-[0.5px] bg-hairline" />
    </View>
  );
}

/** The height of the tabs under the header, their hairline included. */
const TABS = 44;

/** Two tabs under the header, as a post's: the count large, then what it counts; the chosen one
 * in ink over Weibo's orange bar. */
function Tabs(props: { value: Kind; onChange: (k: Kind) => void; n: (k: Kind) => number | undefined }) {
  return (
    <View role="tablist" class="h-[44px] flex-row items-end gap-7 border-b-[0.5px] border-hairline px-4">
      <Each of={["following", "followers"] as Kind[]}>
        {(k) => {
          const on = () => props.value === k();
          const name = () => t(k() === "followers" ? "people.followers" : "people.following");
          const n = () => props.n(k());
          return (
            <Button
              role="tab"
              accessibilityLabel={n() === undefined ? name() : `${name()} ${count(n()!)}`}
              selected={on()}
              onPress={() => props.onChange(k())}
              class="items-center gap-2 active:opacity-60"
            >
              <View class="flex-row items-center gap-1">
                <If when={n() !== undefined}>
                  <Text class={`text-headline leading-5 font-bold ${on() ? "text-ink" : "text-ink-2"}`}>{count(n()!)}</Text>
                </If>
                <Text class={`text-body leading-5 ${on() ? "font-semibold text-ink" : "text-ink-2"}`}>{name()}</Text>
              </View>
              <View class={`h-[3px] w-6 rounded-full ${on() ? "bg-weibo" : "bg-transparent"}`} />
            </Button>
          );
        }}
      </Each>
    </View>
  );
}

export function People(props: {
  uid: string;
  kind: Kind;
  /** The account's name and counts, from its profile: the title and the tabs' numbers. */
  name?: string;
  followingCount?: number;
  followersCount?: number;
}) {
  const make = (kind: Kind) =>
    createFeed<User, number>((page) => people(props.uid, kind, page ?? 1), {
      saveAs: () => `people:${kind}:${props.uid}`,
    });
  const feeds = { following: make("following"), followers: make("followers") };
  const kind = signal<Kind>(props.kind);
  const opened = new Set<Kind>([props.kind]);
  feeds[props.kind].more();
  const show = (k: Kind) => {
    kind.set(k);
    if (!opened.has(k)) {
      opened.add(k);
      feeds[k].more();
    }
  };
  const feed = () => feeds[kind()];
  const n = (k: Kind) => (k === "following" ? props.followingCount : props.followersCount);
  const title = props.name ?? t(props.kind === "followers" ? "people.followers" : "people.following");
  const scroll = createPageScroll({ accessory: TABS, refreshing: () => feed().refreshing() });
  return (
    <Page title={title} scroll={scroll} accessory={<Tabs value={kind()} onChange={show} n={n} />}>
      <List
        {...scroll.list()}
        each={feed().items()}
        keyExtractor={(u) => u.id}
        estimatedItemSize={84}
        refreshing={feed().refreshing()}
        onRefresh={() => feed().refresh()}
        onLoadMore={() => feed().more()}
        header={<SavedNotice at={feed().savedAt()} failed={!!feed().error()} onRetry={() => feed().more()} />}
        footer={
          <FeedFooter
            loading={feed().loading()}
            error={feed().error()}
            done={feed().done()}
            empty={!feed().items().length}
            onRetry={() => feed().more()}
          />
        }
        class="flex-1"
      >
        {(u) => <PersonRow user={u()} />}
      </List>
    </Page>
  );
}
