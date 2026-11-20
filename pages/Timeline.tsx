// The timeline of followed accounts: pull to refresh, more as it scrolls.
import { Image, List, signal, View } from "nsh";
import { Button, NavPage } from "nsh/base";
import { t } from "nsh/i18n";
import { friendsTimeline, myUid, profile, type User } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { Header } from "../components/Header";
import { SavedNotice } from "../components/SavedNotice";
import { StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";
import { openMe } from "../nav";

// My avatar in the header: opens my own profile.
function MeButton() {
  const me = signal<User | null>(null);
  myUid()
    .then(profile)
    .then((p) => me.set(p.user), () => {});
  return (
    <Button accessibilityLabel={t("profile.me")} onPress={openMe} class="active:opacity-70">
      <View class="size-8 overflow-hidden rounded-full bg-muted">
        <If when={me()?.avatar}>{(src) => <Image src={src()} class="size-full object-cover" />}</If>
      </View>
    </Button>
  );
}

export function Timeline() {
  const feed = createFeed(friendsTimeline, { saveAs: () => "timeline" });
  feed.more();
  return (
    <NavPage
      title={t("timeline.title")}
      headerLeft={<MeButton />}
      ios={{ headerLeftSymbol: "person.crop.circle" }}
      header={<Header title={t("timeline.title")} left={<MeButton />} />}
    >
      <List
        each={feed.items()}
        keyExtractor={(s) => s.id}
        estimatedItemSize={220}
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
        {(status) => <StatusCard status={status()} />}
      </List>
    </NavPage>
  );
}
