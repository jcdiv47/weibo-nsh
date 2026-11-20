// A post's video full screen, playing with the platform's controls. One player for the app,
// opened with `openVideo`.
import { signal, Text, Video, View } from "nsh";
import { Dialog } from "nsh/base";
import { t } from "nsh/i18n";
import type { Video as VideoData } from "../api";

const shown = signal<VideoData | null>(null);

// A copy: opening the same video again must change the signal, or it would not open.
export const openVideo = (video: VideoData) => shown.set({ ...video });
const close = () => shown.set(null);

export function VideoPlayer() {
  const error = signal<string | null>(null);
  return (
    <Dialog
      open={!!shown()}
      animation="fade"
      presentation="fullScreen"
      statusBar={{ hidden: true, animated: true }}
      onOpenChange={(e) => !e.open && close()}
      // The player's own close button (the system controls') dismisses the dialog natively, with no
      // `onOpenChange`: `onClose` hears every way it goes, so the state follows.
      onClose={() => {
        error.set(null);
        close();
      }}
      class="flex-1 bg-black"
    >
      <If when={shown()}>
        {(v) => (
          <View class="flex-1">
            <Video
              src={v().src}
              controls
              audioSession="playback"
              onError={(e) => error.set(e.message)}
              class="flex-1"
            />
            <If when={error()}>
              <View class="pointer-events-none absolute inset-0 items-center justify-center p-6">
                <Text class="text-center text-sm text-white">{t("video.error", { error: error() })}</Text>
              </View>
            </If>
          </View>
        )}
      </If>
    </Dialog>
  );
}
