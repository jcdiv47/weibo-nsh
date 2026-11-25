// The full screen layer of the picture viewer and the video player: it fades in over the app's
// pages, and a drag up or down carries its media away (shrinking it and thinning the black behind
// it) and closes it, or springs it back when the drag was short. Android's back button closes it.
//
// It is an overlay over the app's pages, not a `Dialog`: a native modal ignores touches while it
// comes in and goes, so a drag to close right after opening (or a tap on the feed right after
// closing) was lost. Here the fades are the app's own and touches work throughout them.
import { batch, createAnimatedValue, type JSX, signal, View, windowSize } from "nsh";
import { BackHandler } from "nsh/mobile";

const FADE_IN_MS = 180;
const FADE_OUT_MS = 200;
/** A drag released past this far (counting the fling) closes the overlay. */
const CLOSE_DISTANCE = 120;

/** One overlay for the app, showing a `T` while open (the pictures, the video and its post). */
export function createMediaOverlay<T>() {
  const shown = signal<T | null>(null);
  /** Going away: it fades out letting touches through to the pages under it. */
  const closing = signal(false);
  /** How far the media are dragged down (or up) to close them. */
  const dragY = createAnimatedValue(0);
  /** The whole overlay's opacity, 0 to 1, as it comes in and goes. */
  const fade = createAnimatedValue(0);

  function open(value: T) {
    closing.set(false);
    dragY.set(0);
    // Opened again while the last one fades out: what it shows remounts with the new value.
    shown.set(null);
    shown.set(value);
    fade.timing(1, { duration: FADE_IN_MS });
  }

  /** Fades the overlay out; `away` also carries the media off screen that way (a drag's fling).
   * What it shows unmounts at the end. */
  function close(away = 0) {
    if (!shown() || closing()) return;
    closing.set(true);
    if (away) dragY.timing(Math.sign(away) * windowSize().height, { duration: FADE_OUT_MS + 20 });
    fade.timing(0, { duration: FADE_OUT_MS }).then(({ finished }) => {
      // Not finished: opened again meanwhile, which stopped this fade.
      if (finished && closing()) {
        batch(() => {
          shown.set(null);
          closing.set(false);
        });
      }
    });
  }

  /** A drag released: past `CLOSE_DISTANCE` the media carry on off screen and the overlay closes;
   * short of it they spring back. */
  function endDrag(e: { value?: { y?: number }; velocity: { y: number } }) {
    const projected = (e.value?.y ?? 0) + e.velocity.y * 0.2;
    if (Math.abs(projected) < CLOSE_DISTANCE) {
      dragY.spring(0, { velocity: e.velocity.y });
      return;
    }
    close(projected);
  }

  /**
   * The overlay while it shows something. `children` is the media, in the layer that moves with
   * the drag; `over` stays put above it (a counter, buttons). `drag`: given, the moving layer itself
   * takes the vertical drag while it is true (the pictures, while not zoomed); left out, it takes
   * none (the player takes it on a layer of its own). `onBack`: what Android's back button does,
   * closing it by default.
   */
  function Overlay(props: {
    drag?: boolean;
    onBack?: () => void;
    children: (value: () => NonNullable<T>) => JSX.Element;
    over?: (value: () => NonNullable<T>) => JSX.Element;
  }) {
    const height = () => windowSize().height;
    return (
      <If when={shown()}>
        {(v) => {
          BackHandler.on("press", () => {
            if (closing()) return false;
            if (props.onBack) props.onBack();
            else close();
            return true;
          });
          return (
            <View
              role="dialog"
              class={`absolute inset-0 ${closing() ? "pointer-events-none" : ""}`}
              style={{ opacity: fade }}
            >
              {/* The black behind the media fades as they are dragged away. */}
              <View
                class="pointer-events-none absolute inset-0 bg-black"
                style={{
                  opacity: dragY.interpolate({ inputRange: [-height() / 2, 0, height() / 2], outputRange: [0.3, 1, 0.3] }),
                }}
              />
              <View
                pan={props.drag ? { y: dragY } : undefined}
                panActivation={props.drag === undefined ? undefined : { activeOffsetY: 12, failOffsetX: 12 }}
                onPanEnd={props.drag === undefined ? undefined : endDrag}
                class="flex-1"
                style={{
                  translate: [0, dragY],
                  scale: dragY.interpolate({ inputRange: [-height(), 0, height()], outputRange: [0.75, 1, 0.75] }),
                }}
              >
                {props.children(v)}
              </View>
              {props.over?.(v)}
            </View>
          );
        }}
      </If>
    );
  }

  return { shown, closing, dragY, open, close, endDrag, Overlay };
}
