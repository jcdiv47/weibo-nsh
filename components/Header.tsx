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
import {
  type AnimatedValue,
  createAnimatedValue,
  type JSX,
  type ListRef,
  reduceMotion,
  safeArea,
  signal,
  Text,
  token,
  View,
} from "nsh";
import { Button, NavPage } from "nsh/base";
import { t } from "nsh/i18n";
import { sidebarShown } from "../layout";
import { detail, PageStack, WIDE } from "../nav";
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
  const kind = props.kind ?? "control";
  // The Mac's toolbar has plain buttons, shaded under the pointer, their icons a little smaller.
  if (WIDE && kind === "control") return <ToolbarButton {...props} />;
  const look = glass(kind);
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

/** A button of the Mac's toolbar: 32 points, shaded under the pointer and while pressed; its
 * icon, drawn for the phone's 44-point circle, at four fifths. */
function ToolbarButton(props: { label: string; onPress?: () => void; children: JSX.Element; selected?: boolean }) {
  const cls = "size-8 items-center justify-center rounded-lg hover:bg-menu-press active:bg-menu-press";
  const icon = <View style={{ transform: [{ scale: 0.8 }] }}>{props.children}</View>;
  return (
    <If when={props.onPress} else={<View role="button" accessibilityLabel={props.label} tooltip={props.label} class={cls}>{icon}</View>}>
      <Button accessibilityLabel={props.label} tooltip={props.label} selected={props.selected} onPress={props.onPress} class={cls}>
        {icon}
      </Button>
    </If>
  );
}

/** Back, in the stack of the page it is on (the Mac's list or detail column). */
export function BackButton() {
  const stack = PageStack();
  return (
    <GlassButton label={t("common.back")} onPress={() => stack.pop()}>
      <Icon name="chevron-left" class="size-6 tint-ink" />
    </GlassButton>
  );
}

/** The bar's height; a large title's row is as tall. The Mac's toolbar's. */
export const BAR = WIDE ? 52 : 54;
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
  /** Refreshes the list: with it, the page has a button centered at its bottom that scrolls the list
   * back to its top, or refreshes it when it is there (`TopButton`). */
  readonly refresh?: () => void;
  /** The list's scroll offset, fed natively: `-inset()` at its top. */
  readonly offset: AnimatedValue;
  /** How far the list is pulled past its top, fed natively. */
  readonly pull: AnimatedValue;
  /** The room the header takes over the top of the page (the status bar's included). */
  inset(): number;
  /** Scrolls the list back to its top; refreshes it (`refresh`) when it is there already. */
  toTop(): Promise<void>;
  /** The top button's presence, 0 to 1: it goes while the user scrolls the list and comes back
   * once the list rests (`TOP_BUTTON_REST_MS`). */
  readonly topShown: AnimatedValue;
  /** Whether the top button takes presses: not while it is gone or going. */
  topPressable(): boolean;
  /** The list's props: it starts under the header and scrolls under it; a list that refreshes
   * draws the page's indicator. */
  list(): {
    contentInset: { top: number };
    contentOffset: { y: number };
    scrollValue: AnimatedValue;
    pullValue: AnimatedValue;
    refreshIndicator?: { height: number };
    ref: (list: ListRef) => void;
    onScrollDragStart?: () => void;
    onScrollDragEnd?: () => void;
    onMomentumStart?: () => void;
    onMomentumEnd?: () => void;
  };
}

/** How near its top, in points, the list counts as there: a press of the top button refreshes. */
const AT_TOP = 4;
/** How long the list rests before the top button comes back. */
const TOP_BUTTON_REST_MS = 300;
/** How quickly the top button goes as a scroll starts: out of the way at once. */
const TOP_BUTTON_HIDE_MS = 140;

