// A comment's author, time, likes, text and pictures: in a post's comments and a thread's replies.
import { Text, View } from "nsh";
import type { Comment } from "../api";
import { count, relativeTime } from "../format";
import { openProfile, openProfileByName } from "../nav";
import { RichText } from "./RichText";
import { Pictures } from "./StatusCard";

export function CommentBody(props: { comment: Comment; small?: boolean }) {
  // No `flex-1`: in a column it sets a zero basis, and the replies' bodies collapsed onto each other.
  return (
    <View class="gap-1">
      <View class="flex-row items-center gap-2">
        <Text
          role="button"
          onPress={() => openProfile(props.comment.user.id)}
          class={`${props.small ? "text-xs" : "text-sm"} font-semibold text-foreground`}
        >
          {props.comment.user.name}
        </Text>
        <If when={props.comment.replyTo}>
          <Text
            role="link"
            onPress={() => {
              const c = props.comment;
              if (c.replyToUid) openProfile(c.replyToUid);
              else if (c.replyTo) openProfileByName(c.replyTo);
            }}
            class="text-xs text-muted-foreground active:opacity-60"
          >
            → {props.comment.replyTo}
          </Text>
        </If>
        <Text class="text-xs text-muted-foreground">{relativeTime(props.comment.createdAt)}</Text>
        <View class="flex-1" />
        <If when={props.comment.likes}>
          <Text class="text-xs text-muted-foreground">♥ {count(props.comment.likes)}</Text>
        </If>
      </View>
      <RichText
        text={props.comment.text.trimEnd()}
        links={props.comment.links}
        plainMentions
        hidePictureLinks
        class={`select-text ${props.small ? "text-sm" : "text-[15px]"} leading-6 text-foreground`}
      />
      <Pictures pics={props.comment.pics} small />
    </View>
  );
}
