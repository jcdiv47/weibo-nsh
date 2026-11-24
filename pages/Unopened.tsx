// The reader's page before a post is picked, on a wide screen: a quiet line pointing at the list.
import { Text, View } from "nsh";
import { NavPage } from "nsh/base";
import { t } from "nsh/i18n";
import { Icon } from "../components/Icon";

export function Unopened() {
  return (
    <NavPage title={t("post.title")} headerVisible={false} class="bg-ground">
      <View class="flex-1 items-center justify-center gap-3 bg-ground px-10">
        <Icon name="layout-columns" class="size-11 tint-ink-3" />
        <Text class="text-center text-body text-ink-2">{t("post.unopened")}</Text>
      </View>
    </NavPage>
  );
}
