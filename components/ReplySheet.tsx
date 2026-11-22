// The reply box: a sheet at the bottom with a text input, over the keyboard. One for the app,
// opened with `openReply` on the comment (or the reply in a thread) to answer, or with
// `openRepost` to repost the post with the comment quoted, as weibo.com's repost box for a comment.
// Without a comment (a post's repost count in a list), it reposts the post itself.
import { keyboardFrame, safeArea, signal, Text, View } from "nsh";
import { Button, Input, Sheet } from "nsh/base";
import { t } from "nsh/i18n";
import {
  type Comment,
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

function open(cur: Target, initial: string) {
  text.set(drafts.get(draftKey(cur)) ?? initial);
  error.set(null);
  also.set(false);
  target.set(cur);
}

export function openReply(status: Status, comment: Comment, onSent?: (reply: Comment | null) => void) {
  open({ kind: "reply", status, comment, onSent }, "");
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
  if (cur) drafts.set(draftKey(cur), text());
  target.set(null);
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
        : await replyComment(cur.status, c!, body, also());
    drafts.delete(draftKey(cur));
    text.set("");
    if (target() === cur) target.set(null);
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
    if (!cur.comment) return t("repost.title_post", { name: cur.status.user.name });
    return t(repost() ? "repost.title" : "reply.to", { name: cur.comment.user.name });
  };
  // What it answers, quoted under the title, unless the text quotes it already (a comment's repost).
  const quoted = () => {
    const cur = target();
    if (!cur || (repost() && cur.comment)) return "";
    return (cur.comment ?? cur.status).text.trim();
  };
  return (
    <Sheet
      open={!!target()}
      onOpenChange={(e) => !e.open && close()}
      closeOnSwipe
      backdropClass="bg-black/30"
      popupClass="rounded-t-sheet bg-ground px-4 pt-2.5 shadow-[0_-8px_30px_#00000014]"
      popupStyle={{ paddingBottom: Math.max(keyboardFrame().height, safeArea().bottom) + 14 }}
    >
      <View class="gap-3">
        <View class="h-[5px] w-9 self-center rounded-full bg-sheet-grabber" />
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
          placeholder={t(repost() ? "repost.placeholder" : "reply.placeholder")}
          multiline
          autoFocus
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
    </Sheet>
  );
}
