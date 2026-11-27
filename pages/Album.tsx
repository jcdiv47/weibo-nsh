// An account's album: every picture and video of their own posts, newest first, under a heading
// per month, three to a row, edge to edge. A picture opens the viewer, which swipes through all
// the album's pictures loaded so far; a video opens the player.
import { computed, effect, List, Text, untracked, View } from "nsh";
import { t } from "nsh/i18n";
import { type AlbumItem, type AlbumRow, ALBUM_COLUMNS, albumOf, albumRows } from "../album";
import { type Status, userPosts } from "../api";
import { AlbumTile } from "../components/AlbumTile";
import { FeedFooter } from "../components/FeedFooter";
import { createPageScroll, Page } from "../components/Header";
import { openViewer } from "../components/ImageViewer";
import { SavedNotice } from "../components/SavedNotice";
import { openVideo } from "../components/VideoPlayer";
import { createFeed } from "../feed";
import { monthLabel, relativeTime } from "../format";
import { refreshed } from "../haptics";

/** Items to have before the list waits for a scroll: a screen and more. */
const FILL = 30;
/** Pages of posts read in a row to reach `FILL`, at most: posts may carry no pictures for long. */
const MAX_PAGES_PER_FILL = 6;

export function Album(props: { uid: string }) {
  // The profile's posts, read and saved as the profile reads them: the album opens on them.
  const posts = createFeed<Status, number>((page) => userPosts(props.uid, page ?? 1), {
    saveAs: () => `posts:${props.uid}`,
  });
  const items = computed(() => albumOf(posts.items()));
  const rows = computed(() => albumRows(items()));

  // A page of posts may hold few pictures, or none: keep reading until there are `target`
  // items (or the posts end), and again after each scroll to the end.
  let target = FILL;
  let pages = 0;
  effect(() => {
    if (posts.loading() || posts.done() || posts.error()) return;
    if (items().length >= target || pages >= MAX_PAGES_PER_FILL) return;
    pages++;
    untracked(() => posts.more());
  });
  const fill = () => {
    target = items().length + FILL;
    pages = 0;
    posts.more();
  };

  const open = (item: AlbumItem) => {
    if (item.video) return openVideo(item.video, item.status);
    const pics = items().filter((i) => i.pic);
    openViewer(
      pics.map((i) => i.pic!),
      pics.findIndex((i) => i.id === item.id),
    );
  };

  const scroll = createPageScroll({ refreshing: () => posts.refreshing() });
  return (
    <Page title={t("album.title")} scroll={scroll}>
      <List
        {...scroll.list()}
        each={rows()}
        keyExtractor={(r) => r.id}
        estimatedItemSize={130}
        refreshing={posts.refreshing()}
        onRefresh={() => {
          target = FILL;
          pages = 0;
          refreshed(posts.refresh());
        }}
        onLoadMore={fill}
        header={<SavedNotice at={posts.savedAt()} failed={!!posts.error()} onRetry={() => posts.more()} />}
        footer={
          <FeedFooter
            loading={posts.loading()}
            error={posts.error()}
            done={posts.done()}
            empty={!items().length}
            onRetry={() => posts.more()}
          />
        }
        class="flex-1"
      >
        {(row) => <Row row={row()} onOpen={open} />}
      </List>
    </Page>
  );
}

/** A month's heading, or a row of tiles; a short row keeps its tiles a third of the width. */
function Row(props: { row: AlbumRow; onOpen: (item: AlbumItem) => void }) {
  return (
    <If
      when={props.row.items}
      else={
        <View class="px-4 pb-2 pt-3">
          <Text role="header" class="text-meta font-semibold text-ink">
            {props.row.month ? monthLabel(props.row.month.year, props.row.month.month) : ""}
          </Text>
        </View>
      }
    >
      {(tiles) => (
        <View class="flex-row gap-0.5 pb-0.5">
          {/* The cell takes a third of the row, the tile in it its width and as much height. */}
          <Each of={Array.from({ length: ALBUM_COLUMNS }, (_, i) => i)}>
            {(c) => (
              <View class="flex-1">
                <If when={tiles()[c()]}>
                  {(item) => (
                    <View
                      role="button"
                      accessibilityLabel={
                        item().video
                          ? t("album.video", { title: item().video!.title, when: relativeTime(item().status.createdAt) })
                          : t("album.picture", { when: relativeTime(item().status.createdAt) })
                      }
                      onPress={() => props.onOpen(item())}
                      class="active:opacity-80"
                    >
                      <AlbumTile item={item()} class="aspect-square w-full" />
                    </View>
                  )}
                </If>
              </View>
            )}
          </Each>
        </View>
      )}
    </If>
  );
}
