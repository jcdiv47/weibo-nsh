// The app's one material for what floats over content: the header's buttons and capsules, the
// drop-down menu, the toast. Each asks `glass(kind)` for its look and keeps its own shape (size,
// radius, padding, placement), which is the same on every platform.
//
// Where the system draws Liquid Glass (iOS 26 and later) a surface is the system's glass: no fill
// of its own and no drop shadow, both of which the glass draws. Everywhere else (earlier iOS and
// Android) it is the design's frosted surface: a translucent fill from `theme.json`, a blur of what
// is behind it, a hairline and a soft shadow. The two read as one design; only the material
// differs.
import { platform, token, type ViewStyle } from "nsh";

/** Liquid Glass is drawn natively here. */
export const NATIVE_GLASS = platform.os === "ios" && Number.parseFloat(platform.version) >= 26;

export type GlassKind =
  /** A button or capsule of the header (`GlassButton`): clear over the page. */
  | "control"
  /** A menu's card (`PopMenu`): more opaque, for the rows' legibility. */
  | "menu"
  /** The toast (`SavedToast`): dark in either appearance, white text on it. */
  | "toast"
  /** Over pictures and video (the viewers' close button and counter): dark-tinted, white on it,
   * legible over any picture. */
  | "media";

/** The frosted surfaces where the system draws no glass. */
const FROSTED: Record<GlassKind, string> = {
  control:
    "bg-glass backdrop-blur-xl shadow-[0_0_0_0.5px_#0000001a,0_4px_14px_#0000000f] dark:shadow-[0_0_0_0.5px_#ffffff1f,0_4px_14px_#00000040]",
  menu: "bg-menu backdrop-blur-xl shadow-[0_0_0_0.5px_#0000001a,0_12px_40px_#00000026] dark:shadow-[0_0_0_0.5px_#ffffff1f,0_12px_40px_#00000026]",
  toast: "bg-toast backdrop-blur-xl shadow-[0_12px_32px_#00000033]",
  media: "bg-white/15 backdrop-blur-xl",
};

/** The tint of the system's glass, by kind: `null` is the system's own, which follows the
 * appearance. */
const TINT: Record<GlassKind, (() => string) | null> = {
  control: null,
  menu: null,
  toast: () => token("toast-glass"),
  media: () => token("media-glass"),
};

/** The look of a floating surface: its classes, and the native glass's style where it is drawn.
 * A tint is a theme token, which follows the appearance where `glass` is read in a view's props. */
export function glass(kind: GlassKind): { class: string; style?: ViewStyle } {
  if (!NATIVE_GLASS) return { class: FROSTED[kind] };
  const tint = TINT[kind];
  return {
    // The blur is what `glassEffect` falls back to, should the system not draw it.
    class: "backdrop-blur-xl",
    style: { glassEffect: "regular", ...(tint ? { glassTintColor: tint() } : {}) },
  };
}

/** A press on a glass surface: a slight shrink on the system's glass, which looks wrong at a
 * lower opacity (UIKit's effect views do); the frosted surface dims as before. */
export const GLASS_PRESS = NATIVE_GLASS ? "transition-transform duration-150 active:scale-95" : "active:opacity-70";
