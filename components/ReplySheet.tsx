// The reply box: a panel at the bottom with a text input, standing on the keyboard. One for the app,
// opened with `openReply` on the comment (or the reply in a thread) to answer, or with
// `openRepost` to repost the post with the comment quoted, as weibo.com's repost box for a comment.
// Without a comment it comments on the post itself (`openComment`, the post page's comment field)
// or reposts it (a post's repost count in a list, the post page's repost button).
//
// The panel rides right on top of the keyboard as one rigid unit:
// - Before the keyboard appears, it sits at `bottom: 0` with `opacity: 0` so it travels the exact
//   same distance (`0` → `kb.height`) as the keyboard itself rather than emerging faster/slower out
//   of the keyboard's top edge.
// - On iOS, the expand layout animation uses a physical spring fitted to the system keyboard's real
//   rise (`stiffness: 800, damping: 57, mass: 1`) while fading in over the first ~110ms, so the
//   panel stays welded to the keyboard's top edge from start to settle without triggering keyboard
//   panning of the page behind it.
// - On close, it dismisses the keyboard and drops by the exact keyboard height (`translateY`) in
//   that same commit on a matched collapse spring (`stiffness: 1000, damping: 64, mass: 1`) while
//   fading out as it reaches the bottom edge — zero round-trip lag, zero page panning, and no
//   lingering panel after the keyboard disappears.
// - On Android, expand and collapse follow `LayoutCurve::Keyboard` (`WindowInsetsAnimation`).
import {
  batch,
  createAnimatedValue,
  Easing,
  effect,
  type InputRef,
  Keyboard,
  keyboardFrame,
  LayoutAnimation,
  platform,
  safeArea,
  signal,
  Text,
  untracked,
  View,
  type ViewRef,
} from "nsh";
import { Button, Checkbox, Input } from "nsh/base";
import { t } from "nsh/i18n";
import { onForgetAccount } from "../account";
import {
  type Comment,
  commentStatus,
  replyComment,
  repostComment,
  repostStatus,
  repostStatusText,
  repostText,
  type Status,
} from "../api";
import { failed, succeeded } from "../haptics";
import { Icon, type IconName } from "./Icon";

interface Target {
  kind: "reply" | "repost";
  status: Status;
  /** Unset: the post itself. */
  comment?: Comment;
  /** The reply went: Weibo's copy of it when it answered with one, else `null`. */
  onSent?: (reply: Comment | null) => void;
}

const target = signal<Target | null>(null);
const text = signal("");
const sending = signal(false);
/** 同时转发 (a reply) or 同时评论 (a repost). */
const also = signal(false);
const error = signal<string | null>(null);
// Drafts by kind and comment id: closing the box by mistake keeps what was typed.
const drafts = new Map<string, string>();
const draftKey = (cur: Target) => `${cur.kind}:${cur.comment ? cur.comment.id : `post:${cur.status.id}`}`;

/** The panel is closing: touches pass through, and it leaves the tree once offscreen. */
const leaving = signal(false);
/** No software keyboard came (a hardware keyboard): the panel stands at the bottom instead. */
const noKeyboard = signal(false);
/** Safety fallback on Android if `Keyboard.dismiss()` never reports `height: 0`. */
const forceDrop = signal(false);
/** How far the panel stands above the bottom of the screen (`null` while waiting at `bottom: 0`). */
const lift = signal<number | null>(null);
/** How long the panel waits for the keyboard before it stands at the bottom without it. */
const KEYBOARD_WAIT_MS = 600;
/** The panel's motion when no software keyboard drives it (hardware keyboard, or duration 0). */
const PANEL_MS = 220;
/** How long Android's `Keyboard.dismiss()` may take to start hiding before dropping anyway. */
const DISMISS_WAIT_MS = 450;
/**
 * Critically-damped physical springs fitted to iOS's real keyboard rise and drop:
 * UIKit's legacy curve 7 settles noticeably slower than modern iOS's actual keyboard (~400ms vs
 * ~150-220ms), which left the panel creeping up or lingering at the bottom after the keyboard had
 * already finished moving.
 */
