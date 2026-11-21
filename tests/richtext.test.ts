// "图一" to "图九" in a post's text: which of its pictures they name.
import { expect, test } from "nsh/test";
import { pictureRefs } from "../components/RichText";

test("图一 to 图九 name pictures, 0-based", () => {
  expect(pictureRefs("图一是芯片，图二是大象", 6)).toEqual([
    { pic: 0, label: "图一" },
    "是芯片，",
    { pic: 1, label: "图二" },
    "是大象",
  ]);
  expect(pictureRefs("图九", 9)).toEqual([{ pic: 8, label: "图九" }]);
});

test("references past the pictures, and posts without pictures, stay text", () => {
  expect(pictureRefs("图七", 6)).toEqual(["图七"]);
  expect(pictureRefs("图一", 0)).toEqual(["图一"]);
});
