// Icons from Tabler Icons (https://tabler.io/icons, MIT, `icons/LICENSE`): the SVGs the app uses,
// copied from `@tabler/icons` 3.52.0. They draw in `currentColor`, which an image has none of:
// give each a `tint-*` class (and a `size-*`), or it draws black.
import { Image } from "nsh";
import alertTriangle from "../icons/alert-triangle.svg";
import arrowsLeftRight from "../icons/arrows-left-right.svg";
import at from "../icons/at.svg";
import ban from "../icons/ban.svg";
import bookmarkFilled from "../icons/bookmark-filled.svg";
import bookmark from "../icons/bookmark.svg";
import chevronDown from "../icons/chevron-down.svg";
import chevronLeft from "../icons/chevron-left.svg";
import chevronRight from "../icons/chevron-right.svg";
import chevronUp from "../icons/chevron-up.svg";
import circleCheckFilled from "../icons/circle-check-filled.svg";
import cloudDownload from "../icons/cloud-download.svg";
import cloudOff from "../icons/cloud-off.svg";
import deviceMobileRotated from "../icons/device-mobile-rotated.svg";
import dots from "../icons/dots.svg";
import download from "../icons/download.svg";
import hash from "../icons/hash.svg";
import history from "../icons/history.svg";
import link from "../icons/link.svg";
import lock from "../icons/lock.svg";
import logout from "../icons/logout.svg";
import mapPin from "../icons/map-pin.svg";
import messageCircle from "../icons/message-circle.svg";
import pencil from "../icons/pencil.svg";
import pinnedFilled from "../icons/pinned-filled.svg";
import playerPlayFilled from "../icons/player-play-filled.svg";
import playerPauseFilled from "../icons/player-pause-filled.svg";
import playerPlay from "../icons/player-play.svg";
import refresh from "../icons/refresh.svg";
import repeat from "../icons/repeat.svg";
import send from "../icons/send.svg";
import share from "../icons/share.svg";
import thumbUpFilled from "../icons/thumb-up-filled.svg";
import thumbUp from "../icons/thumb-up.svg";
import userCheck from "../icons/user-check.svg";
import userMinus from "../icons/user-minus.svg";
import userPlus from "../icons/user-plus.svg";
import user from "../icons/user.svg";
import x from "../icons/x.svg";

const ICONS = {
  "alert-triangle": alertTriangle,
  "arrows-left-right": arrowsLeftRight,
  at,
  ban,
  bookmark,
  "bookmark-filled": bookmarkFilled,
  "chevron-down": chevronDown,
  "chevron-left": chevronLeft,
  "chevron-right": chevronRight,
  "chevron-up": chevronUp,
  "circle-check-filled": circleCheckFilled,
  "cloud-download": cloudDownload,
  "cloud-off": cloudOff,
  "device-mobile-rotated": deviceMobileRotated,
  dots,
  download,
  hash,
  history,
  link,
  lock,
  logout,
  "map-pin": mapPin,
  "message-circle": messageCircle,
  pencil,
  "pinned-filled": pinnedFilled,
  "player-pause-filled": playerPauseFilled,
  "player-play": playerPlay,
  "player-play-filled": playerPlayFilled,
  refresh,
  repeat,
  send,
  share,
  "thumb-up": thumbUp,
  "thumb-up-filled": thumbUpFilled,
  user,
  "user-check": userCheck,
  "user-minus": userMinus,
  "user-plus": userPlus,
  x,
};

export type IconName = keyof typeof ICONS;

/** `class`: its size and color, as `size-4 tint-ink-2`. */
export function Icon(props: { name: IconName; class: string }) {
  return <Image src={ICONS[props.name]} class={props.class} />;
}
