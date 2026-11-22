// One post: author, text, pictures, the post it reposts, counts. Pressing the author opens
// their profile, a picture the viewer, a video the player, the reposted post that post, elsewhere
// the post's comments; its repost count opens the box to repost it, its likes like it.
// An edited post says so; on its own page, its versions open from below it.
import { Image, type JSX, signal, Text, View } from "nsh";
import { t } from "nsh/i18n";
import { type Activity, likeStatus, type Pic, type Status, type User, type VerifiedKind, type Video } from "../api";
import { count, relativeTime, timeAgo } from "../format";
import { openEdits, opening, openPost, openProfile } from "../nav";
import { Icon, type IconName } from "./Icon";
import { openViewer } from "./ImageViewer";
import { openRepostStatus } from "./ReplySheet";
import { RichText } from "./RichText";
import { openVideo } from "./VideoPlayer";

/** The badge's color for each kind of verification, as Weibo colors its V's. */
const VERIFIED_TINT: Record<VerifiedKind, string> = {
  personal: "tint-v-personal",
  gold: "tint-v-gold",
  org: "tint-v-org",
  talent: "tint-v-talent",
};

const AVATAR = {
  sm: { box: "size-8", badge: "size-3", ring: "size-3.5 -bottom-px -right-px" },
  md: { box: "size-10", badge: "size-3.5", ring: "size-4 -bottom-px -right-px" },
  person: { box: "size-11", badge: "size-[15px]", ring: "size-[17px] -bottom-px -right-px" },
  lg: { box: "size-[72px]", badge: "size-5", ring: "size-[22px] bottom-0 right-0" },
};

/** `still`: not a link to the profile (on the profile itself). A verified account's picture has
 * Weibo's badge for its kind of verification at its bottom right. */
export function Avatar(props: { user: User; size?: keyof typeof AVATAR; still?: boolean }) {
  const s = () => AVATAR[props.size ?? "md"];
  const kind = () => (props.user.verified ? (props.user.verifiedKind ?? "personal") : undefined);
  return (
    <View
      role={props.still ? undefined : "button"}
      accessibilityLabel={props.user.verified ? `${props.user.name}, ${props.user.verified}` : props.user.name}
      onPress={props.still ? undefined : () => openProfile(props.user.id)}
      class={`${s().box} shrink-0 active:opacity-70`}
    >
      <View class="size-full overflow-hidden rounded-full bg-well">
        <If when={props.user.avatar}>
          <Image src={props.user.avatar} class="size-full object-cover" />
        </If>
      </View>
      <If when={kind()}>
        {(k) => (
          <View class={`absolute items-center justify-center rounded-full bg-ground ${s().ring}`}>
            <Icon name="circle-check-filled" class={`${s().badge} ${VERIFIED_TINT[k()]}`} />
          </View>
        )}
      </If>
    </View>
  );
}

/** Rows of `n`, the last one short. */
const rows = <T,>(list: T[], n: number) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/**
 * One picture shows large; several in rows of three across the width, at most nine. `small`:
 * comments' and versions', at a fixed size.
 */
export function Pictures(props: { pics: Status["pics"]; small?: boolean }) {
  const shown = () => props.pics.slice(0, 9);
  const pic = (p: Pic, i: number, cls: string) => (
    <View
      role="button"
      accessibilityLabel={t("post.picture", { i: i + 1, n: props.pics.length })}
      onPress={() => openViewer(props.pics, i)}
      class={`${cls} overflow-hidden rounded-pic bg-well active:opacity-80`}
    >
      <Image src={p.thumb} class="size-full object-cover" />
    </View>
  );
  return (
    <If when={props.pics.length}>
      <If
        when={!props.small && props.pics.length > 1}
        else={
          <View class="flex-row flex-wrap gap-1">
            <Each of={shown()}>
              {(p, i) => pic(p(), i(), props.small ? (props.pics.length === 1 ? "size-32" : "size-24") : "size-56")}
            </Each>
          </View>
        }
      >
        <View class="gap-1">
          <Each of={rows(shown(), 3)}>
            {(row, r) => (
              <View class="flex-row gap-1">
                {/* The cell takes a third of the row, the picture in it its width and as much
                    height: an aspect ratio on the `flex-1` cell itself lays out with no height. */}
                <Each of={[0, 1, 2]}>
                  {(c) => (
                    <View class="flex-1">
                      <If when={row()[c()]}>{(p) => pic(p(), r() * 3 + c(), "aspect-square w-full")}</If>
                    </View>
                  )}
                </Each>
              </View>
            )}
          </Each>
        </View>
      </If>
    </If>
  );
}

function VideoCard(props: { video: Video; status: Status }) {
  const v = () => props.video;
  const length = () => {
    const d = Math.round(v().duration);
    return d ? `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}` : "";
  };
  return (
    <View
      role="button"
      accessibilityLabel={t("post.play_video", { title: v().title })}
      onPress={() => openVideo(v(), props.status)}
      class={`${v().portrait ? "h-72 w-52" : "aspect-video w-full"} overflow-hidden rounded-pic bg-black active:opacity-80`}
    >
      <If when={v().poster}>
        <Image src={v().poster} class="size-full object-cover" />
      </If>
      <View class="absolute inset-0 items-center justify-center">
        <View class="size-12 items-center justify-center rounded-full bg-black/55">
          <Icon name="player-play-filled" class="size-[22px] tint-white" />
        </View>
      </View>
      <If when={length()}>
        <Text class="absolute bottom-2 right-2 rounded-[4px] bg-black/55 px-1.5 py-0.5 text-xs text-white">{length()}</Text>
      </If>
    </View>
  );
}