export function createPageScroll(
  options: { large?: boolean; accessory?: number; refreshing?: () => boolean; refresh?: () => void } = {},
): PageScroll {
  const offset = createAnimatedValue(0);
  const pull = createAnimatedValue(0);
  const large = !WIDE && (options.large ?? false);
  const accessory = options.accessory ?? 0;
  // A large title is the list's first row, the bar's action beside it: the list starts at the
  // status bar. The Mac's toolbar has no status bar over it.
  const inset = () => (WIDE ? 0 : safeArea().top) + (large ? 0 : BAR) + accessory;
  let ref: ListRef | undefined;
  // The top button: gone while a finger or a fling moves the list, back once it rests. A press on
  // the button scrolls without a drag, so the button stays to show the arrow turn to refresh.
  const topShown = createAnimatedValue(1);
  const pressable = signal(true);
  let rest: ReturnType<typeof setTimeout> | undefined;
  const hideTop = () => {
    clearTimeout(rest);
    pressable.set(false);
    topShown.timing(0, { duration: TOP_BUTTON_HIDE_MS, easing: "easeOut" });
  };
  const showTopSoon = () => {
    clearTimeout(rest);
    rest = setTimeout(() => {
      pressable.set(true);
      if (reduceMotion()) topShown.timing(1, { duration: 200, easing: "easeOut" });
      else topShown.spring(1, { stiffness: 320, damping: 28, mass: 1 });
    }, TOP_BUTTON_REST_MS);
  };
  const topEvents = options.refresh
    ? { onScrollDragStart: hideTop, onScrollDragEnd: showTopSoon, onMomentumStart: hideTop, onMomentumEnd: showTopSoon }
    : {};
  return {
    large,
    accessory,
    refreshing: options.refreshing,
    refresh: options.refresh,
    offset,
    pull,
    inset,
    topShown,
    topPressable: () => pressable(),
    async toTop() {
      const top = -inset();
      if ((await offset.getValue()) > top + AT_TOP) ref?.scrollTo({ y: top, animated: true });
      else if (!options.refreshing?.()) options.refresh?.();
    },
    list: () => ({
      contentInset: { top: inset() },
      contentOffset: { y: -inset() },
      scrollValue: offset,
      pullValue: pull,
      ...(options.refreshing ? { refreshIndicator: { height: PULL } } : {}),
      ref: (list: ListRef) => {
        ref = list;
      },
      ...topEvents,
    }),
  };
}

/** The bar under the status bar: back, the title centered over the whole width (unless
 * `hideTitle`), an action. */
