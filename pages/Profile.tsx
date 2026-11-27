// An account: who they are, how we relate (following, follows me, blocked), and their posts.
import { batch, computed, List, signal, Text, View } from "nsh";
import { AlertDialog, Button } from "nsh/base";
import { t } from "nsh/i18n";
import {
  block,
  follow,
  type Profile as ProfileData,
  profile,
  myUid,
  type Status,
  uidByName,
  unblock,
  unfollow,
  userPosts,
} from "../api";
import { type AlbumItem, albumOf } from "../album";
import { NotSignedIn } from "../bridge";
import { confirmSignOut } from "../components/account";
import { ErrorText, FeedFooter, RetryButton } from "../components/FeedFooter";
import { createPageScroll, GlassButton, Page } from "../components/Header";
import { PopMenu } from "../components/PopMenu";
import { Spinner } from "../components/Spinner";
import { Icon } from "../components/Icon";
import { RichText } from "../components/RichText";
import { SavedNotice } from "../components/SavedNotice";
import { AlbumTile } from "../components/AlbumTile";
import { Avatar, StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count } from "../format";
import { failed, succeeded } from "../haptics";
import { openAlbum, openPeople, openProfileSearch } from "../nav";
import { loadSaved, save } from "../saved";

type Action = "follow" | "unfollow" | "block" | "unblock";

const confirmations: Partial<Record<Action, (name: string) => { title: string; description: string; label: string }>> = {
  unfollow: (name) => ({
    title: t("profile.unfollow_title", { name }),
    description: t("profile.unfollow_description"),
    label: t("profile.unfollow"),
  }),
  block: (name) => ({
    title: t("profile.block_title", { name }),
    description: t("profile.block_description"),
    label: t("profile.block"),
  }),
};

/**
 * Follow / unfollow and block / unblock, asking first before an unfollow or a block; the profile
 * is read again after each. One per profile page: its header's menu and its buttons share it.
 */
function createActions(data: () => ProfileData | null, reload: () => Promise<void>) {
  const busy = signal<Action | null>(null);
  const error = signal<string | null>(null);
  async function run(action: Action) {
    const d = data();
    if (busy() || !d) return;
    const ask = confirmations[action]?.(d.user.name);
    if (ask) {
      const { action: chosen } = await AlertDialog.show({
        title: ask.title,
        description: ask.description,
        actions: [
          { id: "cancel", label: t("common.cancel"), role: "cancel" },
          { id: "ok", label: ask.label, role: "destructive" },
        ],
      });
      if (chosen !== "ok") return;
    }
    batch(() => {
      busy.set(action);
      error.set(null);
    });
    try {
      try {
        await { follow, unfollow, block, unblock }[action](d.user.id);
      } catch (e) {
        failed();
        throw e;
      }
      succeeded();
      await reload();
    } catch (e) {
      error.set(String((e as Error)?.message ?? e));
    } finally {
      busy.set(null);
    }
  }
  return { busy, error, run };
}
type Actions = ReturnType<typeof createActions>;

const BUTTON = "h-8 shrink-0 flex-row items-center justify-center gap-1 rounded-full px-3.5 active:opacity-70 disabled:opacity-50";

/**
 * A compact pill at the end of the counts row: Follow (orange) or 已关注 (grey, a press unfollows); while
 * blocked, 解除拉黑 in its place.
 */