// `selectable`: long-press selects the text. Not inside a pressable box: on iOS the text's
// selection gestures take the taps the box should get.
function Body(props: { status: Status; lines?: number; selectable?: boolean }) {
  return (
    <>
      <RichText
        text={props.status.text}
        links={props.status.links}
        pics={props.status.pics}
        onVideo={props.status.video ? () => openVideo(props.status.video!, props.status) : undefined}
        more={props.lines && props.status.isLongText ? t("post.full_text") : undefined}
        class={`${props.selectable ? "select-text " : ""}text-body text-ink ${props.lines === 8 ? "line-clamp-8" : props.lines === 6 ? "line-clamp-6" : ""}`}
      />
      <Pictures pics={props.status.pics} />
      <If when={props.status.video}>{(v) => <VideoCard video={v()} status={props.status} />}</If>
    </>
  );
}

// A post that is deleted or hidden from me (its author's visibility settings) comes without its
// author, whom `toUser` names "(unknown)".
const hasAuthor = (s: Status) => !!s.user.id && s.user.name !== "(unknown)";

/** The author's picture, name, and when, from where (and that it was edited) under it. */
export function Byline(props: { user: User; meta: string; edited?: boolean }) {
  return (
    <View class="flex-row items-center gap-2.5">
      <Avatar user={props.user} />
      <View class="flex-1 gap-px">
        <View role="button" onPress={() => openProfile(props.user.id)} class="self-start active:opacity-60">
          <Text class="text-body leading-5 font-semibold text-ink line-clamp-1">{props.user.name}</Text>
        </View>
        <View class="flex-row items-center gap-1">
          <Text class="shrink text-meta text-ink-2 line-clamp-1">{props.meta}</Text>
          <If when={props.edited}>
            <Text class="shrink-0 text-meta text-ink-2">·</Text>
            <Icon name="pencil" class="size-3 shrink-0 tint-ink-2" />
            <Text class="shrink-0 text-meta text-ink-2">{t("post.edited")}</Text>
          </If>
        </View>
      </View>
    </View>
  );
}

/**
 * Above a post the profile's account commented on or liked (not theirs, though among their
 * posts): what they did and when, its icon at the card's left edge.
 */
function ActivityLine(props: { activity: Activity }) {
  const a = () => props.activity;
  const text = () =>
    [t(a().kind === "comment" ? "post.activity_comment" : "post.activity_like"), a().at !== undefined && timeAgo(a().at!)]
      .filter(Boolean)
      .join(" · ");
  return (
    <View class="h-[18px] shrink-0 flex-row items-center gap-2.5">
      <Icon name={a().kind === "comment" ? "message-circle" : "thumb-up"} class="size-3.5 shrink-0 tint-ink-2" />
      <Text class="shrink text-meta font-medium text-ink-2 line-clamp-1">{text()}</Text>
    </View>
  );
}

/** Above a post the profile's account pinned to the top of their posts: a pin and "置顶", in
 * Weibo's orange, in the activity line's place. */
function PinnedLine() {
  return (
    <View class="h-[18px] shrink-0 flex-row items-center gap-2.5">
      <Icon name="pinned-filled" class="size-3.5 shrink-0 tint-weibo" />
      <Text class="shrink text-meta font-medium text-weibo line-clamp-1">{t("post.pinned")}</Text>
    </View>
  );
}

/**
 * A post. In a list (`full` unset) a press opens its page and its counts close it; on its page
 * (`full`) the text is selectable and its edit history and region close it instead. `trailing`:
 * at the counts' right end (my favorites: when it was saved).
 */