const IOS_EXPAND_SPRING = { mass: 1, stiffness: 800, damping: 57 };
const IOS_COLLAPSE_SPRING = { mass: 1, stiffness: 1000, damping: 64 };
const HARDWARE_SPRING = { mass: 1, stiffness: 600, damping: 48 };
const BACKDROP_CURVE = Easing.out(Easing.cubic);
/** Vertical offset of the panel, moved natively on close and hardware-keyboard open/close. */
const drop = createAnimatedValue(0);
/** Panel opacity: invisible while waiting at `bottom: 0`, fades in/out tightly with the keyboard. */
const panelOpacity = createAnimatedValue(0);

let waiting: ReturnType<typeof setTimeout> | undefined;
let dismissFallback: ReturnType<typeof setTimeout> | undefined;
let unmountTimer: ReturnType<typeof setTimeout> | undefined;
/** Whether this open session has seen a software keyboard rise, to detect external dismissal. */
let sawKeyboard = false;
/** Whether the panel has already started its exit motion in the current closing cycle. */
let closing = false;
/** The panel's input, while it is mounted. */
let input: InputRef | undefined;
/** The panel itself, to scope layout animations on non-keyboard transitions. */
let panel: ViewRef | undefined;

function clearTimers() {
  clearTimeout(waiting);
  clearTimeout(dismissFallback);
  clearTimeout(unmountTimer);
}

function open(cur: Target, initial: string) {
  const mounted = !!target();
  const hasKb = keyboardFrame().height > 0;
  clearTimers();
  sawKeyboard = false;
  closing = false;
  drop.stop();
  drop.set(0);
  if (!mounted || !hasKb) {
    panelOpacity.stop();
    panelOpacity.set(0);
  }
  batch(() => {
    text.set(drafts.get(draftKey(cur)) ?? initial);
    error.set(null);
    also.set(false);
    leaving.set(false);
    noKeyboard.set(false);
    forceDrop.set(false);
    if (!hasKb) lift.set(null);
    target.set(cur);
  });
  waiting = setTimeout(() => {
    if (target() && !leaving() && !keyboardFrame().height) noKeyboard.set(true);
  }, KEYBOARD_WAIT_MS);
  // Opened again while closing: the panel kept its mounted input, which `autoFocus` does not focus again.
  if (mounted) input?.focus();
}

export function openReply(status: Status, comment: Comment, onSent?: (reply: Comment | null) => void) {
  open({ kind: "reply", status, comment, onSent }, "");
}

/** Comments on the post itself. */
export function openComment(status: Status, onSent?: (comment: Comment | null) => void) {
  open({ kind: "reply", status, onSent }, "");
}

/** Reposts `status` quoting `comment` (and `parent`, the comment it replies to in a thread). */
export function openRepost(status: Status, comment: Comment, parent?: Comment) {
  open({ kind: "repost", status, comment }, repostText(status, comment, parent));
}

/** Reposts the post itself, the box starting as weibo.com's does (the chain, for a repost). */
export function openRepostStatus(status: Status) {
  open({ kind: "repost", status }, repostStatusText(status));
}

/** A repost of a post may go with no text: Weibo's "转发微博". */
const canSend = (cur: Target | null, body: string) => !!cur && (!!body || (cur.kind === "repost" && !cur.comment));

function dismiss() {
  if (!target() || leaving()) return;
  clearTimeout(waiting);
  clearTimeout(unmountTimer);
  leaving.set(true);
  // On Android, wait for `Keyboard.dismiss()` to report `height: 0` so the panel rides the system's
  // `WindowInsetsAnimation` curve. On iOS, the panel drops via `translateY` in this same commit
  // (zero round-trip lag, and no layout change while focused so iOS never pans the page).
  if (platform.os !== "ios" && keyboardFrame().height > 0) {
    clearTimeout(dismissFallback);
    dismissFallback = setTimeout(() => {
      if (leaving()) forceDrop.set(true);
    }, DISMISS_WAIT_MS);
  }
  Keyboard.dismiss();
}

