// Who an account follows and who follows it, one list at a time under a segmented control: each
// account opens its profile. A list loads when first shown and stays while the page is open.
import { List, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { t } from "nsh/i18n";
import { people, type User } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { Page } from "../components/Header";
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
      class="flex-row items-center gap-3 border-b-[0.5px] border-hairline px-4 py-3 active:bg-well"
    >
      <Avatar user={u()} size="person" still />
      <View class="flex-1 gap-0.5">
        <Text class="text-body leading-5 font-semibold text-ink line-clamp-1">{u().name}</Text>
        <If when={u().description}>
          <Text class="text-sm leading-[19px] text-ink-2 line-clamp-1">{u().description}</Text>
        </If>
        <Text class="text-xs text-ink-2">{t("profile.followers_count", { n: count(u().followersCount ?? 0) })}</Text>
      </View>
      <View class="w-[84px] shrink-0 flex-row justify-end">
        <If when={u().followsMe && u().following}>
          <View class="flex-row items-center gap-[3px] rounded-full bg-well px-2 py-[3px]">
            <Icon name="arrows-left-right" class="size-3 tint-ink-2" />
            <Text class="text-xs text-ink-2">{t("people.mutual")}</Text>
          </View>
        </If>
      </View>
    </View>
  );
}

/** Two segments in a capsule, the chosen one raised. */
function Segmented(props: { value: Kind; onChange: (k: Kind) => void; label: (k: Kind) => string }) {
  return (
    <View class="px-4 pb-3 pt-1">
      <View role="tablist" class="flex-row rounded-full bg-well p-[3px]">
        <Each of={["following", "followers"] as Kind[]}>
          {(k) => {
            const on = () => props.value === k();
            return (
              <Button
                role="tab"
                selected={on()}
                onPress={() => props.onChange(k())}
                class={`h-[34px] flex-1 items-center justify-center rounded-full ${on() ? "bg-ground shadow-[0_1px_4px_#00000014,0_0_0_0.5px_#0000000a] dark:bg-hairline" : "active:opacity-60"}`}
              >
                <Text class={`text-sm leading-[18px] ${on() ? "font-semibold text-ink" : "text-ink-2"}`}>{props.label(k())}</Text>
              </Button>
            );
          }}
        </Each>
      </View>
    </View>
  );
}

export function People(props: {
  uid: string;
  kind: Kind;
  /** The account's name and counts, from its profile: the title and the segments' numbers. */
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
  const label = (k: Kind) => {
    const n = k === "following" ? props.followingCount : props.followersCount;
    const name = t(k === "followers" ? "people.followers" : "people.following");
    return n === undefined ? name : `${name} ${count(n)}`;
  };
  const title = props.name ?? t(props.kind === "followers" ? "people.followers" : "people.following");
  return (
    <Page title={title}>
      <Segmented value={kind()} onChange={show} label={label} />
      <List
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
        class="flex-1 border-t-[0.5px] border-hairline"
      >
        {(u) => <PersonRow user={u()} />}
      </List>
    </Page>
  );
}
