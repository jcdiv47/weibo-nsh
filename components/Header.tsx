// The page shell: the app draws its own header on every platform, as the design has it: a glass
// back button at the left, the title centered, a glass action at the right; the timeline's title
// large at the left instead. iOS and Android hide their system header (`headerVisible={false}`),
// which keeps the swipe back.
import { type JSX, Text, View } from "nsh";
import { Button, NavPage } from "nsh/base";
import { t } from "nsh/i18n";
import { nav } from "../nav";
import { Icon } from "./Icon";

/** The glass of the header's buttons: a frosted circle (or capsule) with a hairline and a soft shadow. */
export const GLASS =
  "bg-glass backdrop-blur-xl shadow-[0_0_0_0.5px_#0000001a,0_4px_14px_#0000000f] dark:shadow-[0_0_0_0.5px_#ffffff1f,0_4px_14px_#00000040]";

/** A glass circle holding an icon, 44 points (`size`: another). Without `onPress` it is a
 * popover's or menu's trigger, which takes the press itself. */
export function GlassButton(props: {
  label: string;
  onPress?: () => void;
  children: JSX.Element;
  selected?: boolean;
  size?: string;
}) {
  const cls = () => `${props.size ?? "size-11"} items-center justify-center rounded-full active:opacity-70 ${GLASS}`;
  return (
    <If
      when={props.onPress}
      else={
        <View role="button" accessibilityLabel={props.label} class={cls()}>
          {props.children}
        </View>
      }
    >
      <Button accessibilityLabel={props.label} selected={props.selected} onPress={props.onPress} class={cls()}>
        {props.children}
      </Button>
    </If>
  );
}

export function BackButton() {
  return (
    <GlassButton label={t("common.back")} onPress={() => nav.pop()}>
      <Icon name="chevron-left" class="size-6 tint-ink" />
    </GlassButton>
  );
}

/** The bar under the status bar: back, the title centered over the whole width, an action. */
export function Header(props: { title: string; right?: JSX.Element }) {
  return (
    <View class="h-[54px] flex-row items-center justify-between px-4">
      <View class="pointer-events-none absolute inset-y-0 left-20 right-20 items-center justify-center">
        <Text class="text-center text-headline font-semibold text-ink line-clamp-1">{props.title}</Text>
      </View>
      <If when={nav.routes().length > 1} else={<View />}>
        <BackButton />
      </If>
      {props.right ?? <View />}
    </View>
  );
}

/** The timeline's header: the title large at the left, an action at the right. */
export function LargeHeader(props: { title: string; right?: JSX.Element }) {
  return (
    <View class="flex-row items-end justify-between pb-2.5 pl-5 pr-4 pt-1.5">
      <Text class="text-large-title font-bold tracking-tight text-ink">{props.title}</Text>
      {props.right}
    </View>
  );
}

/** A page of the stack with the app's header over its content. */
export function Page(props: {
  title: string;
  /** The timeline's large title. */
  large?: boolean;
  right?: JSX.Element;
  children?: JSX.Element;
}) {
  return (
    <NavPage title={props.title} headerVisible={false} class="bg-ground">
      <View class="flex-1 bg-ground pt-[env(safe-area-inset-top)]">
        <If when={props.large} else={<Header title={props.title} right={props.right} />}>
          <LargeHeader title={props.title} right={props.right} />
        </If>
        {props.children}
      </View>
    </NavPage>
  );
}
