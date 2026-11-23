// Search within one account's posts, from the magnifier on their profile: a field under the status
// bar, and under it the posts of theirs that hold what was searched, newest first. Changing the
// field and searching again searches anew on the same page; 取消 returns to the profile.
import { type InputRef, List, signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { t } from "nsh/i18n";
import { searchUserPosts, type Status } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { createPageScroll, Page } from "../components/Header";
import { Icon } from "../components/Icon";
import { StatusCard } from "../components/StatusCard";
import { createFeed, type Feed } from "../feed";
import { SearchBar } from "./Search";

export function ProfileSearch(props: { uid: string; name?: string }) {
  const text = signal("");
  let input: InputRef | undefined;
  const typed = () => text().trim();
  /** The search shown, and its posts; none until the first search. */
  const results = signal<{ q: string; feed: Feed<Status, number> } | null>(null);
  const submit = () => {
    const q = typed();
    if (!q || q === results()?.q) return;
    const feed = createFeed<Status, number>((page) => searchUserPosts(props.uid, q, page ?? 1));
    results.set({ q, feed });
    feed.more();
  };
  const feed = () => results()?.feed;
  const scroll = createPageScroll({ refreshing: () => !!feed()?.refreshing() });
  return (
    <Page
      title={t("search.profile_title")}
      scroll={scroll}
      bar={
        <SearchBar>
          <Input
            ref={(r) => (input = r)}
            value={text()}
            onChange={(e) => text.set(e.value)}
            onSubmit={submit}
            placeholder={props.name ? t("search.profile_placeholder", { name: props.name }) : t("search.profile_placeholder_any")}
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
        when={feed()}
        else={
          <View class="items-center gap-3 px-10" style={{ paddingTop: scroll.inset() + 48 }}>
            <View class="size-12 items-center justify-center rounded-full bg-well">
              <Icon name="search" class="size-6 tint-ink-3" />
            </View>
            <Text class="text-center text-sm leading-5 text-ink-2">
              {t("search.profile_hint")}
            </Text>
          </View>
        }
      >
        {(f) => (
          <List
            {...scroll.list()}
            each={f().items()}
            keyExtractor={(s) => s.id}
            estimatedItemSize={220}
            keyboardDismissMode="on-drag"
            refreshing={f().refreshing()}
            onRefresh={() => f().refresh()}
            onLoadMore={() => f().more()}
            footer={
              <FeedFooter
                loading={f().loading()}
                error={f().error()}
                done={f().done()}
                empty={!f().items().length}
                onRetry={() => f().more()}
              />
            }
            class="flex-1"
          >
            {(status) => <StatusCard status={status()} />}
          </List>
        )}
      </If>
    </Page>
  );
}
