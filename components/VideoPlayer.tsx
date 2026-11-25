// A post's video full screen, in the app's own player (not the platform's controls). A tap shows or
// hides the controls, which hide by themselves while it plays:
//
// - at the top, close, and at the right the post's favorite (收藏) and "⋯": save and share, the
//   menu a finger held on the video opens too (`SaveMedia.tsx`);
// - in the middle, play / pause;
// - at the bottom, the post's author and text (upright only), the time and a scrubber, then the
//   speed (0.5× to 2×), the quality (Weibo's sizes of it) and the turn to landscape.
//
// Landscape turns the player itself a quarter turn, whichever way the phone is held, as Weibo's
// own app does: the app's pages stay upright, so nothing under the player moves. Upright, a drag up
// or down (outside the controls) closes it.
//
// As the image viewer, it is an overlay over the app's pages, not a `Dialog`: a native modal
// ignores touches while it comes in and goes, so a drag to close right after opening (or a tap on
// the feed right after closing) was lost. The fades are the app's own and touches work throughout.
import { cleanup, createAnimatedValue, type JSX, createMotion, effect, Image, safeArea, signal, Text, untracked, Video, type VideoRef, View, windowSize } from "nsh";
import { MenuButton } from "nsh/base";
import { t } from "nsh/i18n";
import { BackHandler } from "nsh/mobile";
import type { Status, Video as VideoData } from "../api";
import { nav } from "../nav";
import { isFavorited, toggleFavorite } from "./FavoriteButton";
import { GlassButton } from "./Header";
import { Icon } from "./Icon";
import { MediaMenu, MediaMoreButton } from "./SaveMedia";

const shown = signal<{ video: VideoData; status?: Status } | null>(null);
/** Going away: it fades out letting touches through to the pages under it. */
const closing = signal(false);
/** The player is turned to landscape. */
const landscape = signal(false);
/** How far the video is dragged down (or up) to close it. */
const dragY = createAnimatedValue(0);
/** The whole player's opacity, 0 to 1, as it comes in and goes. */
const fade = createAnimatedValue(0);

const FADE_IN_MS = 180;
const FADE_OUT_MS = 200;
/** A drag released past this far (counting the fling) closes the player. */
const CLOSE_DISTANCE = 120;
/** The controls hide this long after the last touch, while the video plays. */
const HIDE_CONTROLS_MS = 3000;

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Opens the player on `video`; `status`, the post it is in, gives the favorite and the caption. */
export function openVideo(video: VideoData, status?: Status) {
  closing.set(false);
  landscape.set(false);
  dragY.set(0);
  // Opened again while the last one fades out: the player remounts with the new video.
  shown.set(null);
  shown.set({ video, status });
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

/** "1:05", "1:02:03". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

export const speedLabel = (rate: number) => (rate === 1 ? t("player.speed") : `${rate}×`);

/** The quality the player starts at: the one it plays now (`src`, 720p or below), else the first. */
export const startQuality = (v: VideoData) => Math.max(0, (v.qualities ?? []).findIndex((q) => q.url === v.src));

/** The position bar. Not `nsh/base`'s `Slider`: turned with the player, its thumb's drags are
 * measured along the screen, not along the turned bar. Here every touch is read where it is on the
 * bar (`locationX`, in the bar's own turned frame), so a press or a drag anywhere on it, either
 * way up, puts the position there. */
function Scrubber(props: { value: number; max: number; onChange: (v: number) => void; onEnd: (v: number) => void }) {
  const width = signal(1);
  const dragging = signal(false);
  let last = 0;
  const at = (e: { locationX: number }) => {
    last = Math.min(1, Math.max(0, e.locationX / width())) * props.max;
    return last;
  };
  const share = () => Math.min(1, Math.max(0, props.value / props.max));
  return (
    <View
      role="adjustable"
      accessibilityLabel={t("player.position")}
      class="h-8 flex-1 justify-center"
      onLayout={(e) => width.set(Math.max(1, e.bounds.size.width))}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        dragging.set(true);
        props.onChange(at(e));
      }}
      onResponderMove={(e) => props.onChange(at(e))}
      onResponderRelease={() => {
        dragging.set(false);
        props.onEnd(last);
      }}
      onResponderTerminate={() => {
        dragging.set(false);
        props.onEnd(last);
      }}
    >
      <View class="pointer-events-none h-1 w-full rounded-full bg-white/30">
        <View class="h-1 rounded-full bg-white" style={{ width: `${share() * 100}%` }} />
      </View>
      <View
        class={`pointer-events-none absolute rounded-full bg-white ${dragging() ? "size-5" : "size-3.5"}`}
        style={{ left: share() * width() - (dragging() ? 10 : 7) }}
      />
    </View>
  );
}

