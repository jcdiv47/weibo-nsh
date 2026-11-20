// The posts I saved (收藏), the latest saved first: pull to refresh, more as it scrolls. Swiping
// a post left uncovers 取消收藏, which takes it out of the list; the bookmark at the end of its
// counts takes it out too but keeps it there, empty, until the next refresh, so it can go back in.
import { createAnimatedValue, effect, type JSX, List, Text, View } from "nsh";
import { Button } from "nsh/base";
import { t } from "nsh/i18n";
import { favorite, favorites, type Status } from "../api";
import { isFavorited, toggleFavorite } from "../components/FavoriteButton";
import { FeedFooter } from "../components/FeedFooter";
import { Page } from "../components/Header";
import { Icon } from "../components/Icon";
import { SavedNotice } from "../components/SavedNotice";
import { StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";

const ACTION_WIDTH = 96;

/** A row that slides left over an action behind its right end. `id`: the item it shows; a
 * recycled row showing another closes. */
function SwipeRow(props: { id: string; action: JSX.Element; children: JSX.Element }) {
  const x = createAnimatedValue(0);
  effect(() => {
    props.id;
    x.set(0);
  });
  return (
    <View class="overflow-hidden bg-danger">
      <View class="absolute inset-y-0 right-0" style={{ width: ACTION_WIDTH }}>
        {props.action}
      </View>
      <View
        pan={{ x }}
        onPanEnd={(e) => {
          // Open past half the action's width (counting the fling), closed otherwise.
          const projected = (e.value?.x ?? 0) + e.velocity.x * 0.2;
          x.spring(projected < -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0, { velocity: e.velocity.x });
        }}
        style={{ translate: [x, 0] }}
      >
        {props.children}
      </View>
    </View>
  );
}

/** At the end of a saved post's counts: the bookmark, filled while saved; a press toggles it. */
function SavedMark(props: { status: Status }) {
  const on = () => isFavorited(props.status);
  return (
    <Button
      accessibilityLabel={t(on() ? "favorite.remove" : "favorite.add")}
      selected={on()}
      hitSlop={8}
      onPress={() => toggleFavorite(props.status)}
      class="flex-row items-center gap-1 active:opacity-60"
    >
      <Icon name={on() ? "bookmark-filled" : "bookmark"} class={`size-4 ${on() ? "tint-weibo" : "tint-ink-3"}`} />
      <Text class="text-meta leading-4 text-ink-3">{on() ? t("favorite.saved") : t("favorite.add")}</Text>
    </Button>
  );
}

function Empty() {
  return (
    <View class="flex-1 items-center justify-center gap-4 px-12 pb-24">
      <View class="size-[72px] items-center justify-center rounded-full bg-weibo-wash">
        <Icon name="bookmark" class="size-8 tint-weibo" />
      </View>
      <View class="items-center gap-1.5">
        <Text class="text-headline font-semibold text-ink">{t("favorite.empty_title")}</Text>
        <Text class="text-center text-meta text-ink-2">{t("favorite.empty_note")}</Text>
      </View>
    </View>
  );
}

export function Favorites() {
  const feed = createFeed<Status, number>((page) => favorites(page ?? 1), { saveAs: () => "favorites" });
  feed.more();

  // Out of my favorites and out of the list; back in its place if Weibo refuses.
  async function remove(s: Status) {
    const before = feed.items();
    feed.update((list) => list.filter((x) => x.id !== s.id));
    try {
      await favorite(s, false);
      s.favorited = false;
    } catch {
      feed.update(() => before);
    }
  }

  const empty = () => feed.done() && !feed.loading() && !feed.error() && !feed.items().length;
  return (
    <Page title={t("favorite.title")}>
      <If when={!empty()} else={<Empty />}>
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
          {(status) => (
            <SwipeRow
              id={status().id}
              action={
                <Button
                  accessibilityLabel={t("favorite.remove")}
                  onPress={() => remove(status())}
                  class="size-full items-center justify-center gap-1.5 active:opacity-70"
                >
                  <Icon name="bookmark-off" class="size-[22px] tint-white" />
                  <Text class="text-meta font-semibold text-white">{t("favorite.remove_short")}</Text>
                </Button>
              }
            >
              <StatusCard status={status()} trailing={<SavedMark status={status()} />} />
            </SwipeRow>
          )}
        </List>
      </If>
    </Page>
  );
}
