// The search pages' bar, under the status bar: a field in a capsule, then 取消. Search and a
// profile's search type in it (`SearchInput`); a search's results show what was searched there.
import { type InputRef, type JSX, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { t } from "nsh/i18n";
import { nav } from "../nav";
import { BAR } from "./Header";
import { Icon } from "./Icon";

/** The field's capsule: the search icon, then what it holds. */
function Field(props: { children: JSX.Element }) {
  return (
    <View class="h-10 flex-1 flex-row items-center gap-2 rounded-full bg-well pl-3.5 pr-2">
      <Icon name="search" class="size-[18px] tint-ink-2" />
      {props.children}
    </View>
  );
}

/** The bar: the field, then 取消, which leaves search (`depth` pages: results over search, two). */
export function SearchBar(props: { children: JSX.Element; depth?: number }) {
  return (
    <View class="flex-row items-center gap-3.5 px-4" style={{ height: BAR }}>
      <Field>{props.children}</Field>
      <Button onPress={() => nav.pop(props.depth ?? 1)} class="h-10 justify-center active:opacity-60">
        <Text class="text-body text-ink">{t("common.cancel")}</Text>
      </Button>
    </View>
  );
}

/** What the field holds while typing: the text, focused on opening, and a button that clears it
 * (and keeps the focus) once something is typed. Return searches. */
export function SearchInput(props: { value: string; onChange: (value: string) => void; onSubmit: () => void; placeholder: string }) {
  let input: InputRef | undefined;
  return (
    <>
      <Input
        ref={(r) => (input = r)}
        value={props.value}
        onChange={(e) => props.onChange(e.value)}
        onSubmit={props.onSubmit}
        placeholder={props.placeholder}
        returnKeyType="search"
        submitBehavior="blurAndSubmit"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        maxLength={100}
        class="h-10 flex-1 text-body text-ink placeholder:text-ink-3"
      />
      <If when={props.value}>
        <Button
          accessibilityLabel={t("search.clear")}
          onPress={() => {
            props.onChange("");
            input?.focus();
          }}
          class="size-8 items-center justify-center active:opacity-60"
        >
          <Icon name="circle-x-filled" class="size-[18px] tint-ink-3" />
        </Button>
      </If>
    </>
  );
}
