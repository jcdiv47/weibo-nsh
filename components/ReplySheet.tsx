// The reply box: a sheet at the bottom with a text input, over the keyboard. One for the app,
// opened with `openReply` on the comment (or the reply in a thread) to answer.
import { keyboardFrame, safeArea, signal, Text, View } from "nsh";
import { Button, Input, Sheet } from "nsh/base";
import { t } from "nsh/i18n";
import { type Comment, replyComment, type Status } from "../api";

interface Target {
  status: Status;
  comment: Comment;
  /** The reply went: Weibo's copy of it when it answered with one, else `null`. */
  onSent?: (reply: Comment | null) => void;
}

const target = signal<Target | null>(null);
const text = signal("");
const sending = signal(false);
const error = signal<string | null>(null);
// Drafts by comment id: closing the box by mistake keeps what was typed.
const drafts = new Map<string, string>();

export function openReply(status: Status, comment: Comment, onSent?: (reply: Comment | null) => void) {
  text.set(drafts.get(comment.id) ?? "");
  error.set(null);
  target.set({ status, comment, onSent });
}

function close() {
  const cur = target();
  if (cur) drafts.set(cur.comment.id, text());
  target.set(null);
}

async function send() {
  const cur = target();
  const body = text().trim();
  if (!cur || !body || sending()) return;
  sending.set(true);
  error.set(null);
  try {
    const reply = await replyComment(cur.status, cur.comment, body);
    drafts.delete(cur.comment.id);
    text.set("");
    if (target() === cur) target.set(null);
    cur.onSent?.(reply);
  } catch (e) {
    error.set(t("reply.failed", { error: String((e as Error)?.message ?? e) }));
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
          <Text class="flex-1 text-sm font-semibold text-foreground line-clamp-1">
            {t("reply.to", { name: target()?.comment.user.name ?? "" })}
          </Text>
          <Button
            onPress={send}
            disabled={!text().trim() || sending()}
            class="rounded-full bg-primary px-4 py-1.5 active:opacity-60 disabled:opacity-40"
          >
            <Text class="text-sm font-semibold text-primary-foreground">
              {sending() ? t("reply.sending") : t("reply.send")}
            </Text>
          </Button>
        </View>
        <Text class="text-xs text-muted-foreground line-clamp-2">{target()?.comment.text.trim() ?? ""}</Text>
        <Input
          value={text()}
          onChange={(e) => text.set(e.value)}
          placeholder={t("reply.placeholder")}
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
