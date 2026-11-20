// Above a list showing saved items (`saved.ts`): since when, and whether an update is on its way
// or failed (then with a retry).
import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { t } from "nsh/i18n";
import { timeAgo } from "../format";

export function SavedNotice(props: { at: number | null; failed: boolean; onRetry: () => void }) {
  return (
    <If when={props.at !== null}>
      <View class="flex-row items-center gap-3 border-b border-border bg-muted px-4 py-2">
        <Text class="flex-1 text-xs text-muted-foreground">
          {t(props.failed ? "saved.stale" : "saved.updating", { time: timeAgo(props.at ?? Date.now()) })}
        </Text>
        <If when={props.failed}>
          <Button onPress={props.onRetry} class="active:opacity-60">
            <Text class="text-xs font-semibold text-primary">{t("common.retry")}</Text>
          </Button>
        </If>
      </View>
    </If>
  );
}
