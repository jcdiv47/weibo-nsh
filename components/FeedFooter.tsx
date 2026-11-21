// Under a paged list: loading, the error with a retry, or the end. Its error line and retry
// button serve pages that fail to load as well.
import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { t } from "nsh/i18n";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";

/** A load's error, centered, behind a warning sign. */
export function ErrorText(props: { error: string }) {
  return (
    <View class="flex-row items-start justify-center gap-1.5 self-stretch">
      <Icon name="alert-triangle" class="mt-px size-4 shrink-0 tint-danger" />
      <Text class="shrink text-center text-sm text-danger">{props.error}</Text>
    </View>
  );
}

export function RetryButton(props: { onPress: () => void }) {
  return (
    <Button
      onPress={props.onPress}
      class="h-9 flex-row items-center gap-1.5 rounded-full bg-well px-4 active:opacity-60"
    >
      <Icon name="refresh" class="size-4 tint-ink" />
      <Text class="text-sm font-semibold text-ink">{t("common.retry")}</Text>
    </Button>
  );
}

export function FeedFooter(props: {
  loading: boolean;
  error: string | null;
  done: boolean;
  empty: boolean;
  onRetry: () => void;
}) {
  return (
    <View class="items-center gap-2 px-4 py-6">
      <If when={props.error}>
        <ErrorText error={props.error!} />
        <RetryButton onPress={props.onRetry} />
      </If>
      <If when={!props.error && props.loading}>
        <Spinner />
      </If>
      <If when={!props.error && !props.loading && props.done}>
        <Text class="text-meta text-ink-3">{props.empty ? t("common.nothing_here") : t("common.no_more")}</Text>
      </If>
    </View>
  );
}
