// One picture or video of an account's album (`album.ts`), square and filled edge to edge; a video
// marked by a play glyph and its length. The strip on a profile and the album page share it.
import { Image, Text, View } from "nsh";
import type { AlbumItem } from "../album";
import { Icon } from "./Icon";
import { clock } from "./VideoPlayer";

export function AlbumTile(props: { item: AlbumItem; class?: string }) {
  const src = () => props.item.pic?.thumb ?? props.item.video?.poster ?? "";
  const length = () => {
    const d = Math.round(props.item.video?.duration ?? 0);
    return d ? clock(d) : "";
  };
  return (
    <View class={`overflow-hidden bg-well ${props.class ?? ""}`}>
      <If when={src()}>
        <Image src={src()} class="size-full object-cover" />
      </If>
      <If when={props.item.video}>
        <View class="absolute bottom-1.5 left-1.5 flex-row items-center gap-0.5 rounded-full bg-media-glass py-px pl-1 pr-1.5">
          <Icon name="player-play-filled" class="size-[10px] tint-white" />
          <If when={length()}>
            <Text class="text-fine font-semibold leading-[14px] text-white">{length()}</Text>
          </If>
        </View>
      </If>
    </View>
  );
}
