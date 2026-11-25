// Search and its results over stand-in bridges: the web views' `evaluate` answers from here, as
// weibo.com and s.weibo.com would, so the pages run their real requests and parsers.
import { mount, Text, View, type WebViewRef } from "nsh";
import { Button, NavStack } from "nsh/base";
import { forgetAccount } from "../../api";
import { search, weibo } from "../../bridge";
import { nav, openSearch, openSearchResults } from "../../nav";
import { Search, SearchResults } from "../../pages/Search";
import userSearchHtml from "./userSearch";

type Answer = { status: number; url: string; json: unknown; text: string | null };
const json = (body: unknown): Answer => ({ status: 200, url: "https://weibo.com/", json: body, text: null });

// Follows wait for the harness's "answer" button, so a test can act while one is on its way.
const held: (() => void)[] = [];
/** The account Weibo refuses to let me follow. */
const REFUSED = "1000000012";

function weiboAnswer(path: string, form: Record<string, string> | null): Answer | Promise<Answer> {
  if (path.startsWith("/ajax/side/hotSearch")) return json({ ok: 1, data: { realtime: [] } });
  if (path.startsWith("/ajax/side/search")) {
    const q = decodeURIComponent(path.split("q=")[1] ?? "");
    return json({ ok: 1, data: { users: [], user: [], hotquery: [{ suggestion: `${q} suggested` }] } });
  }
  if (path.startsWith("/ajax/friendships/create")) {
    const uid = form?.friend_uid;
    return new Promise((resolve) =>
      held.push(() => resolve(json(uid === REFUSED ? { ok: 0, msg: "refused" } : { ok: 1 }))),
    );
  }
  return json({ ok: 0, msg: `no stand-in for ${path}` });
}

// None of the accounts followed yet, so each row has a follow button.
const unfollowedHtml = userSearchHtml.replace(/>(已关注|互相关注)</g, ">关注<");

function searchAnswer(path: string): Answer {
  const html = path.startsWith("/user") ? unfollowedHtml : "";
  return { status: 200, url: `https://s.weibo.com${path}`, json: null, text: html };
}

// The page's script holds the path as `fetch("<path>", init)` and the form as `const form = {...};`.
function stand(answer: (path: string, form: Record<string, string> | null) => Answer | Promise<Answer>) {
  return {
    load() {},
    async evaluate(script: string) {
      const path = JSON.parse(/fetch\((".*?"), init\)/.exec(script)![1]) as string;
      const form = JSON.parse(/const form = (.*);/.exec(script)![1]) as Record<string, string> | null;
      return { value: await answer(path, form) };
    },
  } as unknown as WebViewRef;
}

weibo.attach(stand(weiboAnswer));
search.attach(stand(searchAnswer));
weibo.onLoad(weibo.idleUrl);
search.onLoad(search.idleUrl);

function Home() {
  return (
    <View class="flex-1 gap-3 bg-ground px-4 pt-20">
      <Button testID="open-search" onPress={openSearch} class="h-10 justify-center">
        <Text>Search</Text>
      </Button>
      <Button testID="open-results" onPress={() => openSearchResults("雷军")} class="h-10 justify-center">
        <Text>Results</Text>
      </Button>
    </View>
  );
}

function Harness() {
  return (
    <View class="flex-1 bg-ground">
      <NavStack state={nav} class="flex-1">
        {(route) => {
          switch (route.name) {
            case "search":
              return <Search />;
            case "search-results":
              return <SearchResults q={route.q} />;
            default:
              return <Home />;
          }
        }}
      </NavStack>
      <View class="absolute bottom-10 right-4 flex-row gap-2">
        <Button testID="answer" onPress={() => held.splice(0).forEach((resolve) => resolve())} class="h-10 justify-center px-2">
          <Text>Answer</Text>
        </Button>
        <Button testID="forget" onPress={() => forgetAccount()} class="h-10 justify-center px-2">
          <Text>Forget</Text>
        </Button>
      </View>
    </View>
  );
}

mount(Harness);
