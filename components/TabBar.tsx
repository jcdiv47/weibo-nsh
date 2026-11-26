// The underline tabs under a header or a post (a post's reposts / comments / likes, a profile's
// people, a search's posts and accounts): the chosen one in ink over Weibo's orange bar.
import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { count } from "../format";
import { selected } from "../haptics";

export type TabItem<K extends string> = {
  id: K;
  /** What the tab says. */
  label: string;
  /** A number shown large before the label (a profile's people), or none. */
  count?: number;
  /** What screen readers say, when it is more than the label (the label and its count). */
  accessibilityLabel?: string;
};

/**
 * A row of tabs, one chosen. `class` places the row (its height, ground and borders: the bottom
 * hairline's color is the caller's), `tabClass` each tab (a post's room above them).
 */
export function TabBar<K extends string>(props: {
  tabs: TabItem<K>[];
  value: K;
  onChange: (id: K) => void;
  class?: string;
  tabClass?: string;
}) {
  // Rows are kept by id, and each reads its tab again from `tabs`, so a count that changes
  // updates its tab in place.
  const ids = () => props.tabs.map((tab) => tab.id);
  return (
    <View role="tablist" class={`flex-row items-end gap-7 border-b-[0.5px] px-4 ${props.class ?? ""}`}>
      <Each of={ids()}>
        {(id) => {
          const tab = () => props.tabs.find((x) => x.id === id())!;
          const on = () => props.value === id();
          return (
            <Button
              role="tab"
              accessibilityLabel={tab().accessibilityLabel ?? tab().label}
              selected={on()}
              onPress={() => {
                if (!on()) selected();
                props.onChange(id());
              }}
              class={`items-center gap-2 active:opacity-60 ${props.tabClass ?? ""}`}
            >
              <View class="flex-row items-center gap-1">
                <If when={tab().count !== undefined}>
                  <Text class={`text-headline leading-5 font-bold ${on() ? "text-ink" : "text-ink-2"}`}>{count(tab().count!)}</Text>
                </If>
                <Text class={`text-body leading-5 ${on() ? "font-semibold text-ink" : "text-ink-2"}`}>{tab().label}</Text>
              </View>
              <View class={`h-[3px] w-6 rounded-full ${on() ? "bg-weibo" : "bg-transparent"}`} />
            </Button>
          );
        }}
      </Each>
    </View>
  );
}
