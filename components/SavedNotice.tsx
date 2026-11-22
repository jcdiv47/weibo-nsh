// Above a list still showing saved items (`saved.ts`) because the update failed: since when, and a
// retry. While the update is on its way the page's refresh indicator says so, not this.
import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { t } from "nsh/i18n";
import { timeAgo } from "../format";
import { Icon } from "./Icon";

export function SavedNotice(props: { at: number | null; failed: boolean; onRetry: () => void }) {
  return (
    <If when={props.at !== null && props.failed}>
      <View class="flex-row items-center gap-2 border-y-[0.5px] border-hairline bg-well px-4 py-2">
        <Icon name="cloud-off" class="size-4 shrink-0 tint-ink-2" />
        <Text class="flex-1 text-xs text-ink-2">{t("saved.stale", { time: timeAgo(props.at ?? Date.now()) })}</Text>
        <Button onPress={props.onRetry} class="flex-row items-center gap-1 active:opacity-60">
          <Icon name="refresh" class="size-3.5 tint-link" />
          <Text class="text-xs font-semibold text-link">{t("common.retry")}</Text>
        </Button>
      </View>
    </If>
  );
}
