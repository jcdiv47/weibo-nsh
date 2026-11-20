// The posts I saved (收藏), the latest saved first: pull to refresh, more as it scrolls. A post
// taken out here stays until the next refresh, its bookmark empty, so it can go back in.
import { List } from "nsh";
import { NavPage } from "nsh/base";
import { t } from "nsh/i18n";
import { favorites, type Status } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { Header } from "../components/Header";
import { SavedNotice } from "../components/SavedNotice";
import { StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";

export function Favorites() {
  const feed = createFeed<Status, number>((page) => favorites(page ?? 1), { saveAs: () => "favorites" });
  feed.more();
  return (
    <NavPage title={t("favorite.title")} header={<Header title={t("favorite.title")} />}>
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
