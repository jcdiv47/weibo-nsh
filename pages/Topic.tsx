// A topic's posts (`#name#`), as Weibo's search lists them: pull to refresh, more as it scrolls.
import { List } from "nsh";
import { type Status, topicPosts } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { Page } from "../components/Header";
import { SavedNotice } from "../components/SavedNotice";
import { StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";

export function Topic(props: { topic: string }) {
  const feed = createFeed<Status, number>((page) => topicPosts(props.topic, page ?? 1), {
    saveAs: () => `topic:${props.topic}`,
  });
  feed.more();
  const title = `#${props.topic}#`;
  return (
    <Page title={title}>
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
