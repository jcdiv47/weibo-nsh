// An account's posts as `/ajax/statuses/mymblog` answers them, page by page, with pictures and a
// video among them, for the album (`album.ts`, `pages/Album.tsx`): a pinned post and one Weibo
// mixes in (a like) carrying pictures that are not the album's, and a page with none at all.
const user = { id: 2000000001, idstr: "2000000001", screen_name: "晚霞观察员", avatar_large: "https://tvax1.sinaimg.cn/aaaa.jpg" };

let next = 1;
function post(created_at: string, extra: Record<string, unknown> = {}) {
  const id = String(5200000000000000 + next++);
  return { id: Number(id), idstr: id, mblogid: `Al${id.slice(-7)}`, created_at, text_raw: `post ${id}`, reposts_count: 0, comments_count: 0, attitudes_count: 0, user, ...extra };
}

const pics = (...ids: string[]) => ({
  pic_ids: ids,
  pic_infos: Object.fromEntries(ids.map((id) => [id, { largest: { url: `https://wx1.sinaimg.cn/large/${id}.jpg` } }])),
});

const video = {
  page_info: {
    object_type: "video",
    page_pic: { url: "https://wx1.sinaimg.cn/large/poster1.jpg" },
    media_info: { name: "落日", duration: 75, mp4_hd_url: "https://f.video.weibocdn.com/sunset.mp4" },
  },
};

export const albumPages = [
  [
    post("Sat Nov 21 09:00:00 +0800 2026", { ...pics("pinned1"), isTop: 1, title: { text: "置顶" } }),
    post("Fri Nov 20 18:30:00 +0800 2026", pics("nov1", "nov2")),
    post("Thu Nov 19 12:00:00 +0800 2026", {
      ...pics("liked1"),
      user: { ...user, id: 2000000003, idstr: "2000000003", screen_name: "空中网球" },
      title: { text: "她11-18赞过的微博" },
      analysis_extra: "profile_insert_type:like_status|follow:0",
    }),
    post("Tue Nov 10 18:45:00 +0800 2026", video),
    post("Thu Nov 05 21:00:00 +0800 2026"),
    post("Fri Oct 30 16:20:00 +0800 2026", pics("oct1", "oct2", "oct3")),
  ],
  // Words only: the album reads on past it.
  [post("Wed Oct 07 10:00:00 +0800 2026"), post("Mon Sep 28 10:00:00 +0800 2026")],
  [post("Sat Sep 20 10:00:00 +0800 2025", pics("old1"))],
  [],
];

/** Page `page` (from 1) of the posts. */
export const albumPage = (page: number) => ({ ok: 1, data: { list: albumPages[page - 1] ?? [] } });