function ActionButton(props: { data: ProfileData; actions: Actions }) {
  const u = () => props.data.user;
  const blocked = () => props.data.block.blocked === true;
  const busy = () => props.actions.busy();
  const following = () => !!u().following;
  return (
    <If
      when={!blocked()}
      else={
        <Button onPress={() => props.actions.run("unblock")} disabled={!!busy()} class={`${BUTTON} bg-well`}>
          <Icon name="ban" class="size-[15px] tint-ink" />
          <Text class="text-sm leading-[18px] font-semibold text-ink">
            {busy() === "unblock" ? t("profile.unblock_busy") : t("profile.unblock")}
          </Text>
        </Button>
      }
    >
      <Button
        onPress={() => props.actions.run(following() ? "unfollow" : "follow")}
        disabled={!!busy()}
        class={`${BUTTON} ${following() ? "bg-well" : "bg-weibo"}`}
      >
        <Icon
          name={busy() === "unfollow" ? "user-minus" : following() ? "user-check" : "user-plus"}
          class={`size-[15px] ${following() ? "tint-ink" : "tint-primary-foreground"}`}
        />
        <Text class={`text-sm leading-[18px] font-semibold ${following() ? "text-ink" : "text-primary-foreground"}`}>
          {busy() === "follow"
            ? t("profile.following_busy")
            : busy() === "unfollow"
              ? t("profile.unfollow_busy")
              : following()
                ? t("profile.following")
                : t("profile.follow")}
        </Text>
      </Button>
    </If>
  );
}

/**
 * A count: the number large and bold, its label small under it (as narrow as the wider of the two,
 * leaving the line room for the follow button); a press opens the list, if any.
 */
function Count(props: { n: number; label: string; onPress?: () => void }) {
  const body = (
    <>
      <Text class="text-headline leading-[22px] font-bold text-ink">{count(props.n)}</Text>
      <Text class="text-xs leading-4 text-ink-2">{props.label}</Text>
    </>
  );
  return (
    <If when={props.onPress} else={<View>{body}</View>}>
      <Button onPress={props.onPress!} accessibilityLabel={`${count(props.n)} ${props.label}`} class="active:opacity-60">
        {body}
      </Button>
    </If>
  );
}

function ProfileHeader(props: { data: ProfileData; actions: Actions; mine: boolean }) {
  const u = () => props.data.user;
  const unknownBlock = () => props.data.block.blocked === null;
  const showRaw = signal(false);
  return (
    <View class="gap-3.5 px-5 pb-[18px] pt-2">
      <View class="flex-row items-center gap-4">
        <Avatar user={u()} size="lg" still />
        <View class="flex-1 gap-1">
          <Text class="select-text text-title font-bold tracking-tight text-ink">{u().name}</Text>
          <If when={u().verified}>
            <Text class="text-meta text-ink-2 line-clamp-2">{u().verified}</Text>
          </If>
          <If when={u().location}>
            <View class="flex-row items-center gap-[3px]">
              <Icon name="map-pin" class="size-[13px] tint-ink-2" />
              <Text class="text-meta text-ink-2">{u().location}</Text>
            </View>
          </If>
          <If when={u().followsMe && !props.mine}>
            <View class="mt-0.5 flex-row items-center gap-1 self-start rounded-full bg-weibo-wash px-2 py-[3px]">
              <Icon name="arrows-left-right" class="size-[13px] tint-weibo" />
              <Text class="text-xs font-medium text-weibo-ink">{t("profile.follows_you")}</Text>
            </View>
          </If>
        </View>
      </View>
      <If when={u().description}>
        <RichText text={u().description!} class="select-text text-body leading-[22px] text-ink" />
      </If>
      {/* The button at the end of the counts' line; on its own line below them if they leave no room. */}
      <View class="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
        <View class="flex-row items-center gap-5">
          <Count n={u().followingCount ?? 0} label={t("people.following")} onPress={() => openPeople(u(), "following")} />
          <Count n={u().followersCount ?? 0} label={t("people.followers")} onPress={() => openPeople(u(), "followers")} />
          <Count n={u().posts ?? 0} label={t("profile.posts")} />
        </View>
        <If when={!props.mine}>
          <ActionButton data={props.data} actions={props.actions} />
        </If>
      </View>
      <If when={props.actions.error()}>
        <Text class="text-xs text-danger">{props.actions.error()}</Text>
      </If>
      {/* The answer said nothing of a block: what it was read from, and the answer itself. */}
      <If when={unknownBlock()}>
        <Text class="text-xs text-ink-2">
          {props.data.block.evidence.length
            ? t("profile.block_unknown_from", { fields: props.data.block.evidence.join(", ") })
            : t("profile.block_unknown")}
        </Text>
        <Button onPress={() => showRaw.update((v) => !v)} class="self-start active:opacity-60">
          <Text class="text-xs text-link">{showRaw() ? t("profile.hide_raw") : t("profile.show_raw")}</Text>
        </Button>
        <If when={showRaw()}>
          <Text class="select-text rounded-pic bg-well p-2 font-mono text-[11px] text-ink">
            {JSON.stringify(props.data.raw, null, 2)}
          </Text>
        </If>
      </If>
    </View>
  );
}

