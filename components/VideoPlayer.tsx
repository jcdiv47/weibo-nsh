// A post's video full screen, with the app's own controls in glass: close and mute at the top,
// back 10 s / play-pause / forward 10 s in the middle, the speed and a scrubber at the bottom, as
// iOS's full-screen player lays them out. A tap shows or hides them; while it plays they hide by
// themselves. Drag it up or down, or press close, to close it. One player for the app, opened with
// `openVideo`.
//
// The controls are the app's (the platform's are off) so the player opens as it should look, the
// same on every platform: NSH gives no way to open iOS's own full-screen player.
//
// As the image viewer, it is an overlay over the app's pages, not a `Dialog`: a native modal
// ignores touches while it comes in and goes, so a drag to close right after opening (or a tap on
// the feed right after closing) was lost. The fades are the app's own and touches work throughout.
import { cleanup, createAnimatedValue, type JSX, safeArea, signal, Text, Video, type VideoRef, View, windowSize } from "nsh";
import { Button, Slider } from "nsh/base";
import { t } from "nsh/i18n";
import { BackHandler } from "nsh/mobile";
import type { Video as VideoData } from "../api";
import { clock } from "../format";
import { GLASS_PRESS, glass } from "./Glass";
import { BAR, GlassButton } from "./Header";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";

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
/** While it plays, the controls hide this long after the last touch. */
const HIDE_AFTER_MS = 3000;
/** What a press on the speed steps through. */
const RATES = [1, 1.25, 1.5, 2, 0.5, 0.75];
const SKIP = 10;

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

/** A round glass control over the video: white on the media glass. */
function Round(props: { label: string; size: string; onPress: () => void; children: JSX.Element }) {
  return (
    <Button
      accessibilityLabel={props.label}
      onPress={props.onPress}
      class={`${props.size} items-center justify-center rounded-full ${GLASS_PRESS} ${glass("media").class}`}
      style={glass("media").style}
    >
      {props.children}
    </Button>
  );
}

