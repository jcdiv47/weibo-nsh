// A short menu that drops from a header button, as the design draws it: a frosted card of rows,
// each a label and its icon at the right; a destructive row in red. Choosing a row closes it.
import { type JSX, signal, Text } from "nsh";
import { Button, Popover } from "nsh/base";
import type { IconName } from "./Icon";
import { Icon } from "./Icon";

export interface PopMenuItem {
  label: string;
  icon: IconName;
  danger?: boolean;
  onSelect: () => void;
}

export function PopMenu(props: { trigger: JSX.Element; items: PopMenuItem[] }) {
  const open = signal(false);
  return (
    <Popover
      open={open()}
      onOpenChange={(e) => open.set(e.open)}
      placement="bottom"
      align="end"
      offset={8}
      margin={16}
      trigger={props.trigger}
      popupClass="w-[232px] rounded-[24px] bg-menu p-1.5 backdrop-blur-xl shadow-[0_0_0_0.5px_#0000001a,0_12px_40px_#00000026] dark:shadow-[0_0_0_0.5px_#ffffff1f,0_12px_40px_#00000026] transition duration-150"
      popupStartingClass="opacity-0 scale-95"
      popupEndingClass="opacity-0 scale-95"
    >
      <Each of={props.items}>
        {(item) => (
          <Button
            role="menuitem"
            onPress={() => {
              open.set(false);
              item().onSelect();
            }}
            class="h-11 flex-row items-center justify-between rounded-[18px] px-3.5 active:bg-menu-press"
          >
            <Text class={`text-headline ${item().danger ? "text-danger" : "text-ink"}`}>{item().label}</Text>
            <Icon name={item().icon} class={`size-5 ${item().danger ? "tint-danger" : "tint-ink"}`} />
          </Button>
        )}
      </Each>
    </Popover>
  );
}
