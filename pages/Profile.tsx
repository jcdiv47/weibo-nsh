// An account: who they are, how we relate (following, follows me, blocked), and their posts.
import { List, signal, Text, View } from "nsh";
import { AlertDialog, Button, NavPage } from "nsh/base";
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
import { NotSignedIn } from "../bridge";
import { FeedFooter } from "../components/FeedFooter";
import { Header } from "../components/Header";
import { RichText } from "../components/RichText";
import { Avatar, StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count } from "../format";
import { openPeople } from "../nav";

function Badge(props: { label: string; tone?: "primary" | "danger" | "muted" }) {
  const tone = () =>
    props.tone === "danger"
      ? "border-destructive text-destructive"
      : props.tone === "primary"
        ? "border-primary text-primary"
        : "border-border text-muted-foreground";
  return <Text class={`rounded-full border px-2 py-0.5 text-xs ${tone()}`}>{props.label}</Text>;
}

// What the buttons above don't say: whether they follow me, and a block state the answer left
// unknown (with the fields it was read from).
function Relationship(props: { data: ProfileData }) {
  const block = () => props.data.block;
  return (
    <>
      <If when={props.data.user.followsMe}>
        <View class="flex-row">
          <Badge label={t("profile.follows_you")} tone="primary" />
        </View>
      </If>
      <If when={block().blocked === null}>
        <Text class="text-xs text-muted-foreground">
          {block().evidence.length
            ? t("profile.block_unknown_from", { fields: block().evidence.join(", ") })
            : t("profile.block_unknown")}
        </Text>
      </If>
    </>
  );
}

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

/** Follow / unfollow and block / unblock; the profile is read again after each. */
function Actions(props: { data: ProfileData; reload: () => Promise<void> }) {
  const u = () => props.data.user;
  const blocked = () => props.data.block.blocked === true;
  const busy = signal<Action | null>(null);
  const error = signal<string | null>(null);

  async function run(action: Action) {
    if (busy()) return;
    const ask = confirmations[action]?.(u().name);
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
    busy.set(action);
    error.set(null);
    try {
      const uid = u().id;
      await { follow, unfollow, block, unblock }[action](uid);
      await props.reload();
    } catch (e) {
      error.set(String((e as Error)?.message ?? e));
    } finally {
      busy.set(null);
    }
  }

  const button = "rounded-full border px-4 py-1.5 active:opacity-60";
  return (
    <View class="gap-2">
      <View class="flex-row gap-2">
        <If when={!blocked()}>
          <Button
            onPress={() => run(u().following ? "unfollow" : "follow")}
            disabled={!!busy()}
            class={`${button} ${u().following ? "border-border" : "border-primary bg-primary"}`}
          >
            <Text class={`text-sm font-semibold ${u().following ? "text-foreground" : "text-primary-foreground"}`}>
              {busy() === "follow"
                ? t("profile.following_busy")
                : busy() === "unfollow"
                  ? t("profile.unfollow_busy")
                  : u().following
                    ? t("profile.following")
                    : t("profile.follow")}
            </Text>
          </Button>
        </If>
        <Button
          onPress={() => run(blocked() ? "unblock" : "block")}
          disabled={!!busy()}
          class={`${button} ${blocked() ? "border-border" : "border-destructive"}`}
        >
          <Text class={`text-sm font-semibold ${blocked() ? "text-foreground" : "text-destructive"}`}>
            {busy() === "block"
              ? t("profile.block_busy")
              : busy() === "unblock"
                ? t("profile.unblock_busy")
                : blocked()
                  ? t("profile.unblock")
                  : t("profile.block")}
          </Text>
        </Button>
      </View>
      <If when={error()}>
        <Text class="text-xs text-destructive">{error()}</Text>
      </If>
    </View>
  );
}

