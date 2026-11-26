// The taps the phone plays under the finger, on iOS. Each is named for what happened, so a screen
// says "a like was given" rather than which generator plays it.
//
// They play only where the app does something of its own. The system's controls already play
// theirs (pull to refresh, a finger held for a context menu, a menu button's menu), and a second
// one there would double them. Android maps these to its view feedback only roughly (a long press
// for a warning), so it keeps its own touch feedback and plays none of these.
import { platform } from "nsh";
import { Haptics } from "nsh/mobile";

const ON = platform.os === "ios";

/** Something was turned on by a tap: a like given, a post saved to my favorites. */
export function toggledOn() {
  if (ON) Haptics.impact("light");
}

/** Another tab, segment or option was chosen. */
export function selected() {
  if (ON) Haptics.selection();
}

/** A task the user waited on finished: a reply sent, an account followed, a picture saved. */
export function succeeded() {
  if (ON) Haptics.notification("success");
}

/** What the user asked for didn't happen: Weibo refused it, or the network failed. */
export function failed() {
  if (ON) Haptics.notification("error");
}
