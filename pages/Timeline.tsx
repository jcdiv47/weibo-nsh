// The timeline of followed accounts: pull to refresh, more as it scrolls, new posts counted on the
// button at its bottom (`news.ts`). At the top right, search,
// and my picture, which opens a menu: my profile, my favorites, sign out.
import { Image, List, signal, Text, View } from "nsh";
import { t } from "nsh/i18n";
import { friendsTimeline, myUid, newerPosts, profile, type User } from "../api";
import { confirmSignOut } from "../components/account";
import { FeedFooter } from "../components/FeedFooter";
import { createPageScroll, GlassButton, LargeTitle, Page } from "../components/Header";
import { PopMenu } from "../components/PopMenu";
import { SavedNotice } from "../components/SavedNotice";
import { StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";
import { Icon } from "../components/Icon";
import { nav, openFavorites, openMe, openSearch } from "../nav";
import { createNews, mayCheck } from "../news";
import { pulled } from "../haptics";

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
            <If when={me()?.avatar} else={<Text class="text-sm font-semibold text-primary-foreground">{t("profile.me")}</Text>}>
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
  // New posts are looked for while the timeline is the page shown (`news.ts`).
  const news = createNews(feed, newerPosts, () => mayCheck() && nav.routes().length === 1);
  const scroll = createPageScroll({
    large: true,
    refreshing: () => feed.refreshing(),
    refresh: () => feed.refresh(),
    news,
  });
  return (
    <Page
      title={t("timeline.title")}
      scroll={scroll}
      right={
        <View class="flex-row items-center gap-2.5">
          <GlassButton label={t("search.title")} onPress={openSearch} size="size-10">
            <Icon name="search" class="size-[22px] tint-ink" />
          </GlassButton>
          <MeMenu />
        </View>
      }
    >
      <List
        {...scroll.list()}
        each={feed.items()}
        keyExtractor={(s) => s.id}
        estimatedItemSize={220}
        refreshing={feed.refreshing()}
        onRefresh={() => {
          pulled();
          feed.refresh();
        }}
        onLoadMore={() => feed.more()}
        header={
          <View>
            <LargeTitle title={t("timeline.title")} />
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
        {(status) => <StatusCard status={status()} />}
      </List>
    </Page>
  );
}
