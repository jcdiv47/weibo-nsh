// Emoticon codes and their pictures: from weibo.com's list (`/ajax/statuses/config`) and from the
// `<img>` tags weibo.com puts in a post's HTML `text`.
import { expect, test } from "nsh/test";
import { parseStatus, parseUserPostSearch } from "../api";
import { batchEmoticons, emoticons, emoticonsOfHtml, learnFromHtml, parseEmoticonConfig } from "../emoticons";
import statusShow from "./fixtures/statusShow.json";

const YB = "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/65/201810_ybnew_mobile.png";
const HHH = "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/aa/2022_hahaha_mobile.png";

test("weibo.com's list gives each code its picture", () => {
  const config = {
    ok: 1,
    data: {
      emoticon: {
        ZH_CN: {
          PC热门表情: [{ phrase: "[允悲]", url: YB }, { phrase: "not a code", url: YB }],
          其他: [{ phrase: "[doge]", url: "https://face.t.sinajs.cn/doge.png" }, { phrase: "[坏]", url: "" }],
        },
      },
    },
  };
  expect(parseEmoticonConfig(config)).toEqual({ "[允悲]": YB, "[doge]": "https://face.t.sinajs.cn/doge.png" });
  expect(parseEmoticonConfig({ ok: 1, data: {} })).toEqual({});
});

test("a post's HTML gives the codes it draws, not its link icons", () => {
  const html = `笑死<img alt="[允悲]" title="[允悲]" src="${YB}" /><img alt='[哈哈哈]' src='${HHH}'> <img class="icon-link" title="http://t.cn/AXYsr0Rp" src="https://h5.sinaimg.cn/x.png"/>`;
  expect(emoticonsOfHtml(html)).toEqual({ "[允悲]": YB, "[哈哈哈]": HHH });
});

test("parsing a post learns the emoticons it draws", () => {
  parseStatus({ ...statusShow, text: `好<img alt="[哈哈哈]" title="[哈哈哈]" src="${HHH}" />`, text_raw: "好[哈哈哈]" });
  expect(emoticons()["[哈哈哈]"]).toBe(HHH);
});

test("a batch learns its emoticons once, at its end", () => {
  const A = "https://face.t.sinajs.cn/a.png";
  const B = "https://face.t.sinajs.cn/b.png";
  const before = emoticons();
  batchEmoticons(() => {
    learnFromHtml(`<img alt="[甲]" src="${A}">`);
    batchEmoticons(() => learnFromHtml(`<img alt="[乙]" src="${B}">`)); // Joins the outer batch.
    expect(emoticons()).toBe(before);
  });
  expect(emoticons()["[甲]"]).toBe(A);
  expect(emoticons()["[乙]"]).toBe(B);
});

test("a batch that teaches nothing new leaves the table as it was", () => {
  const before = emoticons();
  batchEmoticons(() => learnFromHtml("no pictures here"));
  expect(emoticons()).toBe(before);
});

test("parsing a page of posts learns their emoticons", () => {
  const C = "https://face.t.sinajs.cn/c.png";
  parseUserPostSearch({ ok: 1, data: { list: [{ ...statusShow, text: `<img alt="[丙]" src="${C}">`, text_raw: "[丙]" }] } }, 1);
  expect(emoticons()["[丙]"]).toBe(C);
});