/** A small control of the bottom bar: a label or an icon on a dark pill. */
function Pill(props: { children: JSX.Element }) {
  return <View class="h-8 min-w-11 flex-row items-center justify-center rounded-full bg-white/15 px-3">{props.children}</View>;
}

function Player(props: { video: VideoData; status?: Status }) {
  let ref: VideoRef | undefined;
  const v = props.video;
  // A video saved on the device by an older version has no `qualities`.
  const qualities = v.qualities?.length ? v.qualities : [{ label: "MP4", url: v.src, height: 0 }];
  const quality = signal(startQuality(v));
  const paused = signal(false);
  const rate = signal(1);
  const time = signal(0);
  const duration = signal(v.duration || 0);
  /** While the scrubber is dragged: where it is, which the time shows. */
  const scrub = signal<number | null>(null);
  const buffering = signal(true);
  const ended = signal(false);
  const error = signal<string | null>(null);
  const controls = signal(true);
  /** Where to go once the source loads: after a quality switch, where the last one was. */
  let resumeAt = 0;

  // The controls hide a while after the last touch, while it plays.
  let hide: ReturnType<typeof setTimeout> | undefined;
  const poke = () => {
    controls.set(true);
    clearTimeout(hide);
    if (!paused()) hide = setTimeout(() => controls.set(false), HIDE_CONTROLS_MS);
  };
  effect(() => {
    paused();
    untracked(poke);
  });
  cleanup(() => clearTimeout(hide));

  const tap = () => (controls() ? controls.set(false) : poke());
  const togglePlay = () => {
    if (ended()) {
      ref?.seek(0);
      ended.set(false);
      paused.set(false);
    } else paused.set(!paused());
  };
  const setQuality = (i: number) => {
    if (i === quality()) return;
    // Switched again before the last one loaded: it still goes where the first switch was.
    if (!resumeAt) resumeAt = time();
    buffering.set(true);
    quality.set(i);
  };

  // Android's back button: out of landscape first, then closes it.
  BackHandler.on("press", () => {
    if (closing()) return false;
    if (landscape()) landscape.set(false);
    else close();
    return true;
  });

  const W = () => windowSize().width;
  const H = () => windowSize().height;
  // Landscape: the player is laid out as wide as the screen is tall and turned a quarter turn
  // clockwise, about its middle, which is the screen's.
  const frame = () =>
    landscape()
      ? { position: "absolute" as const, width: H(), height: W(), left: (W() - H()) / 2, top: (H() - W()) / 2, rotate: "90deg" }
      : { position: "absolute" as const, left: 0, top: 0, width: W(), height: H() };
  // The insets of the turned player: the notch is at its left, the home indicator at its right.
  const inset = () =>
    landscape()
      ? { top: 12, bottom: 12, left: Math.max(16, safeArea().top), right: Math.max(16, safeArea().bottom) }
      : { top: safeArea().top, bottom: safeArea().bottom + 8, left: 16, right: 16 };

  const status = props.status;
  const shownTime = () => scrub() ?? time();
  return (
    <View style={frame()}>
      <Video
        ref={(r) => (ref = r as VideoRef)}
        src={qualities[quality()].url}
        paused={paused()}
        rate={rate()}
        audioSession="playback"
        progressUpdateInterval={250}
        onLoad={(e) => {
          if (e.duration) duration.set(e.duration);
          error.set(null);
          if (resumeAt) ref?.seek(resumeAt);
          resumeAt = 0;
        }}
        onProgress={(e) => {
          time.set(e.currentTime);
          if (e.duration) duration.set(e.duration);
        }}
        onBuffer={(e) => buffering.set(e.isBuffering)}
        onEnd={() => {
          ended.set(true);
          paused.set(true);
        }}
        onError={(e) => error.set(e.message)}
        class="absolute inset-0"
      />
      {/* A tap anywhere shows or hides the controls. Upright, a drag up or down closes the player;
          turned, the scrubber runs along that axis, so the layer comes without the drag (a new
          view: a view keeps the pan it was made with). */}
      <If when={!landscape()} else={<View class="absolute inset-0" onPress={tap} />}>
        <View
          class="absolute inset-0"
          onPress={tap}
          pan={{ y: dragY }}
          // Sideways is the scrubber's: a drag that starts sideways stays its.
          panActivation={{ activeOffsetY: 12, failOffsetX: 12 }}
          onPanEnd={endDrag}
        >
          {/* A finger held on the video: save or share it. iOS lifts its poster beside the menu. */}
          <MediaMenu url={qualities[quality()].url} kind="video" preview={<Poster video={v} />}>
            <View class="flex-1" />
          </MediaMenu>
        </View>
      </If>
      <If when={buffering() && !error() && !paused()}>
        <View class="pointer-events-none absolute inset-0 items-center justify-center">
          <Turning />
        </View>
      </If>
      <If when={error()}>
        <View class="pointer-events-none absolute inset-0 items-center justify-center p-6">
          <Text class="text-center text-sm text-white">{t("video.error", { error: error() })}</Text>
        </View>
      </If>
      <View
        class={`absolute inset-0 transition-opacity duration-200 ${controls() ? "opacity-100" : "opacity-0"}`}
        // The style wins over the class: hidden, the bars take no touches (a tap shows them again).
        style={{ pointerEvents: controls() ? "box-none" : "none" }}
      >
        {/* Shades under the bars, so white reads over a bright frame. */}
        <View class="pointer-events-none absolute inset-x-0 top-0 h-36 bg-linear-to-b from-black/55 to-transparent" />
        <View class="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-linear-to-t from-black/70 to-transparent" />

        <View
          class="absolute inset-x-0 h-[54px] flex-row items-center justify-between"
          style={{ top: inset().top, paddingLeft: inset().left, paddingRight: inset().right }}
        >
          <GlassButton kind="media" label={t("common.close")} onPress={() => (landscape() ? landscape.set(false) : close())}>
            <Icon name={landscape() ? "chevron-left" : "x"} class="size-6 tint-white" />
          </GlassButton>
          <View class="flex-row gap-3">
            <If when={status}>
              {(s) => (
                <GlassButton
                  kind="media"
                  label={t(isFavorited(s()) ? "favorite.remove" : "favorite.add")}
                  selected={isFavorited(s())}
                  onPress={() => {
                    poke();
                    toggleFavorite(s());
                  }}
                >
                  <Icon name={isFavorited(s()) ? "bookmark-filled" : "bookmark"} class={`size-[22px] ${isFavorited(s()) ? "tint-weibo" : "tint-white"}`} />
                </GlassButton>
              )}
            </If>
            <MediaMoreButton url={qualities[quality()].url} kind="video" />
          </View>
        </View>

        <View class="absolute inset-0 items-center justify-center" style={{ pointerEvents: "box-none" }}>
          <GlassButton kind="media" size="size-16" label={t(paused() ? "player.play" : "player.pause")} onPress={() => { togglePlay(); poke(); }}>
            <Icon name={paused() ? "player-play-filled" : "player-pause-filled"} class="size-8 tint-white" />
          </GlassButton>
        </View>

        <View class="absolute inset-x-0 gap-2" style={{ bottom: inset().bottom, paddingLeft: inset().left, paddingRight: inset().right }}>
          <If when={landscape() ? undefined : status}>
            {(s) => (
              <View class="pointer-events-none gap-2 pb-2">
                <View class="flex-row items-center gap-2.5">
                  <Image src={s().user.avatar} class="size-9 rounded-full bg-white/10" />
                  <Text class="flex-1 text-headline font-semibold text-white line-clamp-1">{s().user.name}</Text>
                </View>
                <If when={s().text}>
                  <Text class="text-body leading-6 text-white/90 line-clamp-2">{s().text}</Text>
                </If>
              </View>
            )}
          </If>
          <View class="flex-row items-center gap-3">
            <Text class="w-14 text-meta tabular-nums text-white">{clock(shownTime())}</Text>
            <Scrubber
              value={Math.min(shownTime(), duration() || 0)}
              max={Math.max(1, duration())}
              onChange={(v) => {
                scrub.set(v);
                poke();
              }}
              onEnd={(to) => {
                ref?.seek(to);
                time.set(to);
                scrub.set(null);
                ended.set(false);
              }}
            />
            <Text class="w-14 text-right text-meta tabular-nums text-white/80">{clock(duration())}</Text>
          </View>
          <View class="flex-row items-center gap-2">
            <MenuButton
              accessibilityLabel={t("player.speed")}
              title={t("player.speed")}
              items={SPEEDS.map((r) => ({ id: String(r), label: r === 1 ? t("player.normal") : `${r}×`, checked: rate() === r }))}
              onSelect={(e) => {
                rate.set(Number(e.id));
                poke();
              }}
            >
              <Pill>
                <Text class="text-meta font-semibold text-white">{speedLabel(rate())}</Text>
              </Pill>
            </MenuButton>
            <If when={qualities.length > 1} else={<Pill><Text class="text-meta font-semibold text-white">{qualities[0].label}</Text></Pill>}>
              <MenuButton
                accessibilityLabel={t("player.quality")}
                title={t("player.quality")}
                items={qualities.map((q, i) => ({ id: String(i), label: q.label, checked: quality() === i }))}
                onSelect={(e) => {
                  setQuality(Number(e.id));
                  poke();
                }}
              >
                <Pill>
                  <Text class="text-meta font-semibold text-white">{qualities[quality()].label}</Text>
                </Pill>
              </MenuButton>
            </If>
            <View class="flex-1" />
            <GlassButton
              kind="media"
              size="size-10"
              label={t(landscape() ? "player.portrait" : "player.landscape")}
              selected={landscape()}
              onPress={() => {
                landscape.set(!landscape());
                poke();
              }}
            >
              <Icon name="device-mobile-rotated" class="size-[22px] tint-white" />
            </GlassButton>
          </View>
        </View>
      </View>
    </View>
  );
}

