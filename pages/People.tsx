// Who an account follows and who follows it, one list at a time under two tabs (as a post's
// reposts / comments / likes): each account opens its profile. A list loads when first shown and stays while the page is open.
import { List, signal } from "nsh";
import { t } from "nsh/i18n";
import { people, type User } from "../api";
import { FeedFooter } from "../components/FeedFooter";
import { createPageScroll, Page } from "../components/Header";
import { PersonRow } from "../components/PersonRow";
import { SavedNotice } from "../components/SavedNotice";
import { TabBar, type TabItem } from "../components/TabBar";
import { createFeed } from "../feed";
import { count } from "../format";
import { refreshed } from "../haptics";

type Kind = "following" | "followers";

/** The height of the tabs under the header, their hairline included. */
const TABS = 44;

/** Two tabs under the header, as a post's, on the page's ground (the list scrolls under them, not
 * through them): the count large, then what it counts. */
function Tabs(props: { value: Kind; onChange: (k: Kind) => void; n: (k: Kind) => number | undefined }) {
  const tab = (k: Kind): TabItem<Kind> => {
    const label = t(k === "followers" ? "people.followers" : "people.following");
    const n = props.n(k);
    return { id: k, label, count: n, accessibilityLabel: n === undefined ? label : `${label} ${count(n)}` };
  };
  return (
    <TabBar
      tabs={[tab("following"), tab("followers")]}
      value={props.value}
      onChange={props.onChange}
      class="h-[44px] border-hairline bg-ground"
    />
  );
}

export function People(props: {
  uid: string;
  kind: Kind;
  /** The account's name and counts, from its profile: the title and the tabs' numbers. */
  name?: string;
  followingCount?: number;
  followersCount?: number;
}) {
  const make = (kind: Kind) =>
    createFeed<User, number>((page) => people(props.uid, kind, page ?? 1), {
      saveAs: () => `people:${kind}:${props.uid}`,
    });
  const feeds = { following: make("following"), followers: make("followers") };
  const kind = signal<Kind>(props.kind);
  const opened = new Set<Kind>([props.kind]);
  feeds[props.kind].more();
  const show = (k: Kind) => {
    kind.set(k);
    if (!opened.has(k)) {
      opened.add(k);
      feeds[k].more();
    }
  };
  const feed = () => feeds[kind()];
  const n = (k: Kind) => (k === "following" ? props.followingCount : props.followersCount);
  const title = props.name ?? t(props.kind === "followers" ? "people.followers" : "people.following");
  const scroll = createPageScroll({ accessory: TABS, refreshing: () => feed().refreshing() });
  return (
    <Page title={title} scroll={scroll} accessory={<Tabs value={kind()} onChange={show} n={n} />}>
      <List
        {...scroll.list()}
        each={feed().items()}
        keyExtractor={(u) => u.id}
        estimatedItemSize={84}
        refreshing={feed().refreshing()}
        onRefresh={() => refreshed(feed().refresh())}
        onLoadMore={() => feed().more()}
        header={<SavedNotice at={feed().savedAt()} failed={!!feed().error()} onRetry={() => feed().more()} />}
        footer={
          <FeedFooter
            loading={feed().loading()}
            error={feed().error()}
            done={feed().done()}
            empty={!feed().items().length}
            onRetry={() => feed().more()}
          />
        }
        class="flex-1"
      >
        {(u) => <PersonRow user={u()} />}
      </List>
    </Page>
  );
}
