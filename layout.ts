// The Mac window's layout: whether the sidebar shows (⌘B), and how wide the user dragged the list
// column. Both are kept on the device, so the window opens as it was left.
import { signal, Storage } from "nsh";
import { WIDE } from "./nav";

const KEY = "mac-layout";

/** The list column's width: as it starts, and the least and most a drag gives it. */
export const LIST_WIDTH = { start: 400, min: 320, max: 640 };

/** The detail column's least width: the list column's drag stops there. */
export const DETAIL_MIN = 420;

const clampList = (w: number) => Math.round(Math.min(LIST_WIDTH.max, Math.max(LIST_WIDTH.min, w)));

/** Whether the sidebar shows. */
export const sidebarShown = signal(true);

/** The list column's width. */
export const listWidth = signal(LIST_WIDTH.start);

if (WIDE) {
  Storage.getItem(KEY).then(
    (saved) => {
      if (!saved) return;
      try {
        const layout = JSON.parse(saved) as { sidebar?: unknown; list?: unknown };
        if (typeof layout.sidebar === "boolean") sidebarShown.set(layout.sidebar);
        if (typeof layout.list === "number" && Number.isFinite(layout.list)) listWidth.set(clampList(layout.list));
      } catch {
        // A layout that does not read is the first one.
      }
    },
    () => {},
  );
}

const save = () => {
  Storage.setItem(KEY, JSON.stringify({ sidebar: sidebarShown(), list: listWidth() })).catch(() => {});
};

/** Shows the sidebar, or hides it: the detail column takes its room. */
export function toggleSidebar() {
  sidebarShown.set(!sidebarShown());
  save();
}

/** Keeps the width the user dragged the list column to. */
export function setListWidth(width: number) {
  listWidth.set(clampList(width));
  save();
}
