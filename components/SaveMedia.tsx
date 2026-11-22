// The viewers' "save" and "share" buttons (a picture, a video), the hidden web view that downloads (see
// `download.ts`) and what it says when done: a toast over the viewers, "Saved to Downloads" on the
// desktops, why it failed everywhere. On a phone the share sheet is the confirmation: it shows
// "Save Image" / "Save Video" and the system says the rest.
import { createMotion, safeArea, signal, Text, View, WebView, type WebViewRef } from "nsh";
import { t } from "nsh/i18n";
import { Share } from "nsh";
import { downloader, hostPage, job, saveMedia, shareMedia } from "../download";
import { glass } from "./Glass";
import { GlassButton } from "./Header";
import { Icon } from "./Icon";

/** What is being saved or shared: one at a time. */
const saving = signal<{ url: string; share: boolean } | null>(null);
/** The platform has a share sheet (not Linux). */
const canShare = signal(false);
Share.available().then(canShare.set, () => {});
const toast = signal<{ text: string; error: boolean } | null>(null);
let hide: ReturnType<typeof setTimeout> | undefined;

function say(text: string, error = false) {
  clearTimeout(hide);
  toast.set({ text, error });
  hide = setTimeout(() => toast.set(null), 3000);
}

/** Saves the picture or video at `url`, or with `share` shares it, saying how it went. */
export async function save(url: string, kind: "image" | "video", share = false) {
  if (!url || saving()) return;
  saving.set({ url, share });
  try {
    const { outcome } = await (share ? shareMedia(url, kind) : saveMedia(url, kind));
    if (outcome === "downloads") say(t("save.saved_downloads"));
  } catch (e) {
    say(t(share ? "save.share_failed" : "save.failed", { error: String((e as Error)?.message ?? e) }), true);
  } finally {
    saving.set(null);
  }
}

function Turning() {
  const motion = createMotion();
  motion.play("spin");
  return <View style={motion.style} class="size-5 rounded-full border-2 border-white/30 border-t-white" />;
}

/** A round glass button over a picture or video: a download arrow, turning while it saves. */
export function SaveButton(props: { url: string; kind: "image" | "video"; size?: string }) {
  return (
    <GlassButton
      kind="media"
      size={props.size}
      label={t("save.label")}
      onPress={saving() ? undefined : () => save(props.url, props.kind)}
    >
      <If when={saving() && !saving()!.share} else={<Icon name="download" class="size-6 tint-white" />}>
        <Turning />
      </If>
    </GlassButton>
  );
}

/** As `SaveButton`, sharing to another app (WeChat, X...): only where there is a share sheet. */
export function ShareButton(props: { url: string; kind: "image" | "video"; size?: string }) {
  return (
    <If when={canShare()}>
      <GlassButton
        kind="media"
        size={props.size}
        label={t("save.share")}
        onPress={saving() ? undefined : () => save(props.url, props.kind, true)}
      >
        <If when={saving()?.share} else={<Icon name="share" class="size-6 tint-white" />}>
          <Turning />
        </If>
      </GlassButton>
    </If>
  );
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
          <Icon name={m().error ? "alert-triangle" : "circle-check-filled"} class={`size-5 ${m().error ? "tint-white" : "tint-weibo"}`} />
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
