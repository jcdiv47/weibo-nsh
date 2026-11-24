// The app shell: the session bridge (a WebView signed in to weibo.com, shown only to sign in)
// and the navigation stack of native pages; on a wide screen (an iPhone Duo open), two stacks side
// by side, the list and the reader (`nav.ts`).
import { effect, mount, safeArea, signal, Text, untracked, View, WebView, type WebViewRef, windowSize } from "nsh";
import { NavStack, type NavStackState } from "nsh/base";
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
import { Column, fitColumns, inStrip, nav, reader, type Route, touchColumn, wide } from "./nav";
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
import { Unopened } from "./pages/Unopened";

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
          ? "absolute inset-0 bg-ground pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)]"
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
          showPage.set(false);
          weibo.onLoadStart();
        }}
        onLoad={(e) => {
          showPage.set(!onWeibo(e.url));
          weibo.onLoad(e.url);
          signOutLoaded(e.url);
          probe(e.url);
        }}
        onError={(e) => {
          if (weibo.onError(e)) return;
          if (signingOut()) signOutLoaded(null);
          else {
            problem.set(e.message);
            showPage.set(true); // What the web view shows now (the form, or its error) beats a spinner.
          }
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

/** A stack of pages; its pages know it (`Column`), so their back buttons pop it. */
function Stack(props: { state: NavStackState<Route> }) {
  return (
    <Column.Provider value={props.state}>
      <NavStack state={props.state} class="flex-1">
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
            case "unopened":
              return <Unopened />;
          }
        }}
      </NavStack>
    </Column.Provider>
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
    reader.setRoutes([{ name: "unopened" }]);
  });
  // The Duo opened or closed: the pages move between one stack and two.
  let wasWide = untracked(wide);
  effect(() => {
    const isWide = wide();
    if (isWide !== wasWide) fitColumns(isWide);
    wasWide = isWide;
  });
  return (
    <View class="flex-1 bg-ground">
      <If
        when={started()}
        else={<Connecting />}
      >
        {/* The list stays mounted as the Duo opens and closes; the reader comes and goes beside it,
            the hairline between them on the fold. The Duo's status bar runs down its right edge,
            open or closed: the rightmost column keeps clear of it, unless the system's vertical bar
            is there, which the stack must reach to put its buttons in (its pages keep clear). */}
        <View class="flex-1 flex-row">
          <View
            class={wide() ? "border-r-[0.5px] border-hairline" : "flex-1"}
            style={wide() ? { width: windowSize().width / 2 } : { paddingRight: inStrip(nav) ? 0 : safeArea().right }}
            onTouchStartCapture={() => touchColumn(nav)}
          >
            <Stack state={nav} />
          </View>
          <If when={wide()}>
            <View class="flex-1" style={{ paddingRight: inStrip(reader) ? 0 : safeArea().right }} onTouchStartCapture={() => touchColumn(reader)}>
              <Stack state={reader} />
            </View>
          </If>
        </View>
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