// The drafts were written as the account that is going: a box still open closes without keeping one.
onForgetAccount(() => {
  drafts.clear();
  text.set("");
  dismiss();
});

function close() {
  const cur = target();
  if (!cur || leaving()) return;
  drafts.set(draftKey(cur), text());
  dismiss();
}

async function send() {
  const cur = target();
  const body = text().trim();
  if (!cur || !canSend(cur, body) || sending()) return;
  sending.set(true);
  error.set(null);
  try {
    const c = cur.comment;
    const reply =
      cur.kind === "repost"
        ? (await (c ? repostComment(cur.status, c, body, also()) : repostStatus(cur.status, body, also())), null)
        : c
          ? await replyComment(cur.status, c, body, also())
          : await commentStatus(cur.status, body, also());
    succeeded();
    drafts.delete(draftKey(cur));
    text.set("");
    if (target() === cur) dismiss();
    cur.onSent?.(reply);
  } catch (e) {
    failed();
    error.set(t(cur.kind === "repost" ? "repost.failed" : "reply.failed", { error: String((e as Error)?.message ?? e) }));
  } finally {
    sending.set(false);
  }
}

/** Appends `token` ("@", "#") to the text, with a space before it after a word. */
const insert = (token: string) => text.update((v) => (v && !/\s$/.test(v) ? `${v} ${token}` : `${v}${token}`));

function ToolButton(props: { label: string; icon: IconName; onPress: () => void }) {
  return (
    <Button
      accessibilityLabel={props.label}
      onPress={props.onPress}
      class="h-9 w-10 shrink-0 items-center justify-center active:opacity-60"
    >
      <Icon name={props.icon} class="size-6 tint-ink" />
    </Button>
  );
}

