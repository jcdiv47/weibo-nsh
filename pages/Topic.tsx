// A topic's posts (`#name#`), as Weibo's search lists them: pull to refresh, more as it scrolls.
import { List } from "nsh";
import { NavPage } from "nsh/base";
import { type Status, topicPosts } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { Header } from "../components/Header";
import { StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";

export function Topic(props: { topic: string }) {
  const feed = createFeed<Status, number>((page) => topicPosts(props.topic, page ?? 1));
  feed.more();
  const title = `#${props.topic}#`;
  return (
    <NavPage title={title} header={<Header title={title} />}>
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
