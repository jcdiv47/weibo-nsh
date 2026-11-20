// The app shell: the session bridge (a WebView signed in to weibo.com, shown only to sign in)
// and the navigation stack of native pages.
import { effect, mount, signal, Text, View, WebView, type WebViewRef } from "nsh";
import { NavStack } from "nsh/base";
import {
  abortPending,
  attach,
  DESKTOP_UA,
  get,
  LOGIN_URL,
  NotSignedIn,
  onBridgeMessage,
  session,
  WEIBO_ORIGIN,
} from "./bridge";
import { ImageViewer } from "./components/ImageViewer";
import { nav } from "./nav";
import { Post } from "./pages/Post";
import { Profile } from "./pages/Profile";
import { Timeline } from "./pages/Timeline";

// The page the bridge idles on once signed in: same origin as the API, but a plain text file, so
// the hidden web view runs none of weibo.com's own app.
const BRIDGE_URL = `${WEIBO_ORIGIN}/robots.txt`;
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

  // Any request that finds the session gone asks for a sign-in again.
  effect(() => {
    if (session() === "login") web?.load({ src: LOGIN_URL });
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
          <Text class="font-semibold text-foreground">Sign in to Weibo</Text>
          <Text class="text-xs text-muted-foreground">
            The session stays in this app's web view; the app never reads your password or cookies.
          </Text>
        </View>
      </If>
      <WebView
        ref={(r) => {
          web = r;
          attach(r);
        }}
        src={BRIDGE_URL}
        userAgent={DESKTOP_UA}
        class="flex-1"
        onLoadStart={() => abortPending("The bridge page navigated")}
        onLoad={(e) => probe(e.url)}
        onMessage={(e) => onBridgeMessage(e.data)}
        onError={(e) => problem.set(e.message)}
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
            <Text class="text-muted-foreground">Connecting to Weibo…</Text>
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
              case "profile":
                return "uid" in route ? <Profile uid={route.uid} /> : <Profile screenName={route.screenName} />;
            }
          }}
        </NavStack>
      </If>
      <ImageViewer />
      <Bridge />
    </View>
  );
}

mount(App);
