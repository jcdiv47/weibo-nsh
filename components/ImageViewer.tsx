// A post's pictures full screen: swipe between them, pinch or double tap to zoom, drag to pan
// when zoomed, tap or drag up or down to close. A finger held on a picture, or the "⋯" button at the
// top right, opens what it offers: save it (to Photos on iOS) and share it (`SaveMedia.tsx`).
// One viewer for the app, opened with `openViewer`.
// Its full screen layer, the fades and the drag that closes it, is `MediaOverlay.tsx`'s.
import { batch, cleanup, Image, Scroll, type ScrollRef, safeArea, signal, Text, View, windowSize } from "nsh";
import type { Status } from "../api";
import { glass } from "./Glass";
import { createMediaOverlay } from "./MediaOverlay";
import { MediaMenu, MediaMoreButton } from "./SaveMedia";

type Pics = Status["pics"];

const { open, close, Overlay } = createMediaOverlay<{ pics: Pics; index: number }>();
const page = signal(0);
/** The picture shown is zoomed in: a drag pans it rather than closing the viewer. */
const zoomed = signal(false);

export function openViewer(pics: Pics, index: number) {
  if (!pics.length) return;
  page.set(index);
  zoomed.set(false);
  // Opened again while the last one fades out: the pager remounts at the new picture.
  open({ pics, index });
}

const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 280;

/** What iOS lifts beside the menu: the picture at its own shape, as wide as the screen allows. */
function Preview(props: { src: string; size: { width: number; height: number } | null }) {
  const box = () => {
    const s = props.size;
    const maxW = windowSize().width - 32;
    const maxH = windowSize().height * 0.6;
    if (!s || !s.width || !s.height) return { width: maxW, height: maxW };
    const scale = Math.min(maxW / s.width, maxH / s.height);
    return { width: Math.round(s.width * scale), height: Math.round(s.height * scale) };
  };
  return <Image src={props.src} class="object-cover" style={box()} />;
}

/** One picture, zoomable on its own: zoom resets as it scrolls out of the pager and back. */
function ZoomPage(props: { src: string }) {
  /** The picture's own size, once loaded: the menu's preview takes its shape. */
  const natural = signal<{ width: number; height: number } | null>(null);
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
        // Read here, not back from the signal: a batch's writes apply at its end.
        const z = zoom > 1.01;
        batch(() => {
          zoomedIn.set(z);
          zoomed.set(z);
        });
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
        <MediaMenu url={props.src} kind="image" preview={<Preview src={props.src} size={natural()} />}>
          <Image src={props.src} class="size-full object-contain" onLoad={(e) => natural.set(e.size)} />
        </MediaMenu>
      </View>
    </Scroll>
  );
}

export function ImageViewer() {
  return (
    <Overlay
      drag={!zoomed()}
      over={(v) => (
        <>
          <If when={v().pics.length > 1}>
            <View class="pointer-events-none absolute inset-x-0 h-11 items-center justify-center" style={{ top: safeArea().top + 4 }}>
              <View class={`rounded-full px-3 py-1 ${glass("media").class}`} style={glass("media").style}>
                <Text class="text-sm font-medium text-white">
                  {`${Math.min(page(), v().pics.length - 1) + 1} / ${v().pics.length}`}
                </Text>
              </View>
            </View>
          </If>
          <View class="absolute right-4 h-11 flex-row items-center" style={{ top: safeArea().top + 4 }}>
            <MediaMoreButton url={v().pics[Math.min(page(), v().pics.length - 1)].large} kind="image" />
          </View>
        </>
      )}
    >
      {(v) => (
        <Scroll
          horizontal
          pagingEnabled
          scrollbar={false}
          contentOffset={{ x: v().index * windowSize().width, y: 0 }}
          onMomentumEnd={(e) =>
            batch(() => {
              page.set(Math.round(e.offset.x / Math.max(1, windowSize().width)));
              zoomed.set(false);
            })
          }
          class="flex-1"
        >
          <Each of={v().pics} key="index">
            {(pic) => <ZoomPage src={pic().large} />}
          </Each>
        </Scroll>
      )}
    </Overlay>
  );
}
