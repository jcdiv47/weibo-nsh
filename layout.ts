// The Mac window's layout: whether the sidebar (⌘B) and the post column (⇧⌘B) show, and how wide
// the user dragged the list column. They are kept on the device, so the window opens as it was
// left.
//
// The post column comes and goes at the window's right edge: showing it widens the window by the
// column, hiding it narrows the window by as much, so the list keeps its width either way.
import { effect, platform, signal, Storage } from "nsh";
import type { WindowRef } from "nsh/desktop";

/** The Mac's window of columns, instead of one stack: macOS's own host (not Mac Catalyst). */
export const WIDE = platform.os === "macos";

const KEY = "mac-layout";

/** The list column's width: as it starts, and the least and most a drag gives it. */
export const LIST_WIDTH = { start: 400, min: 320, max: 640 };

/** The detail column's least width: the list column's drag stops there. */
export const DETAIL_MIN = 420;

/** The sidebar's width. */
export const SIDEBAR_WIDTH = 220;

const clampList = (w: number) => Math.round(Math.min(LIST_WIDTH.max, Math.max(LIST_WIDTH.min, w)));

/** Whether the sidebar shows. */
export const sidebarShown = signal(true);

/** Whether the post column shows; without it the list takes the window's width. */
export const detailShown = signal(true);

/** The list column's width. */
export const listWidth = signal(LIST_WIDTH.start);

/** The post column's width while it shows, and what showing it again gives back. */
let detailWidth = 560;

if (WIDE) {
  Storage.getItem(KEY).then(
    (saved) => {
      if (!saved) return;
      try {
        const layout = JSON.parse(saved) as { sidebar?: unknown; detail?: unknown; list?: unknown; detailWidth?: unknown };
        if (typeof layout.sidebar === "boolean") sidebarShown.set(layout.sidebar);
        if (typeof layout.detail === "boolean") detailShown.set(layout.detail);
        if (typeof layout.list === "number" && Number.isFinite(layout.list)) listWidth.set(clampList(layout.list));
        if (typeof layout.detailWidth === "number" && Number.isFinite(layout.detailWidth))
          detailWidth = Math.max(DETAIL_MIN, Math.round(layout.detailWidth));
      } catch {
        // A layout that does not read is the first one.
      }
    },
    () => {},
  );
}

const save = () => {
  Storage.setItem(KEY, JSON.stringify({ sidebar: sidebarShown(), detail: detailShown(), list: listWidth(), detailWidth })).catch(() => {});
};

/** Shows the sidebar, or hides it: the detail column takes its room. */
export function toggleSidebar() {
  sidebarShown.set(!sidebarShown());
  save();
}

/** The main window, which the post column widens and narrows. */
let win: WindowRef | undefined;

/** Gives the layout the main window (`App`, on the Mac): its least width follows the columns that
 * show, and the post column resizes it. */
export function attachWindow(window: WindowRef) {
  win = window;
  effect(() => {
    const width = (sidebarShown() ? SIDEBAR_WIDTH : 0) + LIST_WIDTH.min + (detailShown() ? DETAIL_MIN : 0);
    window.set({ minSize: { width, height: 560 } });
  });
}

/**
 * Widens the window by `dx` points (narrows it, for less than 0), its left edge where it is, but
 * kept on its display: past the display's right edge the window moves left. False when the window
 * is not in its normal mode (full screen, maximized) or did not tell its bounds: its width stays,
 * and the columns share it.
 */
function widen(dx: number): boolean {
  const state = win?.state();
  if (!win || !state || state.mode !== "normal") return false;
  const { origin, size } = state.bounds;
  let width = size.width + dx;
  let x = origin.x;
  const area = state.display?.visibleBounds;
  if (area) {
    width = Math.min(width, area.size.width);
    const right = area.origin.x + area.size.width;
    if (x + width > right) x = Math.max(area.origin.x, right - width);
  }
  win.setBounds({ origin: { x }, size: { width } });
  return true;
}

/** Shows the post column or hides it, at the window's right edge. */
function setDetail(shown: boolean) {
  if (detailShown() === shown) return;
  if (shown) {
    // The window widens first, so the column does not take its room from the list.
    widen(detailWidth);
    detailShown.set(true);
  } else {
    const content = win?.state()?.contentBounds.size.width;
    if (content) {
      const sidebar = sidebarShown() ? SIDEBAR_WIDTH : 0;
      detailWidth = Math.max(DETAIL_MIN, Math.round(content - sidebar - listWidth()));
    }
    detailShown.set(false);
    widen(-detailWidth);
  }
  save();
}

/** Shows the post column, or hides it. */
export const toggleDetail = () => setDetail(!detailShown());

/** Shows the post column if it is hidden: a post opened while it was. */
export const showDetail = () => setDetail(true);

/** Keeps the width the user dragged the list column to. */
export function setListWidth(width: number) {
  listWidth.set(clampList(width));
  save();
}
