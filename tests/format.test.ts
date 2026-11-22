// The player's times.
import { expect, test } from "nsh/test";
import { clock } from "../format";

test("a video's length reads m:ss, h:mm:ss from an hour", () => {
  expect(clock(0)).toBe("0:00");
  expect(clock(9.9)).toBe("0:09");
  expect(clock(64)).toBe("1:04");
  expect(clock(3599)).toBe("59:59");
  expect(clock(3661)).toBe("1:01:01");
  expect(clock(-3)).toBe("0:00");
});
