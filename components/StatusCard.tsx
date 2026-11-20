// One post: author, text, pictures, the post it reposts, counts. Pressing the author opens
// their profile, a picture the viewer, a video the player, the reposted post that post, elsewhere
// the post's comments. An edited post says so; on its own page, its versions open from below it.
import { Image, Text, View } from "nsh";
import { t } from "nsh/i18n";
import type { Status, User, VerifiedKind, Video } from "../api";
import { count, relativeTime } from "../format";
import { openEdits, openPost, openProfile } from "../nav";
import { Icon, type IconName } from "./Icon";
import { openViewer } from "./ImageViewer";
import { RichText } from "./RichText";
import { openVideo } from "./VideoPlayer";

/** The badge's color for each kind of verification, as Weibo colors its V's. */
const VERIFIED_TINT: Record<VerifiedKind, string> = {
  personal: "tint-[#ffa200]",
  gold: "tint-[#ff5a1f]",
  org: "tint-[#2d9cf4]",
  talent: "tint-[#f0437a]",
};

/** `still`: not a link to the profile (on the profile itself). A verified account's picture has
 * Weibo's badge for its kind of verification at its bottom right. */
export function Avatar(props: { user: User; size?: "sm" | "md" | "lg"; still?: boolean }) {
  const size = () => (props.size === "lg" ? "size-16" : props.size === "sm" ? "size-8" : "size-10");
  const badge = () => (props.size === "lg" ? "size-5" : props.size === "sm" ? "size-3" : "size-3.5");
  const kind = () => (props.user.verified ? (props.user.verifiedKind ?? "personal") : undefined);
  return (
    <View
      role={props.still ? undefined : "button"}
      accessibilityLabel={props.user.verified ? `${props.user.name}, ${props.user.verified}` : props.user.name}
      onPress={props.still ? undefined : () => openProfile(props.user.id)}
      class={`${size()} shrink-0 active:opacity-70`}
    >
      <View class="size-full overflow-hidden rounded-full bg-muted">
        <If when={props.user.avatar}>
          <Image src={props.user.avatar} class="size-full object-cover" />
        </If>
      </View>
      <If when={kind()}>
        {(k) => (
          <View class={`absolute rounded-full bg-background ${props.size === "lg" ? "bottom-0 right-0 p-0.5" : "-bottom-px -right-px p-px"}`}>
            <Icon name="circle-check-filled" class={`${badge()} ${VERIFIED_TINT[k()]}`} />
          </View>
        )}
      </If>
    </View>
  );
}

export function Pictures(props: { pics: Status["pics"]; small?: boolean }) {
  // One picture shows large; several in a grid of three across, at most nine. `small`: comments'.
  return (
    <If when={props.pics.length}>
      <View class="flex-row flex-wrap gap-1">
        <Each of={props.pics.slice(0, 9)}>
          {(pic, i) => (
            <View
              role="button"
              accessibilityLabel={t("post.picture", { i: i() + 1, n: props.pics.length })}
              onPress={() => openViewer(props.pics, i())}
              class={`${props.small ? (props.pics.length === 1 ? "h-32 w-32" : "size-20") : props.pics.length === 1 ? "h-56 w-56" : "size-24"} overflow-hidden rounded-md bg-muted active:opacity-80`}
            >
              <Image src={pic().thumb} class="size-full object-cover" />
            </View>
          )}
        </Each>
      </View>
    </If>
  );
}

function VideoCard(props: { video: Video }) {
  const v = () => props.video;
  const length = () => {
    const d = Math.round(v().duration);
    return d ? `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}` : "";
  };
  return (
    <View
      role="button"
      accessibilityLabel={t("post.play_video", { title: v().title })}
      onPress={() => openVideo(v())}
      class={`${v().portrait ? "h-72 w-52" : "aspect-video w-full"} overflow-hidden rounded-md bg-black active:opacity-80`}
    >
      <If when={v().poster}>
        <Image src={v().poster} class="size-full object-cover" />
      </If>
      <View class="absolute inset-0 items-center justify-center">
        <View class="size-12 items-center justify-center rounded-full bg-black/55">
          <Icon name="player-play-filled" class="size-6 tint-white" />
        </View>
      </View>
      <If when={length()}>
        <Text class="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-xs text-white">{length()}</Text>
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
        onVideo={props.status.video ? () => openVideo(props.status.video!) : undefined}
        class={`${props.selectable ? "select-text " : ""}text-[15px] leading-6 text-foreground ${props.lines === 8 ? "line-clamp-8" : props.lines === 6 ? "line-clamp-6" : ""}`}
      />
      <Pictures pics={props.status.pics} />
      <If when={props.status.video}>{(v) => <VideoCard video={v()} />}</If>
    </>
  );
}

