// The page shell: the app draws its own header on every platform, as the design has it: a glass
// back button at the left, the title centered, a glass action at the right; the timeline's title
// large at the left instead. iOS and Android hide their system header (`headerVisible={false}`),
// which keeps the swipe back.
//
// The header floats: a page's list starts below it and scrolls under it, its glass over the posts
// (`createPageScroll`). Once something is under it, a soft edge (the page's ground fading out over
// a blur) keeps the title and the status bar legible; a large title scrolls away with the list and
// the bar shows it small. The pull-to-refresh indicator is the app's, under the header, the same on
// every platform.
import { type AnimatedValue, createAnimatedValue, type JSX, safeArea, Text, token, View } from "nsh";
import { Button, NavPage } from "nsh/base";
import { t } from "nsh/i18n";
import { nav } from "../nav";
import { GLASS_PRESS, type GlassKind, glass } from "./Glass";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";

/** A glass circle holding an icon, 44 points (`size`: another): Liquid Glass where the system
 * draws it, the design's frosted circle elsewhere (`Glass.ts`). Without `onPress` it is a
 * popover's or menu's trigger, which takes the press itself. */
export function GlassButton(props: {
  label: string;
  onPress?: () => void;
  children: JSX.Element;
  selected?: boolean;
  size?: string;
  /** Its glass: the header's (`"control"`, the default), or `"media"` over pictures and video. */
  kind?: GlassKind;
}) {
  const look = glass(props.kind ?? "control");
  const cls = () => `${props.size ?? "size-11"} items-center justify-center rounded-full ${GLASS_PRESS} ${look.class}`;
  return (
    <If
      when={props.onPress}
      else={
        <View role="button" accessibilityLabel={props.label} class={cls()} style={look.style}>
          {props.children}
        </View>
      }
    >
      <Button
        accessibilityLabel={props.label}
        selected={props.selected}
        onPress={props.onPress}
        class={cls()}
        style={look.style}
      >
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

/** The bar's height; a large title's row is as tall. */
export const BAR = 54;
const LARGE_ROW = 57;
/** How far the edge fades out below the header. */
const EDGE_FADE = 20;
/** The room the pull-to-refresh indicator takes under the header while it refreshes. */
const PULL = 44;

/** A page's list under its floating header: create one per page, give it to `Page` (`scroll`)
 * and spread `list()` into the page's `List`. */
export interface PageScroll {
  /** The title is large, at the top of the list (`LargeTitle`), and shows in the bar once it
   * scrolled away. */
  readonly large: boolean;
  /** The height of what shows under the bar (`Page`'s `accessory`). */
  readonly accessory: number;
  /** Whether the list is refreshing, for a list the user pulls to refresh. */
  readonly refreshing?: () => boolean;
  /** The list's scroll offset, fed natively: `-inset()` at its top. */
  readonly offset: AnimatedValue;
  /** How far the list is pulled past its top, fed natively. */
  readonly pull: AnimatedValue;
  /** The room the header takes over the top of the page (the status bar's included). */
  inset(): number;
  /** The list's props: it starts under the header and scrolls under it; a list that refreshes
   * draws the page's indicator. */
  list(): {
    contentInset: { top: number };
    contentOffset: { y: number };
    scrollValue: AnimatedValue;
    pullValue: AnimatedValue;
    refreshIndicator?: { height: number };
  };
}

export function createPageScroll(options: { large?: boolean; accessory?: number; refreshing?: () => boolean } = {}): PageScroll {
  const offset = createAnimatedValue(0);
  const pull = createAnimatedValue(0);
  const large = options.large ?? false;
  const accessory = options.accessory ?? 0;
  // A large title is the list's first row, the bar's action beside it: the list starts at the
  // status bar.
  const inset = () => safeArea().top + (large ? 0 : BAR) + accessory;
  return {
    large,
    accessory,
    refreshing: options.refreshing,
    offset,
    pull,
    inset,
    list: () => ({
      contentInset: { top: inset() },
      contentOffset: { y: -inset() },
      scrollValue: offset,
      pullValue: pull,
      ...(options.refreshing ? { refreshIndicator: { height: PULL } } : {}),
    }),
  };
}

/** The bar under the status bar: back, the title centered over the whole width (unless
 * `hideTitle`), an action. */
export function Header(props: { title: string; hideTitle?: boolean; right?: JSX.Element }) {
  return (
    <View class="h-[54px] flex-row items-center justify-between px-4">
      <If when={!props.hideTitle}>
        <View class="pointer-events-none absolute inset-y-0 left-20 right-20 items-center justify-center">
          <Text class="text-center text-headline font-semibold text-ink line-clamp-1">{props.title}</Text>
        </View>
      </If>
      <If when={nav.routes().length > 1} else={<View />}>
        <BackButton />
      </If>
      {props.right ?? <View />}
    </View>
  );
}

/** The timeline's title, large at the left: the first row of its list, which scrolls it away. Its
 * row is as tall as the bar's action beside it. */
export function LargeTitle(props: { title: string }) {
  return (
    <View class="h-[57px] flex-row items-end pb-2.5 pl-5 pr-4">
      <Text role="header" class="text-large-title font-bold tracking-tight text-ink">
        {props.title}
      </Text>
    </View>
  );
}

/** The bar of a page with a large title: its action at the right, level with the title; the title
 * small in the middle once the large one scrolled under it. */
function LargeBar(props: { title: string; right?: JSX.Element; scroll: PageScroll }) {
  const top = () => -props.scroll.inset();
  return (
    <View class="h-[57px] flex-row items-end justify-end pb-2.5 pr-4">
      <View
        class="pointer-events-none absolute inset-x-20 top-0 h-[54px] items-center justify-center"
        style={{ opacity: props.scroll.offset.interpolate({ inputRange: [top() + 36, top() + LARGE_ROW], outputRange: [0, 1] }) }}
      >
        <Text class="text-center text-headline font-semibold text-ink line-clamp-1">{props.title}</Text>
      </View>
      {props.right}
    </View>
  );
}

/** Behind the header, once the list is under it: the page's ground fading out over a blur that
 * fades out too, so the title and the status bar stay legible over the posts. */
function ScrollEdge(props: { scroll: PageScroll; height: number }) {
  const top = () => -props.scroll.inset();
  const ground = () => token("ground").slice(0, 7);
  return (
    <View
      class="pointer-events-none absolute inset-x-0 top-0 backdrop-blur-md"
      style={{
        height: props.height + EDGE_FADE,
        opacity: props.scroll.offset.interpolate({ inputRange: [top(), top() + 12], outputRange: [0, 1] }),
        backgroundImage: `linear-gradient(to bottom, ${ground()}F2 0%, ${ground()}E0 70%, ${ground()}00 100%)`,
        maskImage: "linear-gradient(to bottom, #000 0%, #000 70%, #0000 100%)",
      }}
    />
  );
}

/** The pull-to-refresh indicator under the header: a ring that turns as the list is pulled, and
 * spins while it refreshes. */
function PullIndicator(props: { scroll: PageScroll; refreshing: () => boolean }) {
  const pull = props.scroll.pull;
  return (
    <View
      class="pointer-events-none absolute inset-x-0 items-center justify-center"
      style={{
        top: props.scroll.inset(),
        height: PULL,
        opacity: pull.interpolate({ inputRange: [8, PULL - 8], outputRange: [0, 1] }),
      }}
    >
      <If
        when={props.refreshing()}
        else={
          <View
            class="size-6 rounded-full border-2 border-hairline border-t-weibo"
            style={{ transform: [{ rotate: pull.interpolate({ inputRange: [0, PULL * 2], outputRange: ["0deg", "360deg"], extrapolate: "extend" }) }] }}
          />
        }
      >
        <Spinner />
      </If>
    </View>
  );
}

/** A page of the stack with the app's header over its content. With `scroll`, its list fills the
 * page and scrolls under the header (`createPageScroll`); without, the content starts below the
 * header. */
export function Page(props: {
  title: string;
  /** No title in the header (the page names itself below it); the page keeps it for the system. */
  hideTitle?: boolean;
  right?: JSX.Element;
  /** The page's list under the header; its `large` gives the page a large title. */
  scroll?: PageScroll;
  /** Under the bar, floating with it (People's segments): `scroll.accessory` points tall. */
  accessory?: JSX.Element;
  children?: JSX.Element;
}) {
  const header = () => safeArea().top + (props.scroll?.large ? LARGE_ROW : BAR) + (props.scroll?.accessory ?? 0);
  return (
    <NavPage title={props.title} headerVisible={false} class="bg-ground">
      <View class="flex-1 bg-ground">
        <If when={props.scroll} else={<View class="flex-1" style={{ paddingTop: safeArea().top + BAR }}>{props.children}</View>}>
          {(scroll) => (
            <>
              {props.children}
              <ScrollEdge scroll={scroll()} height={header()} />
              <If when={scroll().refreshing}>
                {(refreshing) => <PullIndicator scroll={scroll()} refreshing={refreshing()} />}
              </If>
            </>
          )}
        </If>
        <View class="absolute inset-x-0" style={{ top: safeArea().top }}>
          <If when={props.scroll?.large} else={<Header title={props.title} hideTitle={props.hideTitle} right={props.right} />}>
            <LargeBar title={props.title} right={props.right} scroll={props.scroll!} />
          </If>
          {props.accessory}
        </View>
      </View>
    </NavPage>
  );
}