export function StatusCard(props: { status: Status; full?: boolean; trailing?: JSX.Element }) {
  const s = () => props.status;
  const meta = () =>
    [relativeTime(s().createdAt), s().source && t("post.via", { source: s().source }), !props.full && s().region]
      .filter(Boolean)
      .join(" · ");
  return (
    <View
      role={props.full ? undefined : "button"}
      onPress={props.full ? undefined : () => openPost(s())}
      class={`gap-2.5 px-4 pb-3 ${props.full ? "bg-ground pt-1" : `border-b-[0.5px] border-hairline ${s().activity || s().pinned ? "pt-2.5" : "pt-3.5"} active:bg-well ${opening() === s().id ? "bg-well" : "bg-ground"}`}`}
    >
      <If when={props.full ? undefined : s().activity}>{(a) => <ActivityLine activity={a()} />}</If>
      <If when={!props.full && s().pinned}>
        <PinnedLine />
      </If>
      <Byline user={s().user} meta={meta()} edited={!props.full && !!s().editCount} />
      <Body status={s()} lines={props.full ? undefined : 8} selectable={props.full} />
      <If when={s().retweeted}>
        {(rt) => (
          <View
            role="button"
            accessibilityLabel={hasAuthor(rt()) ? t("post.reposted_by", { name: rt().user.name }) : undefined}
            onPress={() => openPost(rt())}
            class="gap-1.5 rounded-well bg-well px-3 pb-3 pt-2.5 active:opacity-70"
          >
            <If when={hasAuthor(rt())}>
              <Text
                role="button"
                onPress={() => openProfile(rt().user.id)}
                class="self-start text-body leading-5 font-semibold text-link"
              >
                @{rt().user.name}
              </Text>
            </If>
            <Body status={rt()} lines={props.full ? undefined : 6} />
          </View>
        )}
      </If>
      {/* On the post's page: its edit history at the left, where it was sent from at the right. */}
      <If when={props.full && (s().editCount || s().region)}>
        <View class="flex-row items-center gap-3">
          <If when={s().editCount}>
            <View role="link" onPress={() => openEdits(s())} class="flex-row items-center gap-1 active:opacity-60">
              <Icon name="history" class="size-3.5 tint-ink-2" />
              <Text class="text-meta text-ink-2">{t("post.edit_history")}</Text>
            </View>
          </If>
          <View class="flex-1" />
          <If when={s().region}>
            <View class="flex-row items-center gap-1" accessibilityLabel={t("post.region", { region: s().region })}>
              <Icon name="map-pin" class="size-3.5 tint-ink-2" />
              <Text class="text-meta text-ink-2">{s().region}</Text>
            </View>
          </If>
        </View>
      </If>
      {/* On the post's page the tabs under it carry the counts. */}
      <If when={!props.full}>
        <View class="flex-row items-center pt-0.5">
          <Stat
            icon="repeat"
            n={s().reposts}
            label={t("post.reposts", { n: count(s().reposts) })}
            onPress={() => openRepostStatus(s())}
          />
          <Stat icon="message-circle" n={s().comments} label={t("post.comments", { n: count(s().comments) })} />
          <LikeStat status={s()} />
          <View class="flex-1 flex-row justify-end">{props.trailing}</View>
        </View>
      </If>
    </View>
  );
}

// Likes given or taken back here, by post id. The lists hold plain objects, and a recycled row
// shows another post: the row reads its post's like from here first.
const likeChanges = signal<Record<string, { liked: boolean; likes: number }>>({});
const likeOf = (s: Status) => likeChanges()[s.id] ?? { liked: s.liked, likes: s.likes };
const liking = new Set<string>();

/** Likes the post, or takes the like back, at once; if Weibo refuses, as it was. */
async function toggleLike(s: Status) {
  if (liking.has(s.id)) return;
  const before = likeChanges()[s.id];
  const was = likeOf(s);
  const now = { liked: !was.liked, likes: Math.max(0, was.likes + (was.liked ? -1 : 1)) };
  likeChanges.update((m) => ({ ...m, [s.id]: now }));
  liking.add(s.id);
  try {
    await likeStatus(s, now.liked);
    s.liked = now.liked;
    s.likes = now.likes;
  } catch {
    // As it was: no change of its own left, so the post's own counts show, fresh ones after a refresh.
    likeChanges.update(({ [s.id]: _, ...rest }) => (before ? { ...rest, [s.id]: before } : rest));
  } finally {
    liking.delete(s.id);
  }
}

/** The post's likes, a button that likes it or takes the like back; filled while liked. */
function LikeStat(props: { status: Status }) {
  const like = () => likeOf(props.status);
  return (
    <View
      role="button"
      accessibilityLabel={`${t(like().liked ? "comment.unlike" : "comment.like")}, ${t("post.likes", { n: count(like().likes) })}`}
      onPress={() => toggleLike(props.status)}
      hitSlop={8}
      class="w-[88px] shrink-0 flex-row items-center gap-[5px] active:opacity-60"
    >
      <Icon name={like().liked ? "thumb-up-filled" : "thumb-up"} class={`size-[18px] ${like().liked ? "tint-link" : "tint-ink-2"}`} />
      <If when={like().likes}>
        <Text class={`text-meta leading-4 ${like().liked ? "text-link" : "text-ink-2"}`}>{count(like().likes)}</Text>
      </If>
    </View>
  );
}

/**
 * A post's count: its icon, then the number (none for 0). `label` is what screen readers say.
 * `onPress`: a button (it takes the press from the card it is in).
 */
export function Stat(props: { icon: IconName; n: number; label: string; onPress?: () => void }) {
  return (
    <View
      role={props.onPress ? "button" : undefined}
      accessibilityLabel={props.label}
      onPress={props.onPress}
      hitSlop={props.onPress ? 8 : undefined}
      class={`w-[88px] shrink-0 flex-row items-center gap-[5px] ${props.onPress ? "active:opacity-60" : ""}`}
    >
      <Icon name={props.icon} class="size-[18px] tint-ink-2" />
      <If when={props.n}>
        <Text class="text-meta leading-4 text-ink-2">{count(props.n)}</Text>
      </If>
    </View>
  );
}
