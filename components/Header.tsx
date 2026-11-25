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
  cleanup,
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
import { nav } from "../nav";
import type { News } from "../news";
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
  const look = () => glass(props.kind ?? "control");
  const cls = () => `${props.size ?? "size-11"} items-center justify-center rounded-full ${GLASS_PRESS} ${look().class}`;
  return (
    <If
      when={props.onPress}
      else={
        <View role="button" accessibilityLabel={props.label} class={cls()} style={look().style}>
          {props.children}
        </View>
      }
    >
      <Button
        accessibilityLabel={props.label}
        selected={props.selected}
        onPress={props.onPress}
        class={cls()}
        style={look().style}
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
/** How far the large title follows the system's text size: its 41 points of line (34 at 1.206)
 * fit the row's 47 above its bottom padding up to this scale. */
const LARGE_TITLE_MAX_SCALE = 1.14;
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
  /** New items found above the list's first (`news.ts`): the button counts them instead, and a
   * press shows them at the top. */
  readonly news?: News;
  /** The list's scroll offset, fed natively: `-inset()` at its top. */
  readonly offset: AnimatedValue;
  /** How far the list is pulled past its top, fed natively. */
  readonly pull: AnimatedValue;
  /** The room the header takes over the top of the page (the status bar's included). */
  inset(): number;
  /** Scrolls the list back to its top, showing the new items there (`news`) if there are any;
   * refreshes it (`refresh`) when it is there already and there are none. */
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
/** The longest the top button waits for the list to reach its top before it shows new items. */
const SCROLL_WAIT_MS = 1500;
/** How long the list rests before the top button comes back. */
const TOP_BUTTON_REST_MS = 300;
/** How quickly the top button goes as a scroll starts: out of the way at once. */
const TOP_BUTTON_HIDE_MS = 140;

/** Call it in a page's body: the page's going away cancels its timer. */
export function createPageScroll(
  options: { large?: boolean; accessory?: number; refreshing?: () => boolean; refresh?: () => void; news?: News } = {},
): PageScroll {
  const offset = createAnimatedValue(0);
  const pull = createAnimatedValue(0);
  const large = options.large ?? false;
  const accessory = options.accessory ?? 0;
  // A large title is the list's first row, the bar's action beside it: the list starts at the
  // status bar.
  const inset = () => safeArea().top + (large ? 0 : BAR) + accessory;
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
  // Called in a page's body: a page popped while its list rests brings no button back.
  cleanup(() => clearTimeout(rest));
  const topEvents = options.refresh
    ? { onScrollDragStart: hideTop, onScrollDragEnd: showTopSoon, onMomentumStart: hideTop, onMomentumEnd: showTopSoon }
    : {};
  return {
    large,
    accessory,
    refreshing: options.refreshing,
    refresh: options.refresh,
    news: options.news,
    offset,
    pull,
    inset,
    topShown,
    topPressable: () => pressable(),
    async toTop() {
      const top = -inset();
      if (options.news?.count()) {
        // The list scrolls to its top first, and the new items go in once it is there: rows put in
        // above the viewport while it scrolls are measured on the way, which shifts the content
        // under the scroll and leaves it short of the top.
        const news = options.news;
        if ((await offset.getValue()) > top + AT_TOP) {
          ref?.scrollTo({ y: top, animated: true });
          for (let waited = 0; waited < SCROLL_WAIT_MS && (await offset.getValue()) > top + AT_TOP; waited += 16) {
            await new Promise((done) => setTimeout(done, 16));
          }
        }
        news.show();
      } else if ((await offset.getValue()) > top + AT_TOP) ref?.scrollTo({ y: top, animated: true });
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
 * row is as tall as the bar's action beside it, and the header's scroll math counts on that
 * (`LARGE_ROW`), so the title grows with the system's text size only as far as the row holds it. */
export function LargeTitle(props: { title: string }) {
  return (
    <View class="h-[57px] flex-row items-end pb-2.5 pl-5 pr-4">
      <Text role="header" maxFontSizeMultiplier={LARGE_TITLE_MAX_SCALE} class="text-large-title font-bold tracking-tight text-ink">
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
          <Spinner
            accessibilityLabel={null}
            turn={{ transform: [{ rotate: pull.interpolate({ inputRange: [0, PULL * 2], outputRange: ["0deg", "360deg"], extrapolate: "extend" }) }] }}
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
 * While new posts wait above the list (`news`), a capsule counting them takes the circle's place,
 * wherever the list is: a press scrolls to the top and shows them there.
 * While the list scrolls it fades, sinks and shrinks a little out of the way, and springs back once
 * the list rests (only fading with reduced motion). */
function TopButton(props: { scroll: PageScroll }) {
  const top = () => -props.scroll.inset();
  // The refresh glyph shows at the top and the arrow away from it, each read from the offset once.
  const fadeWith = (outputRange: [number, number]) =>
    props.scroll.offset.interpolate({ inputRange: [top() + AT_TOP, top() + 48], outputRange });
  const refreshOpacity = () => fadeWith([1, 0]);
  const arrowOpacity = () => fadeWith([0, 1]);
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
      <If
        when={props.scroll.news?.count()}
        else={
          <GlassButton label={t("timeline.top")} onPress={() => void props.scroll.toTop()}>
            <View class="size-[22px]">
              <View class="absolute inset-0" style={{ opacity: refreshOpacity() }}>
                <Icon name="refresh" class="size-[22px] tint-ink" />
              </View>
              <View class="absolute inset-0" style={{ opacity: arrowOpacity() }}>
                <Icon name="arrow-up" class="size-[22px] tint-ink" />
              </View>
            </View>
          </GlassButton>
        }
      >
        {(count) => (
          <NewsButton count={count()} more={!!props.scroll.news?.more()} onPress={() => void props.scroll.toTop()} />
        )}
      </If>
    </View>
  );
}

/** The capsule counting the new posts: the count in the brand's ink, "new posts" after it ("20+"
 * when more may be past those counted). */
function NewsButton(props: { count: number; more: boolean; onPress: () => void }) {
  const look = () => glass("control");
  const n = () => `${props.count}${props.more ? "+" : ""}`;
  return (
    <Button
      accessibilityLabel={t("timeline.news_label", { n: n() })}
      onPress={props.onPress}
      class={`h-11 flex-row items-center gap-1.5 rounded-full px-[18px] ${GLASS_PRESS} ${look().class}`}
      style={look().style}
    >
      <Text class="text-body font-bold text-weibo-ink">{n()}</Text>
      <Text class="text-body font-semibold text-ink">
        {props.count === 1 && !props.more ? t("timeline.news_one") : t("timeline.news_many")}
      </Text>
    </Button>
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
