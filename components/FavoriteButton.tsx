// Saving a post to my favorites (收藏), or taking it out: a bookmark, filled while it is saved.
import { signal } from "nsh";
import { Button } from "nsh/base";
import { t } from "nsh/i18n";
import { favorite, type Status } from "../api";
import { Icon } from "./Icon";
import { LINK_TINT } from "./RichText";

// Posts saved or taken out here, by id. The lists hold plain objects, a recycled row shows another
// post, and the same post shows on several pages (the timeline, its own page, my favorites): each
// reads the post's state from here first.
const changes = signal<Record<string, boolean>>({});
const pending = new Set<string>();

export const isFavorited = (s: Status) => changes()[s.id] ?? s.favorited;

/** Saves the post, or takes it out, at once; if Weibo refuses, as it was. */
async function toggle(s: Status) {
  if (pending.has(s.id)) return;
  const was = isFavorited(s);
  const show = (v: boolean) => changes.update((m) => ({ ...m, [s.id]: v }));
  show(!was);
  pending.add(s.id);
  try {
    await favorite(s, !was);
    s.favorited = !was;
  } catch {
    show(was);
  } finally {
    pending.delete(s.id);
  }
}

export function FavoriteButton(props: { status: Status; class?: string }) {
  const on = () => isFavorited(props.status);
  return (
    <Button
      accessibilityLabel={t(on() ? "favorite.remove" : "favorite.add")}
      selected={on()}
      hitSlop={8}
      onPress={() => toggle(props.status)}
      class={`active:opacity-60 ${props.class ?? ""}`}
    >
      <Icon name={on() ? "bookmark-filled" : "bookmark"} class={`size-4 ${on() ? LINK_TINT : "tint-muted-foreground"}`} />
    </Button>
  );
}