/** How many of the album's latest the strip shows. */
const STRIP = 5;

/**
 * The album's latest pictures and videos in a row, under the counts; a press anywhere on it opens
 * the album. Short of `STRIP`, the tiles keep their size and leave the rest of the row empty.
 */
function AlbumStrip(props: { items: AlbumItem[]; onPress: () => void }) {
  return (
    <View class="border-t-8 border-well">
      <Button onPress={props.onPress} accessibilityLabel={t("album.title")} class="gap-2.5 px-5 pb-4 pt-3 active:opacity-70">
        <View class="h-[22px] flex-row items-center justify-between">
          <Text class="text-headline font-semibold leading-[22px] text-ink">{t("album.title")}</Text>
          <Icon name="chevron-right" class="size-[18px] tint-ink-3" />
        </View>
        <View class="flex-row gap-1">
          <Each of={Array.from({ length: STRIP }, (_, i) => i)}>
            {(i) => (
              <View class="flex-1">
                <If when={props.items[i()]}>
                  {(item) => <AlbumTile item={item()} class="aspect-square w-full rounded-pic" />}
                </If>
              </View>
            )}
          </Each>
        </View>
      </Button>
    </View>
  );
}

/** Where the posts would be, for an account I block. */
function BlockedNotice(props: { message?: string }) {
  return (
    <View class="items-center gap-3 border-t-8 border-well px-10 py-14">
      <View class="size-12 items-center justify-center rounded-full bg-well">
        <Icon name="ban" class="size-6 tint-ink-3" />
      </View>
      <Text class="text-center text-sm leading-5 text-ink-2">{props.message ?? t("profile.blocked_posts")}</Text>
    </View>
  );
}

