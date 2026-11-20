// The app shell: the session bridge (a WebView signed in to weibo.com, shown only to sign in)
// and the navigation stack of native pages.
import { effect, mount, signal, Text, View, WebView, type WebViewRef } from "nsh";
import { NavStack } from "nsh/base";
import { t } from "nsh/i18n";
import { forgetAccount } from "./api";
import { DESKTOP_UA, get, LOGIN_URL, NotSignedIn, search, session, weibo } from "./bridge";
import { ImageViewer } from "./components/ImageViewer";
import { VideoPlayer } from "./components/VideoPlayer";
import { nav } from "./nav";
import { Edits } from "./pages/Edits";
import { Post } from "./pages/Post";
import { Profile } from "./pages/Profile";
import { Timeline } from "./pages/Timeline";
import { People } from "./pages/People";
import { Topic } from "./pages/Topic";

// The page the bridge idles on once signed in: same origin as the API, but a plain text file, so
// the hidden web view runs none of weibo.com's own app.
const BRIDGE_URL = weibo.idleUrl;
const onWeibo = (url: string) => /^https:\/\/(www\.)?weibo\.com\//.test(url);

function Bridge() {
  let web: WebViewRef | undefined;
  const problem = signal<string | null>(null);
  let probing = false;

  // A page of weibo.com loaded: ask the API whether the session is signed in.
  async function probe(url: string) {
    if (session() === "ready" || probing || !onWeibo(url)) return;
    probing = true;
    try {
      await get("/ajax/feed/unreadfriendstimeline?list_id=&refresh=4&since_id=0&count=1");
      problem.set(null);
      // Signed in on weibo.com's own app (after a sign-in): move to the idle page first, so no
      // request starts in a page that is about to go.
      if (url.startsWith(BRIDGE_URL)) session.set("ready");
      else web?.load({ src: BRIDGE_URL });
    } catch (e) {
      if (!(e instanceof NotSignedIn)) problem.set(String((e as Error)?.message ?? e));
    } finally {
      probing = false;
    }
  }

  // Any request that finds the session gone asks for a sign-in again, and forgets the account:
  // whoever signs in next must not see its saved posts.
  effect(() => {
    if (session() === "login") {
      web?.load({ src: LOGIN_URL });
      forgetAccount();
    }
  });

  const visible = () => session() === "login";
  return (
    <View
      class={
        visible()
          ? "absolute inset-0 bg-background pt-[env(safe-area-inset-top)]"
          : "pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
      }
    >
      <If when={visible()}>
        <View class="gap-1 border-b border-border px-4 py-3">
          <Text class="font-semibold text-foreground">{t("app.sign_in_title")}</Text>
          <Text class="text-xs text-muted-foreground">
            {t("app.sign_in_note")}
          </Text>
        </View>
      </If>
      <WebView
        ref={(r) => {
          web = r;
          weibo.attach(r);
        }}
        src={BRIDGE_URL}
        userAgent={DESKTOP_UA}
        class="flex-1"
        onLoadStart={() => weibo.onLoadStart()}
        onLoad={(e) => {
          weibo.onLoad(e.url);
          probe(e.url);
        }}
        onMessage={(e) => weibo.onMessage(e.data)}
        onError={(e) => problem.set(e.message)}
      />
    </View>
  );
}

// The second bridge, for s.weibo.com's search pages (topics); hidden always, mounted once signed in.
function SearchBridge() {
  return (
    <View class="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0">
      <WebView
        ref={(r) => search.attach(r)}
        src={search.idleUrl}
        userAgent={DESKTOP_UA}
        class="flex-1"
        onLoadStart={() => search.onLoadStart()}
        onLoad={(e) => search.onLoad(e.url)}
        onMessage={(e) => search.onMessage(e.data)}
      />
    </View>
  );
}

function App() {
  // Pages mount once the first sign-in succeeds and stay through later re-sign-ins.
  const started = signal(false);
  effect(() => {
    if (session() === "ready") started.set(true);
  });
  return (
    <View class="flex-1 bg-background">
      <If
        when={started()}
        else={
          <View class="flex-1 items-center justify-center">
            <Text class="text-muted-foreground">{t("app.connecting")}</Text>
          </View>
        }
      >
        <NavStack state={nav} class="flex-1">
          {(route) => {
            switch (route.name) {
              case "timeline":
                return <Timeline />;
              case "post":
                return <Post id={route.id} />;
              case "people":
                return <People uid={route.uid} kind={route.kind} />;
              case "topic":
                return <Topic topic={route.topic} />;
              case "profile":
                return <Profile {...route} />;
              case "edits":
                return <Edits id={route.id} />;
            }
          }}
        </NavStack>
      </If>
      <ImageViewer />
      <VideoPlayer />
      <Bridge />
      <If when={started()}>
        <SearchBridge />
      </If>
    </View>
  );
}

mount(App);
