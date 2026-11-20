// Who an account follows, or who follows it: a list of accounts, each opening its profile.
import { List, Text, View } from "nsh";
import { NavPage } from "nsh/base";
import { t } from "nsh/i18n";
import { people, type User } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { Header } from "../components/Header";
import { SavedNotice } from "../components/SavedNotice";
import { Avatar } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count } from "../format";
import { openProfile } from "../nav";

function PersonRow(props: { user: User }) {
  const u = () => props.user;
  return (
    <View
      role="button"
      accessibilityLabel={u().name}
      onPress={() => openProfile(u().id)}
      class="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted/60"
    >
      <Avatar user={u()} />
      <View class="flex-1 gap-0.5">
        <View class="flex-row items-center gap-1">
          <Text class="font-semibold text-foreground line-clamp-1">{u().name}</Text>
          <If when={u().verified}>
            <Text class="text-xs text-primary">✓</Text>
          </If>
        </View>
        <If when={u().description}>
          <Text class="text-sm text-muted-foreground line-clamp-1">{u().description}</Text>
        </If>
        <Text class="text-xs text-muted-foreground">
          {t("profile.followers_count", { n: count(u().followersCount ?? 0) })}
          {u().followsMe && u().following ? ` · ${t("people.mutual")}` : ""}
        </Text>
      </View>
    </View>
  );
}

export function People(props: { uid: string; kind: "following" | "followers" }) {
  const feed = createFeed<User, number>((page) => people(props.uid, props.kind, page ?? 1), {
    saveAs: () => `people:${props.kind}:${props.uid}`,
  });
  feed.more();
  const title = t(props.kind === "followers" ? "people.followers" : "people.following");
  return (
    <NavPage title={title} header={<Header title={title} />}>
      <List
        each={feed.items()}
        keyExtractor={(u) => u.id}
        estimatedItemSize={72}
        refreshing={feed.refreshing()}
        onRefresh={() => feed.refresh()}
        onLoadMore={() => feed.more()}
        header={<SavedNotice at={feed.savedAt()} failed={!!feed.error()} onRetry={() => feed.more()} />}
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
        {(u) => <PersonRow user={u()} />}
      </List>
    </NavPage>
  );
}
