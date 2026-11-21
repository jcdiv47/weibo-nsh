// A post's pictures full screen: swipe between them, pinch or double tap to zoom, drag to pan
// when zoomed, tap or drag up or down to close. One viewer for the app, opened with `openViewer`.
import { createAnimatedValue, Image, Scroll, type ScrollRef, safeArea, signal, Text, View, windowSize } from "nsh";
import { Dialog } from "nsh/base";
import type { Status } from "../api";

type Pics = Status["pics"];

const shown = signal<{ pics: Pics; index: number } | null>(null);
const page = signal(0);
/** The picture shown is zoomed in: a drag pans it rather than closing the viewer. */
const zoomed = signal(false);
/** How far the pictures are dragged down (or up) to close them. */
const dragY = createAnimatedValue(0);

export function openViewer(pics: Pics, index: number) {
  if (!pics.length) return;
  page.set(index);
  zoomed.set(false);
  dragY.set(0);
  shown.set({ pics, index });
}

const close = () => shown.set(null);

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
  close();
  dragY.timing(Math.sign(projected) * windowSize().height, { duration: 220 });
}

/** One picture, zoomable on its own: zoom resets as it scrolls out of the pager and back. */
function ZoomPage(props: { src: string }) {
  let scroll: ScrollRef | undefined;
  let zoom = 1;
  // Not zoomed, it must not bounce: a vertical drag then goes to the viewer, to close it.
  const zoomedIn = signal(false);
  let lastTap = 0;
  let pending: number | undefined;
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
          pending = setTimeout(close, DOUBLE_TAP_MS);
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
    <Dialog
      open={!!shown()}
      animation="fade"
      presentation="fullScreen"
      statusBar={{ hidden: true, animated: true }}
      closeOnSwipe
      onOpenChange={(e) => !e.open && close()}
      class="flex-1"
    >
      <If when={shown()}>
        {(v) => (
          <View class="flex-1">
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
        )}
      </If>
    </Dialog>
  );
}