export function ReplySheet() {
  const repost = () => target()?.kind === "repost";
  const title = () => {
    const cur = target();
    if (!cur) return "";
    if (!cur.comment) return t(repost() ? "repost.title_post" : "reply.to_post", { name: cur.status.user.name });
    return t(repost() ? "repost.title" : "reply.to", { name: cur.comment.user.name });
  };
  // What it answers, quoted under the title, unless the text quotes it already (a comment's repost).
  const quoted = () => {
    const cur = target();
    if (!cur || (repost() && cur.comment)) return "";
    return (cur.comment ?? cur.status).text.trim();
  };

  const backdrop = createAnimatedValue(0);

  const finishClose = () => {
    clearTimers();
    sawKeyboard = false;
    closing = false;
    drop.stop();
    panelOpacity.stop();
    batch(() => {
      target.set(null);
      leaving.set(false);
      noKeyboard.set(false);
      forceDrop.set(false);
      lift.set(null);
    });
    drop.set(0);
    panelOpacity.set(0);
    backdrop.set(0);
  };

  effect(() => {
    const cur = target();
    const kb = keyboardFrame();
    const isLeaving = leaving();
    const noKb = noKeyboard();
    const forced = forceDrop();

    untracked(() => {
      if (!cur) {
        if (lift() !== null) lift.set(null);
        return;
      }

      if (isLeaving) {
        if (closing) return;
        const ios = platform.os === "ios";
        // On Android, wait for `kb.height` to drop to 0 so `sync_env` drives `LayoutCurve::Keyboard`.
        if (!ios && kb.height > 0 && !forced) return;

        clearTimeout(dismissFallback);
        const currentLift = lift();
        if (currentLift === null) {
          finishClose();
          return;
        }
        closing = true;
        const withKeyboard = !noKb && !forced && currentLift > 0;
        if (ios || !withKeyboard) {
          // Drop by the exact keyboard height (`currentLift`) on a spring fitted to the keyboard's
          // real dismissal, fading out cleanly as it meets the bottom edge so nothing lingers after
          // the keyboard disappears. Without a software keyboard, glide down 48pt while fading out.
          if (withKeyboard) {
            drop.spring(currentLift, IOS_COLLAPSE_SPRING);
            panelOpacity.timing(0, { duration: 140, easing: Easing.in(Easing.quad) });
            backdrop.timing(0, { duration: 180, easing: BACKDROP_CURVE });
          } else {
            drop.spring(48, HARDWARE_SPRING);
            panelOpacity.timing(0, { duration: 150, easing: Easing.out(Easing.quad) });
            backdrop.timing(0, { duration: 180, easing: BACKDROP_CURVE });
          }
          clearTimeout(unmountTimer);
          unmountTimer = setTimeout(() => {
            if (leaving()) finishClose();
          }, 260);
        } else {
          // Android software keyboard dismissal: ride the system's `WindowInsetsAnimation` curve.
          if (!kb.duration) panel?.animateLayout({ type: "keyboard", duration: PANEL_MS });
          lift.set(null);
          const duration = kb.duration || PANEL_MS;
          panelOpacity.timing(0, { duration: Math.min(duration, 160), easing: Easing.in(Easing.quad) });
          backdrop.timing(0, { duration, easing: BACKDROP_CURVE });
          clearTimeout(unmountTimer);
          unmountTimer = setTimeout(() => {
            if (leaving()) finishClose();
          }, duration + 60);
        }
        return;
      }

      // The software keyboard was dismissed externally (Android back button, iPad hide-keyboard
      // key): save the draft and enter the closing path in this same commit so the panel rides down
      // with the keyboard instead of leaving an invisible backdrop over the page.
      if (kb.height === 0 && sawKeyboard) {
        drafts.set(draftKey(cur), text());
        clearTimeout(waiting);
        leaving.set(true);
        return;
      }

      if (kb.height > 0) sawKeyboard = true;
      const up = kb.height > 0 || noKb;
      const to = up ? kb.height : null;
      if (to === lift()) {
        // Re-opened while still at the same keyboard height: restore visibility cleanly.
        if (up) {
          panelOpacity.timing(1, { duration: 110, easing: Easing.out(Easing.quad) });
          backdrop.timing(1, { duration: 180, easing: BACKDROP_CURVE });
        }
        return;
      }

      const wasDown = lift() === null;
      const withKeyboard = kb.height > 0;
      const ios = platform.os === "ios";
      if (withKeyboard) {
        if (ios) {
          LayoutAnimation.configureNext({
            duration: kb.duration || PANEL_MS,
            update: { type: "spring", ...IOS_EXPAND_SPRING },
          });
        } else if (!kb.duration) {
          panel?.animateLayout({ type: "keyboard", duration: PANEL_MS });
        }
        lift.set(to);
        if (wasDown) {
          // Wait one frame on iOS before fading in so the composer emerges alongside the keyboard
          // instead of flashing ahead of it, then reach full opacity while riding up together.
          panelOpacity.timing(1, { duration: 110, delay: ios ? 16 : 0, easing: Easing.out(Easing.quad) });
          backdrop.timing(1, { duration: ios ? 220 : kb.duration || PANEL_MS, easing: BACKDROP_CURVE });
        }
      } else if (up) {
        // Hardware keyboard: crisp short rise and fade at the bottom of the screen.
        lift.set(0);
        drop.set(36);
        drop.spring(0, HARDWARE_SPRING);
        panelOpacity.timing(1, { duration: 160, easing: Easing.out(Easing.quad) });
        backdrop.timing(1, { duration: 200, easing: BACKDROP_CURVE });
      } else {
        lift.set(null);
      }
    });
  });

  return (
    <If when={target()}>
      <View class="absolute inset-0" style={{ pointerEvents: leaving() ? "none" : "auto" }}>
        <View
          accessibilityLabel={t("common.cancel")}
          onPress={close}
          class="absolute inset-0 bg-black/30"
          style={{ opacity: backdrop }}
        />
        <View
          ref={(r) => (panel = r ?? undefined)}
          role="dialog"
          accessibilityLabel={title()}
          class="absolute inset-x-0 rounded-t-sheet bg-ground px-4 pt-4 shadow-[0_-8px_30px_#00000014]"
          // Waits invisible at `bottom: 0`, then travels the exact keyboard height (`0` → `lift`)
          // so the panel stays welded to the top edge of the keyboard throughout expand and close.
          style={{
            bottom: lift() ?? 0,
            paddingBottom: (noKeyboard() ? safeArea().bottom : 0) + 14,
            opacity: panelOpacity,
            transform: [{ translateY: drop }],
          }}
        >
          {/* Extends the panel's ground behind the keyboard's top edge so no backdrop sliver shows
              through rounded keyboard corners (iOS 26+) or subpixel seams while moving. */}
          <View class="pointer-events-none absolute inset-x-0 top-full h-10 bg-ground" />
          <View class="gap-3">
            <View class="flex-row items-center gap-2.5">
              <Button
                accessibilityLabel={t("common.cancel")}
                onPress={close}
                hitSlop={8}
                class="size-8 items-center justify-center rounded-full bg-well active:opacity-60"
              >
                <Icon name="x" class="size-[18px] tint-ink-2" />
              </Button>
              <Text class="flex-1 text-body leading-5 font-semibold text-ink line-clamp-1">
                {title()}
              </Text>
              <Button
                onPress={send}
                disabled={!canSend(target(), text().trim()) || sending()}
                class="flex-row items-center gap-1.5 rounded-full bg-weibo px-3.5 py-[7px] active:opacity-70 disabled:opacity-40"
              >
                <Icon name={repost() ? "repeat" : "send"} class="size-4 tint-primary-foreground" />
                <Text class="text-sm leading-[18px] font-semibold text-primary-foreground">
                  {sending() ? t("reply.sending") : repost() ? t("repost.action") : t("reply.send")}
                </Text>
              </Button>
            </View>
            <If when={quoted()}>
              <View class="flex-row gap-2 pl-0.5">
                <View class="w-0.5 rounded-full bg-hairline" />
                <Text class="flex-1 text-meta text-ink-2 line-clamp-2">{quoted()}</Text>
              </View>
            </If>
            <Input
              value={text()}
              onChange={(e) => text.set(e.value)}
              placeholder={t(repost() ? "repost.placeholder" : target()?.comment ? "reply.placeholder" : "reply.post_placeholder")}
              multiline
              autoFocus
              ref={(r) => (input = r ?? undefined)}
              maxLength={2000}
              readonly={sending()}
              class="min-h-[88px] max-h-40 rounded-well bg-well px-3 py-2.5 text-body leading-[22px] text-ink placeholder:text-ink-3"
            />
            <If when={error()}>
              <Text class="text-xs text-danger">{error()}</Text>
            </If>
            <View class="h-9 flex-row items-center gap-1">
              <Checkbox
                checked={also()}
                onChange={({ checked }) => also.set(checked)}
                class="flex-1 flex-row items-center gap-2 pl-0.5 active:opacity-60"
                indicator={
                  <If when={also()} else={<View class="size-5 rounded-full border-[1.5px] border-ink-3" />}>
                    <Icon name="circle-check-filled" class="size-5 tint-weibo" />
                  </If>
                }
              >
                <Text class="text-sm leading-[18px] text-ink">{t(repost() ? "repost.also_comment" : "reply.also_repost")}</Text>
              </Checkbox>
              <ToolButton label={t("compose.mention")} icon="at" onPress={() => insert("@")} />
              <If when={repost()}>
                <ToolButton label={t("compose.topic")} icon="hash" onPress={() => insert("#")} />
              </If>
            </View>
          </View>
        </View>
      </View>
    </If>
  );
}
