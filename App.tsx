// The app shell: the session bridge (a WebView signed in to weibo.com, shown only to sign in)
// and the navigation stack of native pages.
import { effect, mount, signal, Text, View, WebView, type WebViewRef } from "nsh";
import { NavStack } from "nsh/base";
import { t } from "nsh/i18n";
import { emoticonList, forgetAccount } from "./api";
import {
  DESKTOP_UA,
  get,
  LOGIN_URL,
  NotSignedIn,
  search,
  session,
  signingOut,
  signOutLoaded,
  weibo,
} from "./bridge";
import { SavedToast } from "./components/FavoriteButton";
import { ImageViewer } from "./components/ImageViewer";
import { ReplySheet } from "./components/ReplySheet";
import { Downloader, SaveToast } from "./components/SaveMedia";
import { Spinner } from "./components/Spinner";
import { VideoPlayer } from "./components/VideoPlayer";
import { nav } from "./nav";
import { Edits } from "./pages/Edits";
import { Favorites } from "./pages/Favorites";
import { Post } from "./pages/Post";
import { Profile } from "./pages/Profile";
import { Replies } from "./pages/Replies";
import { ProfileSearch } from "./pages/ProfileSearch";
import { Search, SearchResults } from "./pages/Search";
import { Timeline } from "./pages/Timeline";
import { People } from "./pages/People";
import { Topic } from "./pages/Topic";

// The page the bridge idles on once signed in: same origin as the API, but a plain text file, so
// the hidden web view runs none of weibo.com's own app.
const BRIDGE_URL = weibo.idleUrl;
const onWeibo = (url: string) => /^https:\/\/(www\.)?weibo\.com\//.test(url);
// A failed sign-in probe asks again after this long, doubling each time up to the most.
const PROBE_RETRY_MS = 2_000;
const PROBE_RETRY_MAX_MS = 30_000;

function Bridge() {
  let web: WebViewRef | undefined;
  let probing = false;
  // The page the web view last loaded, and the probe that asks again on it after a failure.
  let loadedUrl = "";
  let retryTimer: number | undefined;
  let retryDelay = PROBE_RETRY_MS;

  // A page of weibo.com loaded: ask the API whether the session is signed in.
  async function probe(url: string) {
    if (session() === "ready" || probing || !onWeibo(url)) return;
    probing = true;
    clearTimeout(retryTimer);
    try {
      await get("/ajax/feed/unreadfriendstimeline?list_id=&refresh=4&since_id=0&count=1");
      retryDelay = PROBE_RETRY_MS;
      // Signed in on weibo.com's own app (after a sign-in): move to the idle page first, so no
      // request starts in a page that is about to go.
      if (url.startsWith(BRIDGE_URL)) session.set("ready");
      else web?.load({ src: BRIDGE_URL });
    } catch (e) {
      // Not signed in: the sign-in page shows, and its next load asks again. Any other failure (a
      // request that timed out, a network not up yet, an odd answer) asks again a little later, on
      // the page loaded then: no new page may come to ask (one that loaded during this probe was
      // not asked about), and the startup screen would stay for good.
      if (!(e instanceof NotSignedIn)) {
        retryTimer = setTimeout(() => probe(loadedUrl), retryDelay);
        retryDelay = Math.min(retryDelay * 2, PROBE_RETRY_MAX_MS);
      }
    } finally {
      probing = false;
    }
  }

  // Any request that finds the session gone asks for a sign-in again, and forgets the account:
  // whoever signs in next must not see its saved posts. Not while signing out: the sign-out's
  // pages run to their end first.
  effect(() => {
    if (session() === "login" && !signingOut()) {
      web?.load({ src: LOGIN_URL });
      forgetAccount();
    }
  });

  const visible = () => session() === "login" && !signingOut();
  // Only the sign-in pages are for the eye: the idle page (before them, after a sign-out) and
  // weibo.com's own app (after a sign-in, until the timeline shows) are not. The startup screen
  // covers the web view from each page's start, while it still shows the page before, until a
  // page off weibo.com has loaded.
  const showPage = signal(false);
  return (
    <View
      class={
        visible()
          ? "absolute inset-0 bg-ground pt-[env(safe-area-inset-top)]"
          : "pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
      }
    >
      <WebView
        ref={(r) => {
          web = r;
          weibo.attach(r);
        }}
        src={BRIDGE_URL}
        userAgent={DESKTOP_UA}
        class="flex-1"
        onLoadStart={(e) => {
          loadedUrl = "";
          showPage.set(false);
          weibo.onLoadStart();
        }}
        onLoad={(e) => {
          loadedUrl = e.url;
          showPage.set(!onWeibo(e.url));
          weibo.onLoad(e.url);
          signOutLoaded(e.url);
          probe(e.url);
        }}
        onError={(e) => {
          if (weibo.onError(e)) return;
          if (signingOut()) signOutLoaded(null);
          else showPage.set(true); // What the web view shows now (the form, or its error) beats a spinner.
        }}
      />
      <If when={visible() && !showPage()}>
        <Connecting />
      </If>
    </View>
  );
}

/** The startup screen: a spinner and what the app is doing. */
function Connecting() {
  return (
    <View class="absolute inset-0 items-center justify-center gap-3 bg-ground">
      <Spinner />
      <Text class="text-sm text-ink-2">{signingOut() ? t("app.signing_out") : t("app.connecting")}</Text>
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
        onError={(e) => search.onError(e)}
      />
    </View>
  );
}

function App() {
  // Pages mount once the first sign-in succeeds and stay through later re-sign-ins (a session
  // that ran out). A sign-out ends them: whoever signs in next starts on a timeline of their own.
  const started = signal(false);
  effect(() => {
    if (session() !== "ready") return;
    started.set(true);
    emoticonList();
  });
  effect(() => {
    if (!signingOut()) return;
    started.set(false);
    nav.setRoutes([{ name: "timeline" }]);
  });
  return (
    <View class="flex-1 bg-ground">
      <If
        when={started()}
        else={<Connecting />}
      >
        <NavStack state={nav} class="flex-1">
          {(route) => {
            switch (route.name) {
              case "timeline":
                return <Timeline />;
              case "post":
                return <Post id={route.id} />;
              case "people":
                return (
                  <People
                    uid={route.uid}
                    kind={route.kind}
                    name={route.userName}
                    followingCount={route.followingCount}
                    followersCount={route.followersCount}
                  />
                );
              case "topic":
                return <Topic topic={route.topic} />;
              case "profile":
                return <Profile {...route} />;
              case "edits":
                return <Edits id={route.id} />;
              case "replies":
                return <Replies postId={route.postId} commentId={route.commentId} />;
              case "favorites":
                return <Favorites />;
              case "search":
                return <Search />;
              case "search-results":
                return <SearchResults q={route.q} />;
              case "profile-search":
                return <ProfileSearch uid={route.uid} name={route.userName} />;
            }
          }}
        </NavStack>
      </If>
      <SavedToast />
      <ReplySheet />
      <ImageViewer />
      <VideoPlayer />
      <SaveToast />
      <Downloader />
      <Bridge />
      <If when={started()}>
        <SearchBridge />
      </If>
    </View>
  );
}

mount(App);
