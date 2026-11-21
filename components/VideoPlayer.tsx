// A post's video full screen, playing with the platform's controls: drag it up or down, or press
// the close button, to close it. One player for the app, opened with `openVideo`.
//
// As the image viewer, it is an overlay over the app's pages, not a `Dialog`: a native modal
// ignores touches while it comes in and goes, so a drag to close right after opening (or a tap on
// the feed right after closing) was lost. The fades are the app's own and touches work throughout.
import { createAnimatedValue, safeArea, signal, Text, Video, View, windowSize } from "nsh";
import { t } from "nsh/i18n";
import { BackHandler } from "nsh/mobile";
import type { Video as VideoData } from "../api";
import { Icon } from "./Icon";

const shown = signal<VideoData | null>(null);
/** Going away: it fades out letting touches through to the pages under it. */
const closing = signal(false);
const error = signal<string | null>(null);
/** How far the video is dragged down (or up) to close it. */
const dragY = createAnimatedValue(0);
/** The whole player's opacity, 0 to 1, as it comes in and goes. */
const fade = createAnimatedValue(0);

const FADE_IN_MS = 180;
const FADE_OUT_MS = 200;
/** A drag released past this far (counting the fling) closes the player. */
const CLOSE_DISTANCE = 120;

export function openVideo(video: VideoData) {
  closing.set(false);
  error.set(null);
  dragY.set(0);
  // Opened again while the last one fades out: the player remounts with the new video.
  shown.set(null);
  shown.set(video);
  fade.timing(1, { duration: FADE_IN_MS });
}

/** Fades the player out; `away` also carries the video off screen that way (a drag's fling).
 * Unmounting the video at the end stops it. */
function close(away = 0) {
  if (!shown() || closing()) return;
  closing.set(true);
  if (away) dragY.timing(Math.sign(away) * windowSize().height, { duration: FADE_OUT_MS + 20 });
  fade.timing(0, { duration: FADE_OUT_MS }).then(({ finished }) => {
    // Not finished: opened again meanwhile, which stopped this fade.
    if (finished && closing()) {
      shown.set(null);
      closing.set(false);
    }
  });
}

/** Released: past `CLOSE_DISTANCE` the video carries on off screen and the player closes; short of
 * it, it springs back. */
function endDrag(e: { value?: { y?: number }; velocity: { y: number } }) {
  const projected = (e.value?.y ?? 0) + e.velocity.y * 0.2;
  if (Math.abs(projected) < CLOSE_DISTANCE) {
    dragY.spring(0, { velocity: e.velocity.y });
    return;
  }
  close(projected);
}

export function VideoPlayer() {
  const height = () => windowSize().height;
  return (
    <If when={shown()}>
      {(v) => {
        // Android's back button closes it, as it closed the dialog it was.
        BackHandler.on("press", () => {
          if (closing()) return false;
          close();
          return true;
        });
        return (
          <View
            role="dialog"
            class={`absolute inset-0 ${closing() ? "pointer-events-none" : ""}`}
            style={{ opacity: fade }}
          >
            {/* The black behind the video fades as it is dragged away. */}
            <View
              class="pointer-events-none absolute inset-0 bg-black"
              style={{
                opacity: dragY.interpolate({ inputRange: [-height() / 2, 0, height() / 2], outputRange: [0.3, 1, 0.3] }),
              }}
            />
            <View
              pan={{ y: dragY }}
              // Sideways is the controls' scrubber: a drag that starts sideways stays theirs.
              panActivation={{ activeOffsetY: 12, failOffsetX: 12 }}
              onPanEnd={endDrag}
              class="flex-1"
              style={{
                paddingTop: safeArea().top,
                paddingBottom: safeArea().bottom,
                translate: [0, dragY],
                scale: dragY.interpolate({ inputRange: [-height(), 0, height()], outputRange: [0.75, 1, 0.75] }),
              }}
            >
              <Video
                src={v().src}
                controls
                audioSession="playback"
                onError={(e) => error.set(e.message)}
                class="flex-1"
              />
            </View>
            <If when={error()}>
              <View class="pointer-events-none absolute inset-0 items-center justify-center p-6">
                <Text class="text-center text-sm text-white">{t("video.error", { error: error() })}</Text>
              </View>
            </If>
            <View
              role="button"
              accessibilityLabel={t("common.close")}
              onPress={() => close()}
              style={{ top: safeArea().top + 8 }}
              class="absolute left-4 size-9 items-center justify-center rounded-full bg-white/15 active:opacity-60"
            >
              <Icon name="x" class="size-5 tint-white" />
            </View>
          </View>
        );
      }}
    </If>
  );
}
