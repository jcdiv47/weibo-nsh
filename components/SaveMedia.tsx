// What a picture or video offers: save it and share it, in one menu. A finger held on the picture or
// video opens it (`MediaMenu`: the system's context menu on iOS, the picture lifting as in Photos;
// Android's popup menu), and so does the "⋯" button over the viewers (`MediaMoreButton`). Then the
// hidden web view that downloads (see `download.ts`) and a toast over the viewers: "Saving…" while
// the file comes, then "Saved to Photos", or why it failed.
//
// Save and share differ: save puts the file into Photos (iOS), share opens the system's share sheet
// (WeChat, X, Messages...). Android has no save of its own (it could only open the share sheet as
// well), so there the menu only shares.
import { createMotion, type JSX, safeArea, signal, Text, View, type ViewRef, WebView, type WebViewRef } from "nsh";
import { ContextMenu, MenuButton, type MenuButtonItem } from "nsh/base";
import { t } from "nsh/i18n";
import { type Anchor, CAN_SAVE, downloader, hostPage, job, prefetch, saveMedia, shareMedia } from "../download";
import { GLASS_PRESS, glass } from "./Glass";
import { Icon } from "./Icon";

type Kind = "image" | "video";

/** What is being saved or shared, until the file is where it goes or the share sheet is open: one
 * at a time. The "⋯" button turns meanwhile. */
const saving = signal<{ url: string; share: boolean } | null>(null);
const toast = signal<{ text: string; tone: "busy" | "done" | "error" } | null>(null);
let hide: ReturnType<typeof setTimeout> | undefined;

function say(text: string, tone: "busy" | "done" | "error" = "done") {
  clearTimeout(hide);
  toast.set({ text, tone });
  // "Saving…" stays until the save ends.
  if (tone !== "busy") hide = setTimeout(() => toast.set(null), 3000);
}

/** Saves the picture or video at `url`, or with `share` shares it, saying how it went. A share
 * sheet points at `anchor`. */
export async function save(url: string, kind: Kind, share = false, anchor?: Anchor) {
  if (!url || saving()) return;
  const mine = { url, share };
  saving.set(mine);
  // A share's sheet is its answer; a save says it is under way (a video takes a while).
  if (!share) say(t("save.saving"), "busy");
  // The share sheet opening ends the wait: no turning button or "Saving…" over it.
  const onSheet = () => {
    if (saving() === mine) saving.set(null);
    if (toast()?.tone === "busy") toast.set(null);
  };
  try {
    const { outcome } = await (share ? shareMedia(url, kind, anchor, onSheet) : saveMedia(url, kind));
    if (outcome === "photos") say(t("save.saved_photos"));
  } catch (e) {
    const error = e as { code?: string; message?: string };
    if (error?.code === "EACCES") say(t("save.denied"), "error");
    else say(t(share ? "save.share_failed" : "save.failed", { error: String(error?.message ?? e) }), "error");
  } finally {
    if (saving() === mine) saving.set(null);
  }
}

/** The menu's items (SF Symbols on iOS): save where it does something sharing does not, and share. */
const items = (): MenuButtonItem[] => [
  ...(CAN_SAVE ? [{ id: "save", label: t("save.to_photos"), icon: "square.and.arrow.down", disabled: !!saving() }] : []),
  { id: "share", label: t("save.share_ellipsis"), icon: "square.and.arrow.up", disabled: !!saving() },
];

function choose(id: string, url: string, kind: Kind, anchor: Anchor) {
  if (id === "save" || id === "share") save(url, kind, id === "share", anchor);
}

/** A finger held on `children` (a picture, a video) opens the menu: the system's, on iOS and
 * Android. `preview` is what iOS lifts beside the menu (the picture at its own shape), else
 * `children` lifts. It fills what it is in, as its trigger does: left to its content's size it would
 * be none, and the picture in it would not show. */
export function MediaMenu(props: { url: string; kind: Kind; children: JSX.Element; preview?: JSX.Element }) {
  let view: ViewRef | undefined;
  return (
    <ContextMenu
      class="flex-1 self-stretch"
      items={items()}
      preview={props.preview}
      // Opened: the user is about to save or share it, so a picture's file starts coming now (into
      // the app's own storage; nothing is saved until a choice), and the share sheet opens as the
      // menu goes rather than after a wait. Not a video's: tens of MB fetched for a menu that may
      // close without a choice.
      onOpen={() => props.kind === "image" && prefetch(props.url, props.kind)}
      onSelect={(e) => choose(e.id, props.url, props.kind, () => view)}
      trigger={
        <View ref={(r) => (view = r as ViewRef)} class="flex-1 self-stretch">
          {props.children}
        </View>
      }
    />
  );
}

/** The "⋯" glass button over a viewer: the same menu, from a tap. Turns while a save runs. */
export function MediaMoreButton(props: { url: string; kind: Kind }) {
  let view: ViewRef | undefined;
  const look = glass("media");
  return (
    <View ref={(r) => (view = r as ViewRef)}>
      <MenuButton
        accessibilityLabel={t("save.more")}
        items={items()}
        disabled={!!saving()}
        onSelect={(e) => choose(e.id, props.url, props.kind, () => view)}
        class={`size-11 items-center justify-center rounded-full ${GLASS_PRESS} ${look.class}`}
        style={look.style}
      >
        <If when={saving()} else={<Icon name="dots" class="size-6 tint-white" />}>
          <Turning />
        </If>
      </MenuButton>
    </View>
  );
}

function Turning() {
  const motion = createMotion();
  motion.play("spin");
  return <View style={motion.style} class="size-5 rounded-full border-2 border-white/30 border-t-white" />;
}

/** The toast: over everything, the viewers included. One for the app. */
export function SaveToast() {
  return (
    <If when={toast()}>
      {(m) => (
        <View
          role="alert"
          class={`pointer-events-none absolute inset-x-4 min-h-[52px] flex-row items-center gap-2.5 rounded-full px-4 py-2 ${glass("toast").class}`}
          style={{ ...glass("toast").style, bottom: safeArea().bottom + 14 }}
        >
          <If
            when={m().tone === "busy"}
            else={
              <Icon
                name={m().tone === "error" ? "alert-triangle" : "circle-check-filled"}
                class={`size-5 ${m().tone === "error" ? "tint-white" : "tint-weibo"}`}
              />
            }
          >
            <Turning />
          </If>
          <Text class="flex-1 text-body leading-5 font-medium text-white">{m().text}</Text>
        </View>
      )}
    </If>
  );
}

/** The hidden web view that downloads, there while a download is under way: a new one for each, on
 * the file's host. One for the app. */
export function Downloader() {
  return (
    <If when={job()}>
      {(j) => {
        let web: WebViewRef | undefined;
        return (
          <View class="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0">
            <WebView
              ref={(r) => (web = r as WebViewRef)}
              src={hostPage(j().url)}
              class="flex-1"
              onLoad={() => downloader.onLoad((script) => web?.injectJavaScript(script))}
              onMessage={(e) => downloader.onMessage(e.data)}
              onDownload={(d) => downloader.onDownload(d)}
              onError={(e) => downloader.onError(e.message)}
            />
          </View>
        );
      }}
    </If>
  );
}
