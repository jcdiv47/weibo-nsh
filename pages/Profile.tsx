// An account: who they are, how we relate (following, follows me, blocked), and their posts.
import { List, signal, Text, View } from "nsh";
import { Button, NavPage } from "nsh/base";
import { type Profile as ProfileData, profile, type Status, uidByName, userPosts } from "../api";
import { NotSignedIn } from "../bridge";
import { FeedFooter } from "../components/FeedFooter";
import { Header } from "../components/Header";
import { RichText } from "../components/RichText";
import { Avatar, StatusCard } from "../components/StatusCard";
import { createFeed } from "../feed";
import { count } from "../format";

function Badge(props: { label: string; tone?: "primary" | "danger" | "muted" }) {
  const tone = () =>
    props.tone === "danger"
      ? "border-destructive text-destructive"
      : props.tone === "primary"
        ? "border-primary text-primary"
        : "border-border text-muted-foreground";
  return <Text class={`rounded-full border px-2 py-0.5 text-xs ${tone()}`}>{props.label}</Text>;
}

function Relationship(props: { data: ProfileData }) {
  const u = () => props.data.user;
  const block = () => props.data.block;
  return (
    <View class="gap-2">
      <View class="flex-row flex-wrap gap-2">
        <If when={u().following !== undefined}>
          <Badge label={u().following ? "Following" : "Not following"} tone={u().following ? "primary" : "muted"} />
        </If>
        <If when={u().followsMe}>
          <Badge label="Follows you" tone="primary" />
        </If>
        <Badge
          label={block().blocked === null ? "Block status unknown" : block().blocked ? "Blocked" : "Not blocked"}
          tone={block().blocked ? "danger" : "muted"}
        />
      </View>
      <Text class="text-xs text-muted-foreground">
        {block().evidence.length
          ? `Read from ${block().evidence.join(", ")}`
          : "The profile answer has no block field; open the raw answer to find it."}
      </Text>
    </View>
  );
}

function ProfileHeader(props: { data: ProfileData }) {
  const u = () => props.data.user;
  const showRaw = signal(false);
  return (
    <View class="gap-3 border-b border-border px-4 py-4">
      <View class="flex-row items-center gap-4">
        <Avatar user={u()} size="lg" />
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
        <Text class="text-sm text-muted-foreground">{count(u().followingCount ?? 0)} following</Text>
        <Text class="text-sm text-muted-foreground">{u().followers ?? "0"} followers</Text>
        <Text class="text-sm text-muted-foreground">{count(u().posts ?? 0)} posts</Text>
      </View>
      <Relationship data={props.data} />
      <Button onPress={() => showRaw.update((v) => !v)} class="self-start active:opacity-60">
        <Text class="text-xs text-primary">{showRaw() ? "Hide raw answer" : "Show raw answer"}</Text>
      </Button>
      <If when={showRaw()}>
        <Text class="select-text rounded-md bg-muted p-2 font-mono text-[11px] text-foreground">
          {JSON.stringify(props.data.raw, null, 2)}
        </Text>
      </If>
    </View>
  );
}

export function Profile(props: { uid: string } | { screenName: string }) {
  const data = signal<ProfileData | null>(null);
  const error = signal<string | null>(null);
  // An `@name` mention opens the page by name: find the uid first (again on a retry, if it failed).
  let uid: Promise<string> | undefined;
  const resolveUid = () => {
    uid ??= "uid" in props ? Promise.resolve(props.uid) : uidByName(props.screenName);
    uid.catch(() => (uid = undefined));
    return uid;
  };
  const loadProfile = () => {
    error.set(null);
    resolveUid().then(profile).then(
      (p) => data.set(p),
      (e) => !(e instanceof NotSignedIn) && error.set(String(e?.message ?? e)),
    );
  };
  loadProfile();
  const posts = createFeed<Status, number>(async (page) => userPosts(await resolveUid(), page ?? 1));
  posts.more();
  const title = () => data()?.user.name ?? ("screenName" in props ? `@${props.screenName}` : "Profile");

  return (
    <NavPage title={title()} header={<Header title={title()} />}>
      <List
        each={posts.items()}
        keyExtractor={(s) => s.id}
        estimatedItemSize={220}
        onLoadMore={() => posts.more()}
        header={
          <If
            when={data()}
            else={
              <View class="items-center gap-2 p-6">
                <Text class="text-sm text-muted-foreground">{error() ?? "Loading profile…"}</Text>
                <If when={error()}>
                  <Button onPress={loadProfile} class="rounded-(--radius) border border-border px-4 py-2">
                    <Text class="text-foreground">Retry</Text>
                  </Button>
                </If>
              </View>
            }
          >
            {(d) => <ProfileHeader data={d()} />}
          </If>
        }
        footer={
          <FeedFooter
            loading={posts.loading()}
            error={posts.error()}
            done={posts.done()}
            empty={!posts.items().length}
            onRetry={() => posts.more()}
          />
        }
        class="flex-1"
      >
        {(s) => <StatusCard status={s()} />}
      </List>
    </NavPage>
  );
}
