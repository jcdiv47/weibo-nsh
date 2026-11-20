// The timeline of followed accounts: pull to refresh, more as it scrolls.
import { List } from "nsh";
import { NavPage } from "nsh/base";
import { t } from "nsh/i18n";
import { friendsTimeline } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { Header } from "../components/Header";
import { StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";

export function Timeline() {
  const feed = createFeed(friendsTimeline);
  feed.more();
  return (
    <NavPage title={t("timeline.title")} header={<Header title={t("timeline.title")} />}>
      <List
        each={feed.items()}
        keyExtractor={(s) => s.id}
        estimatedItemSize={220}
        refreshing={feed.refreshing()}
        onRefresh={() => feed.refresh()}
        onLoadMore={() => feed.more()}
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
