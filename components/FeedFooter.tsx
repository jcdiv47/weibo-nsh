// Under a paged list: loading, the error with a retry, or the end.
import { Text, View } from "nsh";
import { Button } from "nsh/base";

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
        <Text class="text-center text-sm text-destructive">{props.error}</Text>
        <Button onPress={props.onRetry} class="rounded-(--radius) border border-border px-4 py-2 active:opacity-60">
          <Text class="text-foreground">Retry</Text>
        </Button>
      </If>
      <If when={!props.error && props.loading}>
        <Text class="text-sm text-muted-foreground">Loading…</Text>
      </If>
      <If when={!props.error && !props.loading && props.done}>
        <Text class="text-sm text-muted-foreground">{props.empty ? "Nothing here" : "No more"}</Text>
      </If>
    </View>
  );
}
