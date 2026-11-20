// A post's video full screen, playing with the platform's controls. One player for the app,
// opened with `openVideo`.
import { safeArea, signal, Text, Video, View } from "nsh";
import { Dialog } from "nsh/base";
import type { Video as VideoData } from "../api";

const shown = signal<VideoData | null>(null);

export const openVideo = (video: VideoData) => shown.set(video);
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
      onClose={() => error.set(null)}
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
                <Text class="text-center text-sm text-white">Can't play this video: {error()}</Text>
              </View>
            </If>
            <View
              role="button"
              accessibilityLabel="Close"
              onPress={close}
              style={{ top: safeArea().top + 8 }}
              class="absolute left-4 size-9 items-center justify-center rounded-full bg-black/50 active:opacity-60"
            >
              <Text class="text-lg text-white">✕</Text>
            </View>
          </View>
        )}
      </If>
    </Dialog>
  );
}
