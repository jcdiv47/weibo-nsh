// A profile and its album over a stand-in bridge: the web view's `evaluate` answers from here, as
// weibo.com would (`albumPosts.ts`'s posts), so the pages run their real requests and parsers.
import { mount, Text, View, type WebViewRef } from "nsh";
import { Button, NavStack } from "nsh/base";
import { weibo } from "../../bridge";
import { ImageViewer } from "../../components/ImageViewer";
import { VideoPlayer } from "../../components/VideoPlayer";
import { nav, openProfile } from "../../nav";
import { Album } from "../../pages/Album";
import { Profile } from "../../pages/Profile";
import { albumPage } from "./albumPosts";
import profileInfo from "./profileInfo.json";

type Answer = { status: number; url: string; json: unknown; text: string | null };
const json = (body: unknown): Answer => ({ status: 200, url: "https://weibo.com/", json: body, text: null });

function answer(path: string): Answer {
  if (path.startsWith("/ajax/profile/info")) return json(profileInfo);
  if (path.startsWith("/ajax/statuses/mymblog")) return json(albumPage(Number(/page=(\d+)/.exec(path)![1])));
  return json({ ok: 0, msg: `no stand-in for ${path}` });
}

weibo.attach({
  load() {},
  async evaluate(script: string) {
    const path = JSON.parse(/fetch\((".*?"), init\)/.exec(script)![1]) as string;
    return { value: answer(path) };
  },
} as unknown as WebViewRef);
weibo.onLoad(weibo.idleUrl);

function Harness() {
  return (
    <View class="flex-1 bg-ground">
      <NavStack state={nav} class="flex-1">
        {(route) => {
          switch (route.name) {
            case "profile":
              return <Profile {...route} />;
            case "album":
              return <Album uid={route.uid} />;
            default:
              return (
                <View class="flex-1 bg-ground px-4 pt-20">
                  <Button testID="open-profile" onPress={() => openProfile("2000000001")} class="h-10 justify-center">
                    <Text>Profile</Text>
                  </Button>
                </View>
              );
          }
        }}
      </NavStack>
      <ImageViewer />
      <VideoPlayer />
    </View>
  );
}

mount(Harness);
