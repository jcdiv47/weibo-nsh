// A post's pictures full screen: swipe between them, pinch or double tap to zoom, drag to pan
// when zoomed, tap or drag up or down to close. One viewer for the app, opened with `openViewer`.
//
// It is an overlay over the app's pages, not a `Dialog`: a native modal ignores touches while it
// comes in and goes, so a drag to close right after opening (or a tap on the feed right after
// closing) was lost. Here the fades are the app's own and touches work throughout them.
import { cleanup, createAnimatedValue, Image, Scroll, type ScrollRef, safeArea, signal, Text, View, windowSize } from "nsh";
import { BackHandler } from "nsh/mobile";
import type { Status } from "../api";

type Pics = Status["pics"];

const shown = signal<{ pics: Pics; index: number } | null>(null);
/** Going away: it fades out letting touches through to the pages under it. */
const closing = signal(false);
const page = signal(0);
/** The picture shown is zoomed in: a drag pans it rather than closing the viewer. */
const zoomed = signal(false);
/** How far the pictures are dragged down (or up) to close them. */
const dragY = createAnimatedValue(0);
/** The whole viewer's opacity, 0 to 1, as it comes in and goes. */
const fade = createAnimatedValue(0);

const FADE_IN_MS = 180;
const FADE_OUT_MS = 200;

export function openViewer(pics: Pics, index: number) {
  if (!pics.length) return;
  page.set(index);
  zoomed.set(false);
  closing.set(false);
  dragY.set(0);
  // Opened again while the last one fades out: the pager remounts at the new picture.
  shown.set(null);
  shown.set({ pics, index });
  fade.timing(1, { duration: FADE_IN_MS });
}

/** Fades the viewer out; `away` also carries the pictures off screen that way (a drag's fling). */
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

const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 280;
/** A drag released past this far (counting the fling) closes the viewer. */
const CLOSE_DISTANCE = 120;

/** Released: past `CLOSE_DISTANCE` the pictures carry on off screen and the viewer closes; short
 * of it they spring back. */
function endDrag(e: { value?: { y?: number }; velocity: { y: number } }) {
  const projected = (e.value?.y ?? 0) + e.velocity.y * 0.2;
  if (Math.abs(projected) < CLOSE_DISTANCE) {
    dragY.spring(0, { velocity: e.velocity.y });
    return;
  }
  close(projected);
}

/** One picture, zoomable on its own: zoom resets as it scrolls out of the pager and back. */
function ZoomPage(props: { src: string }) {
  let scroll: ScrollRef | undefined;
  let zoom = 1;
  // Not zoomed, it must not bounce: a vertical drag then goes to the viewer, to close it.
  const zoomedIn = signal(false);
  let lastTap = 0;
  let pending: number | undefined;
  // A tap's close still pending as the viewer goes must not close the next one opened.
  cleanup(() => clearTimeout(pending));
  return (
    <Scroll
      ref={(r) => (scroll = r as ScrollRef)}
      minimumZoomScale={1}
      maximumZoomScale={MAX_ZOOM}
      centerContent
      scrollbar={false}
      bounces={zoomedIn()}
      onScroll={(e) => {
        zoom = e.zoomScale;
        zoomedIn.set(zoom > 1.01);
        zoomed.set(zoomedIn());
      }}
      style={{ width: windowSize().width, height: windowSize().height }}
    >
      <View
        onPress={(e) => {
          const now = Date.now();
          if (now - lastTap < DOUBLE_TAP_MS) {
            // Double tap: zoom in on the tapped point, or back out.
            clearTimeout(pending);
            lastTap = 0;
            if (zoom > 1.05) scroll?.zoomTo({ scale: 1 });
            else scroll?.zoomTo({ scale: 2.5, x: e.position.x, y: e.position.y });
            return;
          }
          lastTap = now;
          pending = setTimeout(() => close(), DOUBLE_TAP_MS);
        }}
        style={{ width: windowSize().width, height: windowSize().height }}
      >
        <Image src={props.src} class="size-full object-contain" />
      </View>
    </Scroll>
  );
}

export function ImageViewer() {
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
            {/* The black behind the pictures fades as they are dragged away. */}
            <View
              class="pointer-events-none absolute inset-0 bg-black"
              style={{
                opacity: dragY.interpolate({ inputRange: [-height() / 2, 0, height() / 2], outputRange: [0.3, 1, 0.3] }),
              }}
            />
            <View
              pan={zoomed() ? undefined : { y: dragY }}
              panActivation={{ activeOffsetY: 12, failOffsetX: 12 }}
              onPanEnd={endDrag}
              class="flex-1"
              style={{
                translate: [0, dragY],
                scale: dragY.interpolate({ inputRange: [-height(), 0, height()], outputRange: [0.75, 1, 0.75] }),
              }}
            >
              <Scroll
                horizontal
                pagingEnabled
                scrollbar={false}
                contentOffset={{ x: v().index * windowSize().width, y: 0 }}
                onMomentumEnd={(e) => {
                  page.set(Math.round(e.offset.x / Math.max(1, windowSize().width)));
                  zoomed.set(false);
                }}
                class="flex-1"
              >
                <Each of={v().pics} key="index">
                  {(pic) => <ZoomPage src={pic().large} />}
                </Each>
              </Scroll>
            </View>
            <If when={v().pics.length > 1}>
              <View class="pointer-events-none absolute inset-x-0 h-11 items-center justify-center" style={{ top: safeArea().top + 4 }}>
                <Text class="rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-white">
                  {`${Math.min(page(), v().pics.length - 1) + 1} / ${v().pics.length}`}
                </Text>
              </View>
            </If>
          </View>
        );
      }}
    </If>
  );
}