function ProfileHeader(props: { data: ProfileData; reload: () => Promise<void>; mine: boolean }) {
  const u = () => props.data.user;
  const showRaw = signal(false);
  return (
    <View class="gap-3 border-b border-border px-4 py-4">
      <View class="flex-row items-center gap-4">
        <Avatar user={u()} size="lg" still />
        <View class="flex-1 gap-1">
          <Text class="text-lg font-semibold text-foreground">{u().name}</Text>
          <If when={u().verified}>
            <Text class="text-xs text-primary line-clamp-2">{u().verified}</Text>
          </If>
        </View>
      </View>
      <If when={u().description}>
        <RichText text={u().description!} class="select-text text-sm text-foreground" />
      </If>
      <View class="flex-row gap-5">
        <Text
          role="link"
          onPress={() => openPeople(u().id, "following")}
          class="text-sm text-muted-foreground active:opacity-60"
        >
          {t("profile.following_count", { n: count(u().followingCount ?? 0) })}
        </Text>
        <Text
          role="link"
          onPress={() => openPeople(u().id, "followers")}
          class="text-sm text-muted-foreground active:opacity-60"
        >
          {t("profile.followers_count", { n: count(u().followersCount ?? 0) })}
        </Text>
        <Text class="text-sm text-muted-foreground">{t("profile.posts_count", { n: count(u().posts ?? 0) })}</Text>
      </View>
      <If when={!props.mine}>
        <Actions data={props.data} reload={props.reload} />
      </If>
      <Relationship data={props.data} />
      <Button onPress={() => showRaw.update((v) => !v)} class="self-start active:opacity-60">
        <Text class="text-xs text-primary">{showRaw() ? t("profile.hide_raw") : t("profile.show_raw")}</Text>
      </Button>
      <If when={showRaw()}>
        <Text class="select-text rounded-md bg-muted p-2 font-mono text-[11px] text-foreground">
          {JSON.stringify(props.data.raw, null, 2)}
        </Text>
      </If>
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
  const posts = createFeed<Status, number>(async (page) => userPosts(await resolveUid(), page ?? 1));
  // weibo.com shows no posts of an account I block (the posts API still returns them): load them
  // once the profile says it is not blocked, and again after an unblock.
  const blocked = () => data()?.block.blocked === true;
  // My own profile: no follow or block buttons.
  const mine = signal("me" in props);
  if (!("me" in props)) myUid().then((me) => resolveUid().then((id) => mine.set(id === me)), () => {});
  let postsStarted = false;
  const loadProfile = () => {
    error.set(null);
    return resolveUid()
      .then(profile)
      .then(
        (p) => {
          const wasBlocked = blocked();
          data.set(p);
          if (p.block.blocked === true) return;
          if (!postsStarted) {
            postsStarted = true;
            posts.more();
          } else if (wasBlocked) posts.refresh();
        },
        (e) => {
          if (!(e instanceof NotSignedIn)) error.set(String(e?.message ?? e));
        },
      );
  };
  loadProfile();
  const title = () => data()?.user.name ?? ("screenName" in props ? `@${props.screenName}` : "me" in props ? t("profile.me") : t("profile.title"));

  return (
    <NavPage title={title()} header={<Header title={title()} />}>
      <List
        each={blocked() ? [] : posts.items()}
        keyExtractor={(s) => s.id}
        estimatedItemSize={220}
        onLoadMore={() => !blocked() && postsStarted && posts.more()}
        header={
          <If
            when={data()}
            else={
              <View class="items-center gap-2 p-6">
                <Text class="text-sm text-muted-foreground">{error() ?? t("profile.loading")}</Text>
                <If when={error()}>
                  <Button onPress={loadProfile} class="rounded-(--radius) border border-border px-4 py-2">
                    <Text class="text-foreground">{t("common.retry")}</Text>
                  </Button>
                </If>
              </View>
            }
          >
            {(d) => <ProfileHeader data={d()} reload={loadProfile} mine={mine()} />}
          </If>
        }
        footer={
          <If
            when={!blocked()}
            else={
              <Text class="p-6 text-center text-sm text-muted-foreground">
                {data()?.block.message ?? t("profile.blocked_posts")}
              </Text>
            }
          >
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
    </NavPage>
  );
}
