// An edited post's versions, newest first, as weibo.com's "编辑记录" lists them. Each version
// shows what changed from the one before it: added text marked, removed text struck through.
import { List, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { t } from "nsh/i18n";
import { editHistory, type Version } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { GLASS, Page } from "../components/Header";
import { Icon } from "../components/Icon";
import { RichText } from "../components/RichText";
import { SavedNotice } from "../components/SavedNotice";
import { Avatar, Pictures } from "../components/StatusCard";
import { diff } from "../diff";
import { createFeed } from "../feed";
import { count, fullTime } from "../format";
import { openProfile, postById } from "../nav";

const TEXT_CLASS = "select-text text-body text-ink";

export function Edits(props: { id: string }) {
  const status = postById(props.id);
  if (!status) {
    return (
      <Page title={t("edits.title")}>
        <Text class="p-4 text-ink-2">{t("post.gone")}</Text>
      </Page>
    );
  }
  const feed = createFeed<Version, number>((page) => editHistory(status.id, page ?? 1), {
    saveAs: () => `edits:${status.id}`,
  });
  feed.more();
  const changes = signal(true);

  // Versions there are: the post's own count, or more if it was edited since it loaded.
  const total = () => Math.max(status.editCount + 1, feed.items().length);
  const label = (i: number) =>
    i === 0 ? t("edits.current") : i === total() - 1 ? t("edits.original") : t("edits.edit", { n: total() - 1 - i });

  return (
    <Page
      title={t("edits.title")}
      right={
        <Button
          selected={changes()}
          onPress={() => changes.update((v) => !v)}
          class={`h-11 flex-row items-center gap-1 rounded-full px-3.5 active:opacity-70 ${GLASS}`}
        >
          <Icon name={changes() ? "chevron-up" : "chevron-down"} class="size-4 tint-ink" />
          <Text class="text-sm leading-[18px] font-medium text-ink">
            {changes() ? t("edits.hide_changes") : t("edits.show_changes")}
          </Text>
        </Button>
      }
    >
      <List
        each={feed.items()}
        keyExtractor={(v) => v.id}
        estimatedItemSize={200}
        refreshing={feed.refreshing()}
        onRefresh={() => feed.refresh()}
        onLoadMore={() => feed.more()}
        header={
          <View>
            <View class="flex-row items-center gap-2.5 border-b-8 border-well px-4 py-3.5">
              <Avatar user={status.user} />
              <View class="flex-1 gap-px">
                <Text role="button" onPress={() => openProfile(status.user.id)} class="self-start text-body leading-5 font-semibold text-ink">
                  {status.user.name}
                </Text>
                <Text class="text-meta text-ink-2">{t("edits.count", { n: count(Math.max(status.editCount, total() - 1)) })}</Text>
              </View>
            </View>
            <SavedNotice at={feed.savedAt()} failed={!!feed.error()} onRetry={() => feed.more()} />
          </View>
        }
        footer={
          <FeedFooter
            loading={feed.loading()}
            error={feed.error()}
            done={feed.done()}
            empty={!feed.items().length}
            onRetry={() => feed.more()}
          />
        }
        class="flex-1"
      >
        {(v) => {
          const i = () => feed.items().indexOf(v());
          // The version this one replaced: the next in the list (older), once loaded.
          const before = () => (changes() ? feed.items()[i() + 1] : undefined);
          return (
            <View class="gap-2 border-b-[0.5px] border-hairline px-4 py-3.5">
              <View class="flex-row items-baseline gap-2">
                <Text class="text-sm leading-[18px] font-semibold text-ink">{label(i())}</Text>
                <Text class="text-xs text-ink-2">{fullTime(v().createdAt)}</Text>
              </View>
              <If
                when={before()}
                else={<RichText text={v().text} links={v().links} class={TEXT_CLASS} />}
              >
                {(b) => <Changes before={b().text} after={v().text} />}
              </If>
              <Pictures pics={v().pics} small />
            </View>
          );
        }}
      </List>
    </Page>
  );
}

function Changes(props: { before: string; after: string }) {
  return (
    <Text class={TEXT_CLASS}>
      {diff(props.before, props.after).map((p) =>
        p.kind === "same" ? (
          p.text
        ) : (
          <Text class={p.kind === "added" ? "text-diff-add-ink underline" : "text-diff-del-ink line-through"}>{p.text}</Text>
        ),
      )}
    </Text>
  );
}
