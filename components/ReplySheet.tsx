// The reply box: a sheet at the bottom with a text input, over the keyboard. One for the app,
// opened with `openReply` on the comment (or the reply in a thread) to answer, or with
// `openRepost` to repost the post with the comment quoted, as weibo.com's repost box for a comment.
import { keyboardFrame, safeArea, signal, Text, View } from "nsh";
import { Button, Input, Sheet } from "nsh/base";
import { t } from "nsh/i18n";
import { type Comment, replyComment, repostComment, repostText, type Status } from "../api";
import { Icon } from "./Icon";

interface Target {
  kind: "reply" | "repost";
  status: Status;
  comment: Comment;
  /** The reply went: Weibo's copy of it when it answered with one, else `null`. */
  onSent?: (reply: Comment | null) => void;
}

const target = signal<Target | null>(null);
const text = signal("");
const sending = signal(false);
const error = signal<string | null>(null);
// Drafts by kind and comment id: closing the box by mistake keeps what was typed.
const drafts = new Map<string, string>();
const draftKey = (cur: Target) => `${cur.kind}:${cur.comment.id}`;

function open(cur: Target, initial: string) {
  text.set(drafts.get(draftKey(cur)) ?? initial);
  error.set(null);
  target.set(cur);
}

export function openReply(status: Status, comment: Comment, onSent?: (reply: Comment | null) => void) {
  open({ kind: "reply", status, comment, onSent }, "");
}

/** Reposts `status` quoting `comment` (and `parent`, the comment it replies to in a thread). */
export function openRepost(status: Status, comment: Comment, parent?: Comment) {
  open({ kind: "repost", status, comment }, repostText(status, comment, parent));
}

function close() {
  const cur = target();
  if (cur) drafts.set(draftKey(cur), text());
  target.set(null);
}

async function send() {
  const cur = target();
  const body = text().trim();
  if (!cur || !body || sending()) return;
  sending.set(true);
  error.set(null);
  try {
    const reply = cur.kind === "repost" ? (await repostComment(cur.status, cur.comment, body), null) : await replyComment(cur.status, cur.comment, body);
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

export function ReplySheet() {
  return (
    <Sheet
      open={!!target()}
      onOpenChange={(e) => !e.open && close()}
      closeOnSwipe
      backdropClass="bg-black/40"
      popupClass="rounded-t-2xl bg-background px-4 pt-3"
      popupStyle={{ paddingBottom: Math.max(keyboardFrame().height, safeArea().bottom) + 12 }}
    >
      <View class="gap-2">
        <View class="flex-row items-center gap-2">
          <Button accessibilityLabel={t("common.cancel")} onPress={close} hitSlop={8} class="active:opacity-60">
            <Icon name="x" class="size-5 tint-muted-foreground" />
          </Button>
          <Text class="flex-1 text-sm font-semibold text-foreground line-clamp-1">
            {t(target()?.kind === "repost" ? "repost.title" : "reply.to", { name: target()?.comment.user.name ?? "" })}
          </Text>
          <Button
            onPress={send}
            disabled={!text().trim() || sending()}
            class="flex-row items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 active:opacity-60 disabled:opacity-40"
          >
            <Icon name="send" class="size-4 tint-primary-foreground" />
            <Text class="text-sm font-semibold text-primary-foreground">
              {sending() ? t("reply.sending") : t("reply.send")}
            </Text>
          </Button>
        </View>
        {/* A repost quotes the comment in its text already. */}
        <If when={target()?.kind === "reply"}>
          <Text class="text-xs text-muted-foreground line-clamp-2">{target()?.comment.text.trim() ?? ""}</Text>
        </If>
        <Input
          value={text()}
          onChange={(e) => text.set(e.value)}
          placeholder={t(target()?.kind === "repost" ? "repost.placeholder" : "reply.placeholder")}
          multiline
          autoFocus
          maxLength={2000}
          readonly={sending()}
          class="min-h-20 max-h-40 rounded-lg bg-muted px-3 py-2 text-[15px] text-foreground"
        />
        <If when={error()}>
          <Text class="text-xs text-destructive">{error()}</Text>
        </If>
      </View>
    </Sheet>
  );
}
