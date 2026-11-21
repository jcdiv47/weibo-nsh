// "图一", "图2" in a post's text: which of its pictures they name.
import { expect, test } from "nsh/test";
import { pictureRefs } from "../components/RichText";

test("Chinese and Arabic numbers name pictures, 0-based", () => {
  expect(pictureRefs("图一是芯片，图二是大象", 6)).toEqual([
    { pic: 0, label: "图一" },
    "是芯片，",
    { pic: 1, label: "图二" },
    "是大象",
  ]);
  expect(pictureRefs("见图3和图 4", 9)).toEqual(["见", { pic: 2, label: "图3" }, "和", { pic: 3, label: "图 4" }]);
  expect(pictureRefs("图十二", 18)).toEqual([{ pic: 11, label: "图十二" }]);
  expect(pictureRefs("图二十", 18)).toEqual(["图二十"]);
});

test("references past the pictures, words ending in 图, and posts without pictures stay text", () => {
  expect(pictureRefs("图七", 6)).toEqual(["图七"]);
  expect(pictureRefs("地图一样，试图二次", 6)).toEqual(["地图一样，试图二次"]);
  expect(pictureRefs("图一", 0)).toEqual(["图一"]);
});