export function Header(props: { title: string; hideTitle?: boolean; right?: JSX.Element }) {
  const stack = PageStack();
  return (
    <View class="h-[54px] flex-row items-center justify-between px-4">
      <If when={!props.hideTitle}>
        <View class="pointer-events-none absolute inset-y-0 left-20 right-20 items-center justify-center">
          <Text class="text-center text-headline font-semibold text-ink line-clamp-1">{props.title}</Text>
        </View>
      </If>
      <If when={stack.routes().length > 1} else={<View />}>
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

/** Over the page's list, centered at its bottom, just above the home indicator's area: an arrow up
 * while the list is scrolled away from its top, which scrolls it back there, and the refresh glyph
 * once it is at the top, which refreshes it. The two cross-fade with the list's offset, natively.
 * While the list scrolls it fades, sinks and shrinks a little out of the way, and springs back once
 * the list rests (only fading with reduced motion). */
function TopButton(props: { scroll: PageScroll }) {
  const top = () => -props.scroll.inset();
  const away = () => props.scroll.offset.interpolate({ inputRange: [top() + AT_TOP, top() + 48], outputRange: [0, 1] });
  const shown = props.scroll.topShown;
  const motion = () =>
    reduceMotion()
      ? []
      : [
          { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
        ];
  return (
    <View
      class="absolute inset-x-0 items-center"
      style={{
        bottom: safeArea().bottom + 6,
        pointerEvents: props.scroll.topPressable() ? "box-none" : "none",
        opacity: shown,
        transform: motion(),
      }}
    >
      <GlassButton label={t("timeline.top")} onPress={() => void props.scroll.toTop()}>
        <View class="size-[22px]">
          <View class="absolute inset-0" style={{ opacity: away().interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
            <Icon name="refresh" class="size-[22px] tint-ink" />
          </View>
          <View class="absolute inset-0" style={{ opacity: away() }}>
            <Icon name="arrow-up" class="size-[22px] tint-ink" />
          </View>
        </View>
      </GlassButton>
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
  /** The bar itself, `BAR` points tall, instead of back, title and action (search's field). */
  bar?: JSX.Element;
  children?: JSX.Element;
}) {
  if (WIDE) return <ColumnPage {...props} />;
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
              <If when={scroll().refresh}>
                <TopButton scroll={scroll()} />
              </If>
            </>
          )}
        </If>
        <View class="absolute inset-x-0" style={{ top: safeArea().top }}>
          <If when={props.bar} else={
            <If when={props.scroll?.large} else={<Header title={props.title} hideTitle={props.hideTitle} right={props.right} />}>
              <LargeBar title={props.title} right={props.right} scroll={props.scroll!} />
            </If>
          }>
            {props.bar}
          </If>
          {props.accessory}
        </View>
      </View>
    </NavPage>
  );
}

/** The Mac's toolbar: back (in a pushed page), the title, the refresh of a list that refreshes,
 * the page's buttons. Dragging it moves the window. */
function Toolbar(props: { title: string; right?: JSX.Element; scroll?: PageScroll }) {
  const stack = PageStack();
  return (
    <View desktop={{ windowDrag: true }} class="flex-row items-center gap-1 px-3" style={{ height: BAR }}>
      <If when={stack.routes().length > 1} else={<View class="w-2" />}>
        <BackButton />
      </If>
      <Text role="header" class="ml-1 flex-1 text-[15px] font-bold tracking-tight text-ink line-clamp-1">
        {props.title}
      </Text>
      <If when={props.scroll?.refresh ? props.scroll : undefined}>{(scroll) => <RefreshButton scroll={scroll()} />}</If>
      <View class="flex-row items-center gap-1">{props.right}</View>
    </View>
  );
}

/** The toolbar's refresh: an arrow up while the list is scrolled away from its top, which scrolls
 * it back, the refresh glyph at the top, which refreshes it, and the spinner while it does. */
function RefreshButton(props: { scroll: PageScroll }) {
  const top = () => -props.scroll.inset();
  const away = () => props.scroll.offset.interpolate({ inputRange: [top() + AT_TOP, top() + 48], outputRange: [0, 1] });
  return (
    <If
      when={!props.scroll.refreshing?.()}
      else={
        <View class="size-8 items-center justify-center">
          <View style={{ transform: [{ scale: 0.75 }] }}>
            <Spinner />
          </View>
        </View>
      }
    >
      <GlassButton label={t("timeline.top")} onPress={() => void props.scroll.toTop()}>
        <View class="size-[22px]">
          <View class="absolute inset-0" style={{ opacity: away().interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
            <Icon name="refresh" class="size-[22px] tint-ink-2" />
          </View>
          <View class="absolute inset-0" style={{ opacity: away() }}>
            <Icon name="arrow-up" class="size-[22px] tint-ink-2" />
          </View>
        </View>
      </GlassButton>
    </If>
  );
}

/** The room the traffic lights take at the window's left, over the list column's bar while the
 * sidebar is hidden. */
const TRAFFIC_LIGHTS = 72;

/** A page of one of the Mac's columns: the toolbar over it (or the page's own bar, search's
 * field), opaque, with what goes under it (People's segments); the list scrolls below it. */
function ColumnPage(props: {
  title: string;
  right?: JSX.Element;
  scroll?: PageScroll;
  accessory?: JSX.Element;
  bar?: JSX.Element;
  children?: JSX.Element;
}) {
  const stack = PageStack();
  const inList = stack !== detail;
  const lights = () => (inList && !sidebarShown() ? TRAFFIC_LIGHTS : 0);
  // The post column's first page (a post a list's press chose) shows in place of the one before,
  // with no slide: choosing another post is not going deeper. Pages over it still slide in.
  const first = !inList && detail.routes().length <= 1;
  return (
    <NavPage title={props.title} headerVisible={false} animation={first ? "none" : undefined} class="bg-ground">
      <View class="flex-1 bg-ground">
        <If when={props.scroll} else={<View class="flex-1" style={{ paddingTop: BAR }}>{props.children}</View>}>
          {(scroll) => (
            <>
              {props.children}
              <If when={scroll().refreshing}>
                {(refreshing) => <PullIndicator scroll={scroll()} refreshing={refreshing()} />}
              </If>
            </>
          )}
        </If>
        <View class="absolute inset-x-0 top-0 border-b-[0.5px] border-hairline bg-ground">
          <View desktop={{ windowDrag: true }} style={{ paddingLeft: lights() }}>
            <If when={props.bar} else={<Toolbar title={props.title} right={props.right} scroll={props.scroll} />}>
              {props.bar}
            </If>
          </View>
          {props.accessory}
        </View>
      </View>
    </NavPage>
  );
}
