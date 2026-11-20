// One post: author, text, pictures, the post it reposts, counts. Pressing the author opens
// their profile, a picture the viewer, a video the player, the reposted post that post, elsewhere
// the post's comments. An edited post says so; on its own page, its versions open from below it.
import { Image, Text, View } from "nsh";
import { t } from "nsh/i18n";
import type { Status, User, Video } from "../api";
import { count, relativeTime } from "../format";
import { openEdits, openPost, openProfile } from "../nav";
import { openViewer } from "./ImageViewer";
import { RichText } from "./RichText";
import { openVideo } from "./VideoPlayer";

/** `still`: not a link to the profile (on the profile itself). */
export function Avatar(props: { user: User; size?: "sm" | "md" | "lg"; still?: boolean }) {
  const size = () => (props.size === "lg" ? "size-16" : props.size === "sm" ? "size-8" : "size-10");
  return (
    <View
      role={props.still ? undefined : "button"}
      accessibilityLabel={props.user.name}
      onPress={props.still ? undefined : () => openProfile(props.user.id)}
      class={`${size()} overflow-hidden rounded-full bg-muted active:opacity-70`}
    >
      <If when={props.user.avatar}>
        <Image src={props.user.avatar} class="size-full object-cover" />
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
          <Text class="pl-1 text-xl text-white">▶︎</Text>
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
            <If when={s().user.verified}>
              <Text class="text-xs text-primary">✓</Text>
            </If>
          </View>
          <View class="flex-row items-center gap-1">
            <Text class="shrink text-xs text-muted-foreground line-clamp-1">{meta()}</Text>
            <If when={!props.full && s().editCount}>
              <Text class="shrink-0 text-xs text-muted-foreground">· {t("post.edited")}</Text>
            </If>
          </View>
        </View>
      </View>
      <Body status={s()} lines={props.full ? undefined : 8} selectable={props.full} />
      <If when={s().retweeted}>
        {(rt) => (
          <View
            role="button"
            accessibilityLabel={t("post.reposted_by", { name: rt().user.name })}
            onPress={() => openPost(rt())}
            class="gap-2 rounded-lg bg-muted px-3 py-2 active:opacity-70"
          >
            <Text
              role="button"
              onPress={() => openProfile(rt().user.id)}
              class="text-sm font-semibold text-primary"
            >
              @{rt().user.name}
            </Text>
            <Body status={rt()} lines={props.full ? undefined : 6} />
          </View>
        )}
      </If>
      {/* On the post's page: its edit history at the left, where it was sent from at the right. */}
      <If when={props.full && (s().editCount || s().region)}>
        <View class="flex-row items-center gap-3">
          <If when={s().editCount}>
            <Text role="link" onPress={() => openEdits(s())} class="text-xs text-primary active:opacity-60">
              {t("post.edit_history")}
            </Text>
          </If>
          <View class="flex-1" />
          <If when={s().region}>
            <Text class="text-xs text-muted-foreground">{t("post.region", { region: s().region })}</Text>
          </If>
        </View>
      </If>
      <View class="flex-row gap-6">
        <Text class="text-xs text-muted-foreground">{t("post.reposts", { n: count(s().reposts) })}</Text>
        <Text class="text-xs text-muted-foreground">{t("post.comments", { n: count(s().comments) })}</Text>
        <Text class="text-xs text-muted-foreground">{t("post.likes", { n: count(s().likes) })}</Text>
      </View>
    </View>
  );
}
