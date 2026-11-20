// Icons from Tabler Icons (https://tabler.io/icons, MIT, `icons/LICENSE`): the SVGs the app uses,
// copied from `@tabler/icons` 3.52.0. They draw in `currentColor`, which an image has none of:
// give each a `tint-*` class (and a `size-*`), or it draws black.
import { Image } from "nsh";
import alertTriangle from "../icons/alert-triangle.svg";
import arrowsLeftRight from "../icons/arrows-left-right.svg";
import ban from "../icons/ban.svg";
import chevronDown from "../icons/chevron-down.svg";
import chevronLeft from "../icons/chevron-left.svg";
import chevronUp from "../icons/chevron-up.svg";
import circleCheckFilled from "../icons/circle-check-filled.svg";
import cloudDownload from "../icons/cloud-download.svg";
import cloudOff from "../icons/cloud-off.svg";
import history from "../icons/history.svg";
import link from "../icons/link.svg";
import mapPin from "../icons/map-pin.svg";
import messageCircle from "../icons/message-circle.svg";
import pencil from "../icons/pencil.svg";
import playerPlay from "../icons/player-play.svg";
import playerPlayFilled from "../icons/player-play-filled.svg";
import refresh from "../icons/refresh.svg";
import repeat from "../icons/repeat.svg";
import send from "../icons/send.svg";
import thumbUp from "../icons/thumb-up.svg";
import userCheck from "../icons/user-check.svg";
import userMinus from "../icons/user-minus.svg";
import userPlus from "../icons/user-plus.svg";
import x from "../icons/x.svg";

const ICONS = {
  "alert-triangle": alertTriangle,
  "arrows-left-right": arrowsLeftRight,
  ban,
  "chevron-down": chevronDown,
  "chevron-left": chevronLeft,
  "chevron-up": chevronUp,
  "circle-check-filled": circleCheckFilled,
  "cloud-download": cloudDownload,
  "cloud-off": cloudOff,
  history,
  link,
  "map-pin": mapPin,
  "message-circle": messageCircle,
  pencil,
  "player-play": playerPlay,
  "player-play-filled": playerPlayFilled,
  refresh,
  repeat,
  send,
  "thumb-up": thumbUp,
  "user-check": userCheck,
  "user-minus": userMinus,
  "user-plus": userPlus,
  x,
};

export type IconName = keyof typeof ICONS;

/** `class`: its size and color, as `size-4 tint-muted-foreground`. */
export function Icon(props: { name: IconName; class: string }) {
  return <Image src={ICONS[props.name]} class={props.class} />;
}