/** What iOS lifts beside the video's menu: its poster, at the video's shape. */
function Poster(props: { video: VideoData }) {
  const width = () => Math.min(windowSize().width - 32, props.video.portrait ? 270 : 400);
  const height = () => Math.round(width() * (props.video.portrait ? 16 / 9 : 9 / 16));
  return <Image src={props.video.poster} class="bg-black object-cover" style={{ width: width(), height: height() }} />;
}

/** The buffering ring. */
function Turning() {
  const motion = createMotion();
  motion.play("spin");
  return <View style={motion.style} class="size-9 rounded-full border-[3px] border-white/25 border-t-white" />;
}

export function VideoPlayer() {
  const height = () => windowSize().height;
  // A page opening under the player (the favorite toast's "View") closes it.
  let routes = nav.routes().length;
  effect(() => {
    const n = nav.routes().length;
    if (n !== routes && untracked(shown)) close();
    routes = n;
  });
  return (
    <If when={shown()}>
      {(v) => (
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
            class="flex-1"
            style={{
              translate: [0, dragY],
              scale: dragY.interpolate({ inputRange: [-height(), 0, height()], outputRange: [0.75, 1, 0.75] }),
            }}
          >
            <Player video={v().video} status={v().status} />
          </View>
        </View>
      )}
    </If>
  );
}
