// site.json 合并默认值之后的形状。默认值与校验在 scripts/load-content.mjs。

export type Lang = 'zh' | 'en';
/** 双语文字。缺省的版本已经在生成阶段用另一种语言补上；空字符串 = 有意留空 */
export type Loc = { zh: string; en: string };

export interface Category {
	/** 文章 frontmatter 里 category 写的就是这个；pinned / latest / other / search 是特殊分类 */
	id: string;
	label: Loc;
	/** 图标：assets/ 下的图片，或内置图标名。null = 按 id 选内置图标 */
	icon: string | null;
}

export interface Slide {
	/** 相对内容目录，必须在 assets/ 下 */
	image: string;
	body: Loc;
	/** 出处；两种语言都是空字符串 = 没有出处 */
	source: Loc;
}

export interface AboutSide {
	titles: Loc[];
	motto: Loc;
}

export interface SiteConfig {
	site: {
		author: Loc;
		title: Loc;
		description: Loc;
		lang: string;
		url: string;
	};
	defaultLang: Lang;
	avatar: string | null;
	favicon: string | null;
	categories: Category[];
	searchCategory: Category;
	pinned: string[];
	/** icon：内置图标名（github / x / email / link …）或 assets/ 下的图片 */
	links: { label: Loc; href: string; icon: string }[];
	/** About 卷首两侧名字的称号（竖着排，上面的在最上）和座右铭 */
	about: { author: AboutSide; blog: AboutSide };
	fonts: {
		titleZh: string | null;
		titleEn: string | null;
		bodyZh: string | null;
		bodyEn: string | null;
		titleSize: number;
		bodySize: number;
		lineSize: number;
		categorySize: number;
	};
	/** null = 「© 年份 作者」 */
	copyright: Loc | null;
	email: { user: string; domain: string } | null;
	cover: {
		slides: Slide[];
		interval: number;
		speed: number;
		dim: number;
	};
	layout: {
		bannerHeight: number;
		avatarSize: number;
		blockWidth: number;
		blockHeight: number;
		/** 图片宽/高。0 = 不显示图片 */
		blockImageRatio: number;
		blockGap: number;
		activeScale: number;
		railWidth: number;
		categoryWidth: number;
		categoryHeight: number;
		categoryGap: number;
		categoryActiveScale: number;
	};
	motion: { speed: number };
}
