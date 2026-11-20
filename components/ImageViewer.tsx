// A post's pictures full screen: swipe between them, pinch or double tap to zoom, drag to pan
// when zoomed, tap to close. One viewer for the app, opened with `openViewer`.
import { Image, Scroll, type ScrollRef, safeArea, signal, Text, View, windowSize } from "nsh";
import { Button, Dialog } from "nsh/base";
import { t } from "nsh/i18n";
import type { Status } from "../api";
import { Icon } from "./Icon";

type Pics = Status["pics"];

const shown = signal<{ pics: Pics; index: number } | null>(null);
const page = signal(0);

export function openViewer(pics: Pics, index: number) {
  if (!pics.length) return;
  page.set(index);
  shown.set({ pics, index });
}

const close = () => shown.set(null);

const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 280;

/** One picture, zoomable on its own: zoom resets as it scrolls out of the pager and back. */
function ZoomPage(props: { src: string }) {
  let scroll: ScrollRef | undefined;
  let zoom = 1;
  let lastTap = 0;
  let pending: number | undefined;
  return (
    <Scroll
      ref={(r) => (scroll = r as ScrollRef)}
      minimumZoomScale={1}
      maximumZoomScale={MAX_ZOOM}
      centerContent
      scrollbar={false}
      onScroll={(e) => (zoom = e.zoomScale)}
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
  return (
    <Dialog
      open={!!shown()}
      animation="fade"
      presentation="fullScreen"
      statusBar={{ hidden: true, animated: true }}
      closeOnSwipe
      onOpenChange={(e) => !e.open && close()}
      class="flex-1 bg-black"
    >
      <If when={shown()}>
        {(v) => (
          <View class="flex-1">
            <Scroll
              horizontal
              pagingEnabled
              scrollbar={false}
              contentOffset={{ x: v().index * windowSize().width, y: 0 }}
              onMomentumEnd={(e) => page.set(Math.round(e.offset.x / Math.max(1, windowSize().width)))}
              class="flex-1"
            >
              <Each of={v().pics} key="index">
                {(pic) => <ZoomPage src={pic().large} />}
              </Each>
            </Scroll>
            <Button
              accessibilityLabel={t("common.close")}
              onPress={close}
              hitSlop={8}
              class="absolute left-4 size-9 items-center justify-center rounded-full bg-black/50 active:opacity-60"
              style={{ top: safeArea().top + 8 }}
            >
              <Icon name="x" class="size-5 tint-white" />
            </Button>
            <If when={v().pics.length > 1}>
              <View class="pointer-events-none absolute inset-x-0 items-center" style={{ top: safeArea().top + 12 }}>
                <Text class="rounded-full bg-black/50 px-3 py-1 text-sm text-white">
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
