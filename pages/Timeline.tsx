// The timeline of followed accounts: pull to refresh, more as it scrolls. My picture at the top
// right opens a menu: my profile, my favorites, sign out.
import { Image, List, signal, Text, View } from "nsh";
import { t } from "nsh/i18n";
import { friendsTimeline, myUid, profile, type User } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { GlassButton, Page } from "../components/Header";
import { PopMenu } from "../components/PopMenu";
import { SavedNotice } from "../components/SavedNotice";
import { StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";
import { openFavorites, openMe } from "../nav";
import { confirmSignOut } from "./Profile";

// My picture in the header (a "我" until it loads): opens the menu.
function MeMenu() {
  const me = signal<User | null>(null);
  myUid()
    .then(profile)
    .then((p) => me.set(p.user), () => {});
  return (
    <PopMenu
      trigger={
        <GlassButton label={t("profile.me")} size="size-10">
          <View class="size-8 items-center justify-center overflow-hidden rounded-full bg-weibo">
            <If when={me()?.avatar} else={<Text class="text-sm font-semibold text-white">{t("profile.me")}</Text>}>
              {(src) => <Image src={src()} class="size-full object-cover" />}
            </If>
          </View>
        </GlassButton>
      }
      items={[
        { label: t("menu.my_profile"), icon: "user", onSelect: openMe },
        { label: t("menu.my_favorites"), icon: "bookmark", onSelect: openFavorites },
        { label: t("menu.sign_out"), icon: "logout", danger: true, onSelect: confirmSignOut },
      ]}
    />
  );
}

export function Timeline() {
  const feed = createFeed(friendsTimeline, { saveAs: () => "timeline" });
  feed.more();
  return (
    <Page title={t("timeline.title")} large right={<MeMenu />}>
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
    </Page>
  );
}
