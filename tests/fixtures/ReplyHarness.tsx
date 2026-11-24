import { mount, Text, View } from "nsh";
import { Button } from "nsh/base";
import type { Comment, Status } from "../../api";
import { openComment, openReply, openRepost, ReplySheet } from "../../components/ReplySheet";

const status: Status = {
  id: "1",
  mblogid: "1",
  createdAt: "Thu Nov 19 21:04:11 +0800 2026",
  text: "Hello world post text for testing reply composer layout and animation",
  links: {},
  user: { id: "u1", name: "Alice", avatar: "" },
  pics: [],
  reposts: 0,
  comments: 0,
  likes: 0,
  liked: false,
  favorited: false,
  editCount: 0,
  isLongText: false,
};

const comment: Comment = {
  id: "c1",
  text: "A comment being replied to",
  links: {},
  user: { id: "u2", name: "Bob", avatar: "" },
  createdAt: "Thu Nov 19 21:05:00 +0800 2026",
  likes: 0,
  liked: false,
  pics: [],
  replyCount: 0,
  preview: [],
};

function Harness() {
  return (
    <View class="flex-1 bg-ground pt-20 gap-3 px-4">
      <Button testID="open-comment" onPress={() => openComment(status)} class="h-10 justify-center">
        <Text>Comment</Text>
      </Button>
      <Button testID="open-reply" onPress={() => openReply(status, comment)} class="h-10 justify-center">
        <Text>Reply</Text>
      </Button>
      <Button testID="open-repost" onPress={() => openRepost(status, comment)} class="h-10 justify-center">
        <Text>Repost</Text>
      </Button>
      <ReplySheet />
    </View>
  );
}

mount(Harness);