/** One video playing, with its controls; made again for each video opened. */
function Player(props: { video: VideoData }) {
  let ref: VideoRef | undefined;
  const paused = signal(false);
  const muted = signal(false);
  const rate = signal(1);
  const buffering = signal(true);
  const time = signal(0);
  const duration = signal(props.video.duration);
  /** Where the scrubber is held, while it is. */
  const scrub = signal<number | null>(null);
  const controls = signal(true);

  // While it plays, the controls hide a while after the last touch.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poke = () => {
    controls.set(true);
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!paused() && scrub() === null) controls.set(false);
    }, HIDE_AFTER_MS);
  };
  poke();
  cleanup(() => clearTimeout(timer));

  const seek = (to: number) => {
    const s = Math.min(Math.max(0, to), duration() || to);
    ref?.seek(s);
    time.set(s);
  };
  const playPause = () => {
    // At the end it rewound already (`onEnd`): playing starts it again.
    paused.update((p) => !p);
    poke();
  };
  const shownTime = () => scrub() ?? time();
  const hidden = () => (controls() ? "" : "pointer-events-none opacity-0");
  /** A row's own space lets a tap through to the video, which shows or hides the controls; hidden,
   * its buttons do too. */
  const through = () => (controls() ? "box-none" : "none") as "box-none" | "none";

  return (
    <View
      pan={{ y: dragY }}
      // Sideways is the scrubber's: a drag that starts sideways stays its.
      panActivation={{ activeOffsetY: 12, failOffsetX: 12 }}
      onPanEnd={endDrag}
      onPress={() => (controls() ? controls.set(false) : poke())}
      class="flex-1"
      style={{
        translate: [0, dragY],
        scale: dragY.interpolate({ inputRange: [-windowSize().height, 0, windowSize().height], outputRange: [0.75, 1, 0.75] }),
      }}
    >
      <View class="flex-1" style={{ paddingTop: safeArea().top, paddingBottom: safeArea().bottom }}>
        <Video
          ref={(r) => (ref = r)}
          src={props.video.src}
          paused={paused()}
          muted={muted()}
          rate={rate()}
          audioSession="playback"
          onLoad={(e) => {
            if (e.duration) duration.set(e.duration);
            buffering.set(false);
          }}
          onBuffer={(e) => buffering.set(e.isBuffering)}
          onProgress={(e) => {
            if (scrub() === null) time.set(e.currentTime);
            if (e.duration) duration.set(e.duration);
          }}
          onEnd={() => {
            // Rewound while it stands still: a seek made as it starts to play again would land
            // after it had run into the end once more.
            paused.set(true);
            ref?.seek(0);
            time.set(0);
            controls.set(true);
            clearTimeout(timer);
          }}
          onError={(e) => error.set(e.message)}
          class="flex-1"
        />
      </View>

      {/* Close and mute, where a page's back button and action are. */}
      <View
        class={`absolute inset-x-0 h-[54px] flex-row items-center justify-between px-4 transition-opacity duration-200 ${hidden()}`}
        style={{ top: safeArea().top }}
      >
        <GlassButton kind="media" label={t("common.close")} onPress={() => close()}>
          <Icon name="x" class="size-6 tint-white" />
        </GlassButton>
        <GlassButton
          kind="media"
          label={t(muted() ? "video.unmute" : "video.mute")}
          onPress={() => {
            muted.update((m) => !m);
            poke();
          }}
        >
          <Icon name={muted() ? "volume-off" : "volume"} class="size-6 tint-white" />
        </GlassButton>
      </View>

      {/* Back 10 s, play or pause (a spinner while it waits), forward 10 s. */}
      <View
        class={`absolute inset-x-0 flex-row items-center justify-center gap-9 transition-opacity duration-200 ${hidden()}`}
        style={{ top: safeArea().top + BAR, bottom: safeArea().bottom + 96, pointerEvents: through() }}
      >
        <Round label={t("video.back", { n: SKIP })} size="size-14" onPress={() => (seek(time() - SKIP), poke())}>
          <Icon name="rewind-backward-10" class="size-7 tint-white" />
        </Round>
        <Round label={t(paused() ? "video.play" : "video.pause")} size="size-[76px]" onPress={playPause}>
          <If
            when={buffering() && !paused()}
            else={<Icon name={paused() ? "player-play-filled" : "player-pause-filled"} class="size-9 tint-white" />}
          >
            <Spinner />
          </If>
        </Round>
        <Round label={t("video.forward", { n: SKIP })} size="size-14" onPress={() => (seek(time() + SKIP), poke())}>
          <Icon name="rewind-forward-10" class="size-7 tint-white" />
        </Round>
      </View>

      {/* The speed, and the scrubber with the time played and the time left. */}
      <View
        class={`absolute inset-x-4 items-end gap-3 transition-opacity duration-200 ${hidden()}`}
        style={{ bottom: safeArea().bottom + 8, pointerEvents: through() }}
      >
        <Button
          accessibilityLabel={t("video.speed")}
          onPress={() => {
            rate.update((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length]);
            poke();
          }}
          class={`h-11 min-w-11 items-center justify-center rounded-full px-3 ${GLASS_PRESS} ${glass("media").class}`}
          style={glass("media").style}
        >
          <Text class="text-sm font-semibold text-white">{`${rate()}×`}</Text>
        </Button>
        <View
          class={`h-14 w-full flex-row items-center gap-3 rounded-full px-5 ${glass("media").class}`}
          style={glass("media").style}
        >
          <Text class="min-w-9 text-xs font-medium text-white/80">{clock(shownTime())}</Text>
          <Slider
            accessibilityLabel={t("video.position")}
            value={shownTime()}
            min={0}
            max={Math.max(1, duration())}
            step={0}
            onChange={(e) => {
              scrub.set(e.value as number);
              controls.set(true);
            }}
            onChangeEnd={(e) => {
              seek(e.value as number);
              scrub.set(null);
              poke();
            }}
            class="flex-1"
            trackClass="h-8 justify-center"
            indicatorClass="h-1.5 rounded-full bg-white/30"
            rangeClass="rounded-full bg-white"
            thumbClass="size-3.5 rounded-full bg-white"
          />
          <Text class="min-w-9 text-right text-xs font-medium text-white/80">{`-${clock(duration() - shownTime())}`}</Text>
        </View>
      </View>
    </View>
  );
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
            <Player video={v()} />
            <If when={error()}>
              <View class="pointer-events-none absolute inset-0 items-center justify-center p-6">
                <Text class="text-center text-sm text-white">{t("video.error", { error: error() })}</Text>
              </View>
            </If>
          </View>
        );
      }}
    </If>
  );
}
