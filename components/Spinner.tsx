// A small turning ring, for a page whose content is on its way.
import { createMotion, View } from "nsh";
import { t } from "nsh/i18n";

export function Spinner(props: { class?: string }) {
  const motion = createMotion();
  motion.play("spin");
  return (
    <View
      role="progressbar"
      accessibilityLabel={t("common.loading")}
      style={motion.style}
      class={`size-6 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground ${props.class ?? ""}`}
    />
  );
}
