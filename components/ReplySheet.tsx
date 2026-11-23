// The reply box: a panel at the bottom with a text input, standing on the keyboard. One for the app,
// opened with `openReply` on the comment (or the reply in a thread) to answer, or with
// `openRepost` to repost the post with the comment quoted, as weibo.com's repost box for a comment.
// Without a comment it comments on the post itself (`openComment`, the post page's comment field)
// or reposts it (a post's repost count in a list, the post page's repost button).
//
// The panel rises with the keyboard as one motion: it waits below the screen, and when the keyboard
// comes it goes to the keyboard's top on the keyboard's own curve and duration, so it grows out of
// the keyboard's top edge; closing takes them down together. (`Sheet` slid in on its own spring,
// and a keyboard rising during that slide stood it, on a phone, a moment far too high.)
//
// It goes down by a transform alone, its layout kept: the input has let the keyboard go by then,
// and a layout change with the keyboard going pulled the page under it down for a moment.
import {
  batch,
  createAnimatedValue,
  Easing,
  effect,
  type InputRef,
  Keyboard,
  keyboardFrame,
  LayoutAnimation,
  safeArea,
  signal,
  Text,
  untracked,
  View,
} from "nsh";
import { Button, Input } from "nsh/base";
import { t } from "nsh/i18n";
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

/** The panel is going: it goes down with the keyboard, and leaves the tree once it is down. */
const leaving = signal(false);
/** No software keyboard came (a hardware keyboard): the panel stands at the bottom instead. */
const noKeyboard = signal(false);
/** How long the panel waits for the keyboard before it stands at the bottom without it. */
const KEYBOARD_WAIT_MS = 600;
/** The panel's motion where the keyboard gives none (it is not there, or it reports no duration). */
const PANEL_MS = 250;
/** The curve of iOS's keyboard as it comes and goes, near enough: the panel goes down on it. */
const KEYBOARD_CURVE = Easing.bezier(0.38, 0.7, 0.125, 1);
/** How far the going panel has dropped from where it stood, moved natively. */
const drop = createAnimatedValue(0);
let dropping = false;
let waiting: ReturnType<typeof setTimeout> | undefined;
/** The panel's input, while it is there. */
let input: InputRef | undefined;

function open(cur: Target, initial: string) {
  text.set(drafts.get(draftKey(cur)) ?? initial);
  error.set(null);
  also.set(false);
  leaving.set(false);
  noKeyboard.set(false);
  // Opened again while it went down: it stands where it stood.
  if (dropping) {
    dropping = false;
    drop.stop();
    drop.set(0);
  }
  target.set(cur);
  clearTimeout(waiting);
  waiting = setTimeout(() => !keyboardFrame().height && noKeyboard.set(true), KEYBOARD_WAIT_MS);
  // Opened again while it went down, the panel kept its input, which `autoFocus` does not focus again.
  setTimeout(() => input?.focus());
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

function close() {
  const cur = target();
  if (!cur || leaving()) return;
  clearTimeout(waiting);
  drafts.set(draftKey(cur), text());
  leaving.set(true);
  Keyboard.dismiss();
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
    drafts.delete(draftKey(cur));
    text.set("");
    if (target() === cur) {
      leaving.set(true);
      Keyboard.dismiss();
    }
    cur.onSent?.(reply);
  } catch (e) {
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

  // Where the panel stands: below the screen (`null`), or this far above its bottom (the keyboard's
  // height, 0 without one). A change animates on the keyboard's curve and duration (it comes up so).
  const lift = signal<number | null>(null);
  // Its height, to wait just below the screen (far below before it is first laid out).
  const height = signal(1000);
  const backdrop = createAnimatedValue(0);
  effect(() => {
    const kb = keyboardFrame();
    if (leaving()) {
      // Going: down out of sight with the keyboard, then out of the tree.
      untracked(() => {
        if (dropping) return;
        dropping = true;
        const duration = kb.duration || PANEL_MS;
        backdrop.timing(0, { duration });
        drop.timing((lift() ?? 0) + height(), { duration, easing: KEYBOARD_CURVE }).then(({ finished }) => {
          if (!finished || !dropping) return;
          dropping = false;
          batch(() => {
            target.set(null);
            leaving.set(false);
            lift.set(null);
          });
          drop.set(0);
        });
      });
      return;
    }
    const up = !!target() && (kb.height > 0 || noKeyboard());
    const to = up ? kb.height : null;
    untracked(() => {
      if (to === lift()) return;
      const duration = kb.duration || PANEL_MS;
      backdrop.timing(up ? 1 : 0, { duration });
      LayoutAnimation.configureNext({ duration, update: { type: "keyboard" } });
      lift.set(to);
    });
  });

  return (
    <If when={target()}>
      <View class="absolute inset-0">
        <View
          accessibilityLabel={t("common.cancel")}
          onPress={close}
          class="absolute inset-0 bg-black/30"
          style={{ opacity: backdrop }}
        />
        <View
          role="dialog"
          accessibilityLabel={title()}
          onLayout={(e) => height.set(e.bounds.size.height)}
          class="absolute inset-x-0 rounded-t-sheet bg-ground px-4 pt-4 shadow-[0_-8px_30px_#00000014]"
          // Above the keyboard it stands right on it; without one, clear of the home indicator. Below
          // the screen it is as tall as on the keyboard, so that it goes all the way out of sight.
          style={{
            bottom: lift() ?? -height(),
            paddingBottom: (lift() === 0 ? safeArea().bottom : 0) + 14,
            transform: [{ translateY: drop }],
          }}
        >
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
                <Icon name={repost() ? "repeat" : "send"} class="size-4 tint-white" />
                <Text class="text-sm leading-[18px] font-semibold text-white">
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
              <Button
                role="checkbox"
                selected={also()}
                onPress={() => also.update((v) => !v)}
                class="flex-1 flex-row items-center gap-2 pl-0.5 active:opacity-60"
              >
                <If when={also()} else={<View class="size-5 rounded-full border-[1.5px] border-ink-3" />}>
                  <Icon name="circle-check-filled" class="size-5 tint-weibo" />
                </If>
                <Text class="text-sm leading-[18px] text-ink">{t(repost() ? "repost.also_comment" : "reply.also_repost")}</Text>
              </Button>
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
