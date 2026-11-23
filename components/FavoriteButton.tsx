// Saving a post to my favorites (收藏), or taking it out: a bookmark, filled while it is saved.
// Saving one says so in a toast at the bottom, with a way to my favorites.
import { safeArea, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { t } from "nsh/i18n";
import { favorite, type Status } from "../api";
import { nav, openFavorites, WIDE } from "../nav";
import { glass } from "./Glass";
import { GlassButton } from "./Header";
import { Icon } from "./Icon";

// Posts saved or taken out here, by id. The lists hold plain objects, a recycled row shows another
// post, and the same post shows on several pages (the timeline, its own page, my favorites): each
// reads the post's state from here first.
const changes = signal<Record<string, boolean>>({});
const pending = new Set<string>();

export const isFavorited = (s: Status) => changes()[s.id] ?? s.favorited;

/** Saves the post, or takes it out, at once; if Weibo refuses, as it was. */
export async function toggleFavorite(s: Status) {
  if (pending.has(s.id)) return;
  const was = isFavorited(s);
  const show = (v: boolean) => changes.update((m) => ({ ...m, [s.id]: v }));
  show(!was);
  pending.add(s.id);
  try {
    await favorite(s, !was);
    s.favorited = !was;
    if (!was) showSavedToast();
  } catch {
    show(was);
  } finally {
    pending.delete(s.id);
  }
}

/** The post page's header button. */
export function FavoriteButton(props: { status: Status }) {
  const on = () => isFavorited(props.status);
  return (
    <GlassButton label={t(on() ? "favorite.remove" : "favorite.add")} selected={on()} onPress={() => toggleFavorite(props.status)}>
      <Icon name={on() ? "bookmark-filled" : "bookmark"} class={`size-[22px] ${on() ? "tint-weibo" : "tint-ink"}`} />
    </GlassButton>
  );
}

const toast = signal(0);
let hide: ReturnType<typeof setTimeout> | undefined;

function showSavedToast() {
  clearTimeout(hide);
  toast.update((n) => n + 1);
  hide = setTimeout(() => toast.set(0), 3000);
}

/** "已收藏 · 查看收藏", for three seconds after a post is saved. One for the app. */
export function SavedToast() {
  return (
    <If when={toast()}>
      <View
        role="alert"
        class={`absolute ${WIDE ? "right-6 w-[340px]" : "inset-x-4"} h-[52px] flex-row items-center gap-2.5 rounded-full pl-4 pr-2 ${glass("toast").class}`}
        style={{ ...glass("toast").style, bottom: safeArea().bottom + 14 }}
      >
        <Icon name="bookmark-filled" class="size-5 tint-weibo" />
        <Text class="flex-1 text-body leading-5 font-medium text-white">{t("favorite.saved")}</Text>
        <If when={nav.routes().at(-1)?.name !== "favorites"}>
          <Button
            onPress={() => {
              toast.set(0);
              openFavorites();
            }}
            class="h-9 justify-center rounded-full bg-white/12 px-3.5 active:opacity-70"
          >
            <Text class="text-meta font-semibold text-white">{t("favorite.view")}</Text>
          </Button>
        </If>
      </View>
    </If>
  );
}
