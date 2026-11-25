// A small turning ring, for a page whose content is on its way: a quiet track and a quarter of it in
// the accent, with round ends.
//
// It is built from borders of one color each and a clip, not from one ring whose top side has its
// own color (`border-hairline border-t-weibo`): the platforms draw a rounded border's sides as
// separate tapered pieces when their colors differ, so that ring looked square and broken.
import { createMotion, View, type StyleProp, type ViewStyle } from "nsh";
import { t } from "nsh/i18n";

/** The colors of the track, the arc and its ends: the app's, or white for the glass over media. */
const TONES = {
  app: { track: "border-hairline", arc: "border-weibo", end: "bg-weibo" },
  media: { track: "border-white/25", arc: "border-white", end: "bg-white" },
};

export function Spinner(props: {
  /** Its width and height in points (24 by default). */
  size?: number;
  /** The ring's thickness in points (2 by default). */
  stroke?: number;
  /** `media` for the white spinner on the viewers' glass and the toast. */
  tone?: keyof typeof TONES;
  /**
   * The ring's turn, for a ring that follows a gesture (the pull to refresh) rather than turning by
   * itself. It is still while one is given.
   */
  turn?: StyleProp<ViewStyle>;
  /** What screen readers say; `null` for a ring that only shows a gesture. */
  accessibilityLabel?: string | null;
}) {
  const size = props.size ?? 24;
  const stroke = props.stroke ?? 2;
  const tone = TONES[props.tone ?? "app"];
  const half = size / 2;
  const motion = createMotion();
  if (!props.turn) motion.play("spin");
  return (
    <View
      role={props.accessibilityLabel === null ? undefined : "progressbar"}
      accessibilityLabel={props.accessibilityLabel === null ? undefined : (props.accessibilityLabel ?? t("common.loading"))}
      style={{ width: size, height: size }}
    >
      <View class={`absolute inset-0 rounded-full ${tone.track}`} style={{ borderWidth: stroke }} />
      <View class="absolute inset-0" style={props.turn ?? motion.style}>
        {/* The top right quarter of a ring in the accent. */}
        <View class="absolute top-0 right-0 overflow-hidden" style={{ width: half, height: half }}>
          <View
            class={`absolute top-0 right-0 rounded-full ${tone.arc}`}
            style={{ width: size, height: size, borderWidth: stroke }}
          />
        </View>
        {/* Its round ends, at twelve and three o'clock. */}
        <View
          class={`absolute rounded-full ${tone.end}`}
          style={{ width: stroke, height: stroke, top: 0, left: half - stroke / 2 }}
        />
        <View
          class={`absolute rounded-full ${tone.end}`}
          style={{ width: stroke, height: stroke, top: half - stroke / 2, right: 0 }}
        />
      </View>
    </View>
  );
}
