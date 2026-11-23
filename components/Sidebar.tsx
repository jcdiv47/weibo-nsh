// The Mac's sidebar: the window's traffic lights at its top, the sections (Following, Search,
// Favorites, My profile) under them, and the account at its bottom, whose menu signs out. It is
// the system's sidebar material; dragging its top, beside the traffic lights, moves the window.
import { Image, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { Menu } from "nsh/desktop";
import { t } from "nsh/i18n";
import { myUid, profile, type User } from "../api";
import { SIDEBAR_WIDTH } from "../layout";
import { type Section, section, showSection } from "../nav";
import { confirmSignOut } from "../pages/Profile";
import { BAR } from "./Header";
import { Icon, type IconName } from "./Icon";


const ROWS: { section: Section; icon: IconName; label: () => string; shortcut: string }[] = [
  { section: "timeline", icon: "home", label: () => t("timeline.title"), shortcut: "⌘1" },
  { section: "search", icon: "search", label: () => t("search.title"), shortcut: "⌘2" },
  { section: "favorites", icon: "bookmark", label: () => t("mac.favorites"), shortcut: "⌘3" },
  { section: "me", icon: "user", label: () => t("menu.my_profile"), shortcut: "⌘4" },
];

function Row(props: { section: Section; icon: IconName; label: string; shortcut: string }) {
  const on = () => section() === props.section;
  return (
    <Button
      role="tab"
      accessibilityLabel={props.label}
      tooltip={`${props.label}  ${props.shortcut}`}
      selected={on()}
      onPress={() => showSection(props.section)}
      class={`h-[30px] flex-row items-center gap-2.5 rounded-[7px] px-2.5 ${on() ? "bg-weibo-wash" : "hover:bg-menu-press active:bg-menu-press"}`}
    >
      <Icon name={props.icon} class={`size-[17px] ${on() ? "tint-weibo" : "tint-ink-2"}`} />
      <Text class={`flex-1 text-[13px] text-ink line-clamp-1 ${on() ? "font-semibold" : ""}`}>{props.label}</Text>
    </Button>
  );
}

/** Me, at the bottom: my picture (a "我" until it loads) and name; a press opens a menu. */
function Account() {
  const me = signal<User | null>(null);
  myUid()
    .then(profile)
    .then((p) => me.set(p.user), () => {});
  const menu = () =>
    Menu.popup([
      { label: t("menu.my_profile"), onSelect: () => showSection("me") },
      { label: t("menu.my_favorites"), onSelect: () => showSection("favorites") },
      { type: "separator" },
      { label: t("menu.sign_out"), onSelect: confirmSignOut },
    ]);
  return (
    <Button
      accessibilityLabel={t("mac.account")}
      onPress={menu}
      class="h-11 flex-row items-center gap-2.5 rounded-lg px-2 hover:bg-menu-press active:bg-menu-press"
    >
      <View class="size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-weibo">
        <If when={me()?.avatar} else={<Text class="text-xs font-semibold text-white">{t("profile.me")}</Text>}>
          {(src) => <Image src={src()} class="size-full object-cover" />}
        </If>
      </View>
      <Text class="flex-1 text-[13px] font-semibold text-ink line-clamp-1">{me()?.name ?? t("profile.me")}</Text>
      <Icon name="dots" class="size-4 shrink-0 tint-ink-3" />
    </Button>
  );
}

export function Sidebar() {
  return (
    <View
      macos={{ backdrop: { material: "sidebar", blending: "behindWindow", state: "followsWindowActiveState" } }}
      class="shrink-0 border-r-[0.5px] border-hairline px-2.5 pb-3"
      style={{ width: SIDEBAR_WIDTH, paddingTop: 6 }}
    >
      <View desktop={{ windowDrag: true }} class="-mx-2.5 -mt-1.5" style={{ height: BAR + 6 }} />
      <View role="tablist" accessibilityLabel={t("mac.sections")} class="gap-0.5">
        <Each of={ROWS} key={(r) => r.section}>
          {(r) => <Row section={r().section} icon={r().icon} label={r().label()} shortcut={r().shortcut} />}
        </Each>
      </View>
      <View class="flex-1" />
      <Account />
    </View>
  );
}
