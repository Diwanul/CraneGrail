// 界面上固定的文字（不来自 site.json 的那些），中英各一份。
// 页面渲染时两种都写进 data-zh / data-en，切换语言时由 scripts/i18n.ts 换上去。

export type Loc = { zh: string; en: string };

export const UI = {
	cover: { zh: '封面', en: 'Cover' },
	enterHome: { zh: '进入主页', en: 'Enter' },
	backToCover: { zh: '回到封面', en: 'Back to cover' },
	about: { zh: '关于', en: 'About' },
	aboutEmpty: { zh: '这里暂时还空着。', en: 'Nothing here yet.' },
	search: { zh: '搜索', en: 'Search' },
	searchPlaceholder: { zh: '搜索标题、简介、分类', en: 'Search titles and descriptions' },
	categories: { zh: '分类', en: 'Categories' },
	empty: { zh: '这里还没有文章', en: 'Nothing here yet' },
	noResult: { zh: '没有找到', en: 'No results' },
	pinned: { zh: '置顶', en: 'Pinned' },
	hint: {
		zh: '← → 切换分类　↑ ↓ 选择文章　Enter 打开　/ 搜索　Esc 封面　头像 关于',
		en: '← → category　↑ ↓ select　Enter open　/ search　Esc cover　avatar about',
	},
	toggleLang: { zh: 'Switch to English', en: '切换到中文' },
	back: { zh: '回到主页', en: 'Back' },
	updated: { zh: '更新于', en: 'updated' },
	notFoundTitle: { zh: '这里没有东西', en: 'Nothing here' },
	notFoundSub: { zh: '链接可能过期了，或者文章的地址变过。', en: 'The link may be outdated, or the post has moved.' },
	notFoundBack: { zh: '← 回主页', en: '← Home' },
} satisfies Record<string, Loc>;

/** 把一段双语文字展开成 data-zh / data-en 属性，配合 {...tr(x)} 用 */
export const tr = (v: Loc) => ({ 'data-zh': v.zh, 'data-en': v.en });
/** 同上，给 aria-label 用 */
export const trLabel = (v: Loc) => ({ 'data-zh-label': v.zh, 'data-en-label': v.en });