// A post that is deleted or hidden from me (its author's visibility settings) comes without its
// author, whom `toUser` names "(unknown)".
const hasAuthor = (s: Status) => !!s.user.id && s.user.name !== "(unknown)";

export function StatusCard(props: { status: Status; full?: boolean }) {
  const s = () => props.status;
  const meta = () =>
    [relativeTime(s().createdAt), s().source && t("post.via", { source: s().source }), !props.full && s().region]
      .filter(Boolean)
      .join(" · ");
  return (
    <View
      role={props.full ? undefined : "button"}
      onPress={props.full ? undefined : () => openPost(s())}
      class={`gap-3 border-b border-border px-4 py-3 ${props.full ? "" : "active:bg-muted/60"}`}
    >
      <View class="flex-row items-center gap-3">
        <Avatar user={s().user} />
        <View class="flex-1">
          <View role="button" onPress={() => openProfile(s().user.id)} class="flex-row items-center gap-1">
            <Text class="font-semibold text-foreground">{s().user.name}</Text>
          </View>
          <View class="flex-row items-center gap-1">
            <Text class="shrink text-xs text-muted-foreground line-clamp-1">{meta()}</Text>
            <If when={!props.full && s().editCount}>
              <Text class="shrink-0 text-xs text-muted-foreground">·</Text>
              <Icon name="pencil" class="size-3 shrink-0 tint-muted-foreground" />
              <Text class="shrink-0 text-xs text-muted-foreground">{t("post.edited")}</Text>
            </If>
          </View>
        </View>
      </View>
      <Body status={s()} lines={props.full ? undefined : 8} selectable={props.full} />
      <If when={s().retweeted}>
        {(rt) => (
          <View
            role="button"
            accessibilityLabel={hasAuthor(rt()) ? t("post.reposted_by", { name: rt().user.name }) : undefined}
            onPress={() => openPost(rt())}
            class="gap-2 rounded-lg bg-muted px-3 py-2 active:opacity-70"
          >
            <If when={hasAuthor(rt())}>
              <Text
                role="button"
                onPress={() => openProfile(rt().user.id)}
                class="text-sm font-semibold text-primary"
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
              <Icon name="history" class="size-3.5 tint-primary" />
              <Text class="text-xs text-primary">{t("post.edit_history")}</Text>
            </View>
          </If>
          <View class="flex-1" />
          <If when={s().region}>
            <View class="flex-row items-center gap-1" accessibilityLabel={t("post.region", { region: s().region })}>
              <Icon name="map-pin" class="size-3.5 tint-muted-foreground" />
              <Text class="text-xs text-muted-foreground">{s().region}</Text>
            </View>
          </If>
        </View>
      </If>
      {/* On the post's page the tabs under it carry the counts. */}
      <If when={!props.full}>
        <View class="flex-row gap-8">
          <Stat icon="repeat" n={s().reposts} label={t("post.reposts", { n: count(s().reposts) })} />
          <Stat icon="message-circle" n={s().comments} label={t("post.comments", { n: count(s().comments) })} />
          <Stat icon="thumb-up" n={s().likes} label={t("post.likes", { n: count(s().likes) })} />
        </View>
      </If>
    </View>
  );
}

/** A post's count: its icon, then the number (none for 0). `label` is what screen readers say. */
export function Stat(props: { icon: IconName; n: number; label: string }) {
  return (
    <View accessibilityLabel={props.label} class="flex-row items-center gap-1">
      <Icon name={props.icon} class="size-4 tint-muted-foreground" />
      <If when={props.n}>
        <Text class="text-xs text-muted-foreground">{count(props.n)}</Text>
      </If>
    </View>
  );
}
