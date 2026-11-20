// One post: author, text, pictures, the post it reposts, counts. Pressing the author opens
// their profile, a picture the viewer, the reposted post that post, elsewhere the post's comments.
import { Image, Text, View } from "nsh";
import type { Status, User } from "../api";
import { count, relativeTime } from "../format";
import { openPost, openProfile } from "../nav";
import { openViewer } from "./ImageViewer";
import { RichText } from "./RichText";

export function Avatar(props: { user: User; size?: "sm" | "md" | "lg" }) {
  const size = () => (props.size === "lg" ? "size-16" : props.size === "sm" ? "size-8" : "size-10");
  return (
    <View
      role="button"
      accessibilityLabel={props.user.name}
      onPress={() => openProfile(props.user.id)}
      class={`${size()} overflow-hidden rounded-full bg-muted active:opacity-70`}
    >
      <If when={props.user.avatar}>
        <Image src={props.user.avatar} class="size-full object-cover" />
      </If>
    </View>
  );
}

function Pictures(props: { pics: Status["pics"] }) {
  // One picture shows large; several in a grid of three across, at most nine.
  return (
    <If when={props.pics.length}>
      <View class="flex-row flex-wrap gap-1">
        <Each of={props.pics.slice(0, 9)}>
          {(pic, i) => (
            <View
              role="button"
              accessibilityLabel={`Picture ${i() + 1} of ${props.pics.length}`}
              onPress={() => openViewer(props.pics, i())}
              class={`${props.pics.length === 1 ? "h-56 w-56" : "size-24"} overflow-hidden rounded-md bg-muted active:opacity-80`}
            >
              <Image src={pic().thumb} class="size-full object-cover" />
            </View>
          )}
        </Each>
      </View>
    </If>
  );
}

// `selectable`: long-press selects the text. Not inside a pressable box: on iOS the text's
// selection gestures take the taps the box should get.
function Body(props: { status: Status; lines?: number; selectable?: boolean }) {
  return (
    <>
      <RichText
        text={props.status.text}
        class={`${props.selectable ? "select-text " : ""}text-[15px] leading-6 text-foreground ${props.lines === 8 ? "line-clamp-8" : props.lines === 6 ? "line-clamp-6" : ""}`}
      />
      <Pictures pics={props.status.pics} />
    </>
  );
}

export function StatusCard(props: { status: Status; full?: boolean; text?: string }) {
  const s = () => props.status;
  const meta = () =>
    [relativeTime(s().createdAt), s().source && `via ${s().source}`, s().region].filter(Boolean).join(" · ");
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
          <Text class="text-xs text-muted-foreground line-clamp-1">{meta()}</Text>
        </View>
      </View>
      <Body status={props.text ? { ...s(), text: props.text } : s()} lines={props.full ? undefined : 8} selectable={props.full} />
      <If when={s().retweeted}>
        {(rt) => (
          <View
            role="button"
            accessibilityLabel={`Reposted post by ${rt().user.name}`}
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
      <View class="flex-row gap-6">
        <Text class="text-xs text-muted-foreground">Reposts {count(s().reposts)}</Text>
        <Text class="text-xs text-muted-foreground">Comments {count(s().comments)}</Text>
        <Text class="text-xs text-muted-foreground">Likes {count(s().likes)}</Text>
      </View>
    </View>
  );
}
