// An account in a list (a profile's people, search's accounts): its picture, name, description and
// followers; a press opens their profile.
import { type JSX, Text, View } from "nsh";
import { t } from "nsh/i18n";
import type { User } from "../api";
import { count } from "../format";
import { openProfile } from "../nav";
import { Icon } from "./Icon";
import { Avatar } from "./StatusCard";

/** An account's row. `trailing`: at the right (search's follow button). */
export function PersonRow(props: { user: User; trailing?: JSX.Element }) {
  const u = () => props.user;
  return (
    <View
      role="button"
      accessibilityLabel={u().name}
      onPress={() => openProfile(u().id)}
      class="flex-row items-center gap-3 px-4 py-3 active:bg-well"
    >
      <Avatar user={u()} size="person" still />
      <View class="flex-1 gap-0.5">
        <View class="flex-row items-center gap-1.5">
          <Text class="shrink text-body leading-5 font-semibold text-ink line-clamp-1">{u().name}</Text>
          <If when={u().followsMe && u().following}>
            <View class="shrink-0 flex-row items-center gap-[3px] rounded-full bg-well px-1.5 py-px">
              <Icon name="arrows-left-right" class="size-3 tint-ink-2" />
              <Text class="text-xs text-ink-2">{t("people.mutual")}</Text>
            </View>
          </If>
        </View>
        <If when={u().description}>
          <Text class="text-sm leading-[19px] text-ink-2 line-clamp-1">{u().description}</Text>
        </If>
        <If when={u().followersCount !== undefined}>
          <Text class="text-xs text-ink-2">{t("profile.followers_count", { n: count(u().followersCount ?? 0) })}</Text>
        </If>
      </View>
      {props.trailing}
      {/* The divider starts under the names, past the pictures. */}
      <View class="absolute bottom-0 left-[72px] right-0 h-[0.5px] bg-hairline" />
    </View>
  );
}