export function Profile(props: { uid: string } | { screenName: string } | { me: true }) {
  const data = signal<ProfileData | null>(null);
  const error = signal<string | null>(null);
  // An `@name` mention opens the page by name: find the uid first (again on a retry, if it failed).
  let uid: Promise<string> | undefined;
  const resolveUid = () => {
    uid ??= "uid" in props ? Promise.resolve(props.uid) : "screenName" in props ? uidByName(props.screenName) : myUid();
    uid.catch(() => (uid = undefined));
    return uid;
  };
  // The uid, once resolved: the key the profile and its first page of posts are saved under.
  let knownUid: string | undefined;
  const posts = createFeed<Status, number>(async (page) => userPosts(await resolveUid(), page ?? 1), {
    saveAs: () => (knownUid ? `posts:${knownUid}` : null),
  });
  const album = computed(() => albumOf(posts.items()).slice(0, STRIP));
  // Whether the strip shows is settled by the first posts in (saved or loaded): a strip that came
  // in later, as more posts load, would push the posts down under a reader scrolled to them.
  const hasAlbum = computed<boolean | undefined>((settled) =>
    settled !== undefined ? settled : posts.items().length ? album().length > 0 : posts.done() ? false : undefined,
  );
  /** The profile shown is the saved one, saved then: it has not loaded since. */
  const savedAt = signal<number | null>(null);
  // weibo.com shows no posts of an account I block (the posts API still returns them): load them
  // once the profile says it is not blocked, and again after an unblock.
  const blocked = () => data()?.block.blocked === true;
  // My own profile: no follow or block buttons.
  const mine = signal("me" in props);
  if (!("me" in props)) myUid().then((me) => resolveUid().then((id) => mine.set(id === me)), () => {});
  let postsStarted = false;
  const show = (p: ProfileData) => {
    const wasBlocked = blocked();
    data.set(p);
    if (p.block.blocked === true) return;
    if (!postsStarted) {
      postsStarted = true;
      posts.more();
    } else if (wasBlocked) posts.refresh();
  };
  const loadProfile = () => {
    error.set(null);
    return resolveUid()
      .then((uid) => {
        knownUid = uid;
        // Nothing shown yet: show the saved profile while this loads, or instead of it if it fails.
        let loaded = false;
        const saved = data()
          ? undefined
          : loadSaved<ProfileData>(`profile:${uid}`).then((s) => {
              if (!s || loaded || data() || !s.data.user?.id) return;
              batch(() => {
                savedAt.set(s.at);
                show(s.data);
              });
            });
        return profile(uid).then(
          (p) => {
            loaded = true;
            batch(() => {
              savedAt.set(null);
              show(p);
            });
            save(`profile:${uid}`, { ...p, raw: null }); // The raw answer is for debugging only.
          },
          async (e) => {
            await saved;
            throw e;
          },
        );
      })
      .catch((e) => {
        if (!(e instanceof NotSignedIn)) error.set(String(e?.message ?? e));
      });
  };
  loadProfile();
  const title = () => data()?.user.name ?? ("screenName" in props ? `@${props.screenName}` : "me" in props ? t("profile.me") : t("profile.title"));

  const actions = createActions(data, loadProfile);
  // The header's actions, kept mounted across reloads: before the menu, a search of their posts
  // (none while blocked: their posts are hidden); the menu blocks them (unblock is a button of its
  // own while blocked), or on mine, signs out.
  const searchable = () => !!data() && !blocked();
  const right = (
    <View class="flex-row items-center gap-2.5">
      <If when={searchable() ? data() : undefined}>
        {(d) => (
          <GlassButton label={t("search.profile_search", { name: d().user.name })} onPress={() => openProfileSearch(d().user)}>
            <Icon name="search" class="size-[22px] tint-ink" />
          </GlassButton>
        )}
      </If>
      <If when={mine() || searchable()}>
        <PopMenu
          trigger={
            <GlassButton label={t("profile.more")}>
              <Icon name="dots" class="size-6 tint-ink" />
            </GlassButton>
          }
          items={
            mine()
              ? [{ label: t("menu.sign_out"), icon: "logout", danger: true, onSelect: confirmSignOut }]
              : [{ label: t("profile.block"), icon: "ban", danger: true, onSelect: () => actions.run("block") }]
          }
        />
      </If>
    </View>
  );

  const scroll = createPageScroll();
  return (
    // The name is the header's below: none in the bar.
    <Page title={title()} hideTitle right={right} scroll={scroll}>
      <List
        {...scroll.list()}
        each={blocked() ? [] : posts.items()}
        keyExtractor={(s) => s.id}
        estimatedItemSize={220}
        onLoadMore={() => !blocked() && postsStarted && posts.more()}
        header={
          <If
            when={data()}
            else={
              <View class="items-center gap-2 p-6">
                <If when={error()} else={<Spinner />}>
                  <ErrorText error={error()!} />
                  <RetryButton onPress={loadProfile} />
                </If>
              </View>
            }
          >
            {(d) => (
              <View>
                <SavedNotice at={savedAt()} failed={!!error()} onRetry={loadProfile} />
                <ProfileHeader data={d()} actions={actions} mine={mine()} />
                <If when={!blocked() && hasAlbum() && album().length}>
                  <AlbumStrip items={album()} onPress={() => openAlbum(d().user)} />
                </If>
                <If when={!blocked()}>
                  <View class="h-2 bg-well" />
                </If>
              </View>
            )}
          </If>
        }
        footer={
          <If when={!blocked()} else={<BlockedNotice message={data()?.block.message} />}>
            <If when={data()}>
              <FeedFooter
                loading={posts.loading()}
                error={posts.error()}
                done={posts.done()}
                empty={!posts.items().length}
                onRetry={() => posts.more()}
              />
            </If>
          </If>
        }
        class="flex-1"
      >
        {(s) => <StatusCard status={s()} />}
      </List>
    </Page>
  );
}
