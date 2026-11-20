// The page header on the desktops and the web; iOS and Android show the system's from `NavPage`'s title.
import { type JSX, Text, View } from "nsh";
import { Button } from "nsh/base";
import { t } from "nsh/i18n";
import { nav } from "../nav";
import { Icon } from "./Icon";

export function Header(props: { title: string; left?: JSX.Element; right?: JSX.Element }) {
  return (
    <View class="flex-row items-center gap-3 border-b border-border px-4 py-3">
      <If when={nav.routes().length > 1}>
        <Button accessibilityLabel={t("common.back")} onPress={() => nav.pop()} hitSlop={8} class="-ml-1 active:opacity-60">
          <Icon name="chevron-left" class="size-6 tint-primary" />
        </Button>
      </If>
      {props.left}
      <Text class="flex-1 font-semibold text-foreground">{props.title}</Text>
      {props.right}
    </View>
  );
}
