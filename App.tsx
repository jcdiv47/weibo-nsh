// The app shell: the session bridge (a WebView signed in to weibo.com, shown only to sign in)
// and the native pages: one navigation stack on a phone; on the Mac a window of three columns,
// the sidebar's sections, the list column (each section's stack) and the detail column.
import { effect, type JSX, mount, signal, Text, View, WebView, type WebViewRef } from "nsh";
import { NavStack, ResizablePanel, ResizablePanelGroup } from "nsh/base";
import { currentWindow, Menu } from "nsh/desktop";
import { t } from "nsh/i18n";
import { emoticonList, forgetAccount } from "./api";
import { DETAIL_MIN, LIST_WIDTH, listWidth, setListWidth, sidebarShown, toggleSidebar } from "./layout";
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
import { BAR } from "./components/Header";
import { Icon } from "./components/Icon";
import { Sidebar } from "./components/Sidebar";
import {
  detail,
  nav,
  PageStack,
  type Route,
  resetNav,
  SECTIONS,
  section,
  showSection,
  stacks,
  timelineTop,
  visited,
  WIDE,
} from "./nav";
import { Edits } from "./pages/Edits";
import { Favorites } from "./pages/Favorites";
import { Post } from "./pages/Post";
import { confirmSignOut, Profile } from "./pages/Profile";
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
          ? `absolute inset-0 bg-ground ${WIDE ? "pt-[52px]" : "pt-[env(safe-area-inset-top)]"}`
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
        onMessage={(e) => weibo.onMessage(e.data)}
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
      {/* The Mac's window has no title bar: the strip above the sign-in page moves it. */}
      <If when={WIDE && visible()}>
        <View desktop={{ windowDrag: true }} class="absolute inset-x-0 top-0 h-[52px]" />
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
        onMessage={(e) => search.onMessage(e.data)}
        onError={(e) => search.onError(e)}
      />
    </View>
  );
}

/** A route's page, in whichever stack or column it opens. */
function page(route: Route): JSX.Element {
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
    case "blank":
      return <NoPost />;
  }
}

/** The Mac's detail column before a post is chosen. */
function NoPost() {
  return (
    <View desktop={{ windowDrag: true }} class="flex-1 items-center justify-center gap-2.5 bg-ground pb-10">
      <Icon name="message-circle" class="size-10 tint-ink-3" />
      <Text class="text-[15px] font-semibold text-ink-2">{t("mac.no_post")}</Text>
      <Text class="text-[13px] text-ink-3">{t("mac.no_post_note")}</Text>
    </View>
  );
}

/** The Mac's window: the sidebar (⌘B hides it), then the list column (each section opened so
 * far keeps its stack, the one chosen shows) and the detail column, the hairline between them a
 * handle that resizes them. The list column keeps its width as the window is resized: the detail
 * column takes the difference. */
function Columns() {
  return (
    <View class="flex-1 flex-row bg-ground">
      <If when={sidebarShown()}>
        <Sidebar />
      </If>
      <ResizablePanelGroup
        class="flex-1"
        handleClass="bg-hairline group-hover:bg-ink-3 group-active:bg-weibo"
        handleAccessibilityLabel={t("mac.resize_columns")}
        onResize={(e) => e.sizes[0] !== undefined && setListWidth(e.sizes[0])}
      >
        <ResizablePanel size={listWidth()} minSize={LIST_WIDTH.min} maxSize={LIST_WIDTH.max} fixed class="bg-ground">
          <Each of={SECTIONS.filter((s) => visited().has(s))} key={(s) => s}>
            {(s) => (
              <View class={section() === s() ? "flex-1" : "hidden"}>
                <NavStack state={stacks[s()]} class="flex-1">
                  {page}
                </NavStack>
              </View>
            )}
          </Each>
        </ResizablePanel>
        <ResizablePanel minSize={DETAIL_MIN} class="bg-ground">
          <PageStack.Provider value={detail}>
            <NavStack state={detail} class="flex-1">
              {page}
            </NavStack>
          </PageStack.Provider>
        </ResizablePanel>
      </ResizablePanelGroup>
    </View>
  );
}

/** Back in the detail column while it has pages over its post, else in the list column. */
const back = () => (detail.routes().length > 1 ? detail.pop() : nav.pop());

/** The Mac's menu bar: the app's menu, Edit, View (the sidebar), Go (the sections, back,
 * refresh) and Window. */
function setMenuBar() {
  Menu.setApplicationMenu([
    {
      label: "Weibo",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: t("menu.sign_out"), onSelect: confirmSignOut },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "showAll" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: t("mac.edit"),
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: t("mac.view"),
      submenu: [
        { label: t(sidebarShown() ? "mac.hide_sidebar" : "mac.show_sidebar"), shortcut: "mod+b", onSelect: toggleSidebar },
        { type: "separator" },
        { role: "toggleFullScreen" },
      ],
    },
    {
      label: t("mac.go"),
      submenu: [
        { label: t("timeline.title"), shortcut: "mod+1", checked: section() === "timeline", onSelect: () => showSection("timeline") },
        { label: t("search.title"), shortcut: "mod+2", checked: section() === "search", onSelect: () => showSection("search") },
        { label: t("mac.favorites"), shortcut: "mod+3", checked: section() === "favorites", onSelect: () => showSection("favorites") },
        { label: t("menu.my_profile"), shortcut: "mod+4", checked: section() === "me", onSelect: () => showSection("me") },
        { type: "separator" },
        { label: t("mac.back"), shortcut: "mod+[", onSelect: back },
        {
          label: t("mac.refresh"),
          shortcut: "mod+r",
          onSelect: () => {
            showSection("timeline");
            timelineTop.run?.();
          },
        },
      ],
    },
    {
      label: t("mac.window"),
      submenu: [{ role: "minimize" }, { role: "zoom" }],
    },
  ]);
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
    resetNav();
  });
  if (WIDE) {
    // nsh.json hides the title bar from the window's first frame; the development host's window
    // takes it here.
    currentWindow().set({ titleBar: { style: "hidden", height: BAR } });
    effect(setMenuBar);
  }
  return (
    <View class="flex-1 bg-ground">
      <If
        when={started()}
        else={<Connecting />}
      >
        <If
          when={WIDE}
          else={
            <NavStack state={stacks.timeline} class="flex-1">
              {page}
            </NavStack>
          }
        >
          <Columns />
        </If>
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
