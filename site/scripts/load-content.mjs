#!/usr/bin/env node
// 内容层的唯一入口：找到内容目录 → 读 site.json → 与默认值合并 → 拷资源 → 生成 src/site.generated.ts。
//
// 内容目录（文章、配置、图片）与代码完全分离，查找顺序：
//   1. 环境变量 CONTENT_DIR（相对仓库根，或绝对路径）
//   2. 仓库根的 content/（gitignore，放你自己的东西）
//   3. 仓库根的 content.example/（进仓库，让别人 clone 下来就能跑）
//
// 默认值规则：可选项（链接、置顶、封面、邮箱…）不填就是「没有」；
// 必需项（名字、尺寸、动画速度…）不填给一个合理的默认。
//
// 所有文字都可以写中英两个版本：{ "zh": "…", "en": "…" }；只写一个字符串 = 两种语言相同。
// 某个版本缺省（不写或写 null）时用另一个版本；写空字符串 "" 表示这个语言下就是留空。
//
// 由 npm run dev / check / build 自动调用；单独跑：node scripts/load-content.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(SITE, '..');
const GENERATED = path.join(SITE, 'src', 'site.generated.ts');
const ASSETS_OUT = path.join(SITE, 'src', 'content-assets');
const PUBLIC_OUT = path.join(SITE, 'public', 'site');

// ---------- 默认值 ----------

export const DEFAULTS = {
	site: {
		author: 'Author',
		title: 'Blog',
		description: '',
		/** 默认语言（zh-CN / en …）。访客在主页右上角切换后以访客的选择为准 */
		lang: 'zh-CN',
		url: 'http://localhost:4321',
	},
	/** 头像，相对内容目录。null = 用内置占位头像 */
	avatar: null,
	/** 浏览器标签页图标，相对内容目录。null = 内置图标 */
	favicon: null,
	/**
	 * 分类，按顺序排在主页底部。null = 只有特殊分类 + 文章里出现过的分类（按首次出现顺序）。
	 * 特殊分类没写会自动补上：pinned（置顶）在最前、latest（最新）其次、other（其他）在最后。
	 * id 写 search 的那一项只用来改「搜索」分类的名字和图标，它只在搜索之后才出现。
	 */
	categories: null,
	/** 「置顶」分类里的文章 slug，按这里的顺序排 */
	pinned: [],
	/** About 卷首头像下方的一排图标链接：[{ label, href, icon? }]。icon 不写按网址猜（github / x / bilibili / zhihu / weibo / steam / youtube / rss / email / link） */
	links: [],
	/**
	 * About 卷首（文章 frontmatter 写 layout: about 时）：两侧名字上方竖着一串称号，下方一句座右铭。
	 * blog.motto 不写就用 site.description。
	 */
	about: {
		author: { titles: [], motto: '' },
		blog: { titles: [], motto: null },
	},
	/** 邮箱拆成两半，页面上运行时才拼起来。null = 不显示 */
	email: null,
	/**
	 * 字体。四个路径相对内容目录（商业字体放 content/ 里，不进仓库）；不写就按文件名在 assets/fonts/ 里找，
	 * 找不到用系统衬线体。字号单位 px。
	 */
	fonts: {
		titleZh: null,
		titleEn: null,
		bodyZh: null,
		bodyEn: null,
		titleSize: 24,
		bodySize: 16,
		lineSize: 25,
		categorySize: 20,
	},
	/** 主页最下方的版权行。null = 「© 年份 作者」；"" = 不显示 */
	copyright: null,
	cover: {
		/** [{ image, text, source? }]。空 = 不要封面，直接进主页 */
		slides: [],
		/** 每张停留多久（毫秒） */
		interval: 7000,
		/** 切换幻灯片动画的速度倍率（背景、对话框、台词），乘在 motion.speed 上 */
		speed: 2,
		/** 进入主页后背景保留的亮度，0 = 全黑，1 = 不变暗 */
		dim: 0.35,
	},
	/** 电脑端尺寸（像素）；内容在一条 1360px 宽的居中栏里。手机端（≤ 720px 宽）用内置的紧凑布局 */
	layout: {
		bannerHeight: 84,
		avatarSize: 56,
		/** 文章卡片的最大宽度；实际宽度还受两侧留白限制 */
		blockWidth: 1040,
		/** 卡片高度 = 左边那张图的高度；图是横的 16:9（宽:高 = blockImageRatio） */
		blockHeight: 176,
		blockImageRatio: 1.7778,
		blockGap: 30,
		activeScale: 1.06,
		railWidth: 2,
		categoryWidth: 196,
		categoryHeight: 60,
		categoryGap: 30,
		categoryActiveScale: 1.32,
	},
	motion: {
		/** 所有动画的速度倍率。2 = 快一倍；系统开了「减少动态效果」时一律跳过动画 */
		speed: 1,
	},
	/** 本地预览（preview.mjs）用 */
	preview: {
		port: 4321,
		host: '127.0.0.1',
		/** 起来后自动打开浏览器 */
		open: true,
	},
	/**
	 * 上传目标（upload.mjs）用。null = 没配，upload.mjs 会拒绝执行。
	 * { provider: 'azure-swa', resourceGroup, staticWebApp, environment?: 'production', check?: true }
	 */
	upload: null,
};

/** 特殊分类的默认名字 */
const SPECIAL = {
	pinned: { zh: '置顶', en: 'Pinned' },
	latest: { zh: '最新', en: 'Latest' },
	other: { zh: '其他', en: 'Other' },
	search: { zh: '搜索', en: 'Search' },
};

/** 链接图标：按网址猜内置图标名 */
function guessIcon(href) {
	const h = String(href).toLowerCase();
	if (h.startsWith('mailto:')) return 'email';
	for (const [k, re] of [
		['github', /github\.com/],
		['x', /(^|\/\/|\.)(x|twitter)\.com/],
		['bilibili', /bilibili\.com|b23\.tv/],
		['zhihu', /zhihu\.com/],
		['weibo', /weibo\.(com|cn)/],
		['steam', /steam(community|powered)\.com/],
		['youtube', /youtube\.com|youtu\.be/],
		['rss', /rss|atom|\.xml($|\?)/],
	])
		if (re.test(h)) return k;
	return 'link';
}

// ---------- 内容目录 ----------

export function resolveContentDir() {
	const env = process.env.CONTENT_DIR;
	if (env) {
		const dir = path.resolve(REPO, env);
		if (!fs.existsSync(dir)) throw new Error(`CONTENT_DIR 指向的目录不存在：${dir}`);
		return { dir, isExample: false };
	}
	const real = path.join(REPO, 'content');
	if (fs.existsSync(real)) return { dir: real, isExample: false };
	return { dir: path.join(REPO, 'content.example'), isExample: true };
}

// ---------- 合并与校验 ----------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 深合并：对象逐键合并，数组与标量整体替换，null/undefined 落回默认。 */
function merge(def, user) {
	if (user === undefined || user === null) return structuredClone(def);
	if (isObj(def) && isObj(user)) {
		const out = {};
		for (const k of new Set([...Object.keys(def), ...Object.keys(user)])) {
			if (k.startsWith('_')) continue;
			out[k] = k in def ? merge(def[k], user[k]) : user[k];
		}
		return out;
	}
	return user;
}

// ---------- 双语文字 ----------

const has = (v) => v !== undefined && v !== null;
const isLoc = (v) => isObj(v) && ('zh' in v || 'en' in v);

/**
 * 文字 → { zh, en }。字符串两种语言共用；对象里缺省（undefined / null）的版本用另一个，
 * 空字符串是有意的留空，原样保留。两个都没有就用 def。
 */
export function loc(v, def = '') {
	if (isLoc(v)) {
		const zh = has(v.zh) ? String(v.zh) : has(v.en) ? String(v.en) : def;
		const en = has(v.en) ? String(v.en) : has(v.zh) ? String(v.zh) : def;
		return { zh, en };
	}
	if (!has(v)) return { zh: def, en: def };
	return { zh: String(v), en: String(v) };
}

/**
 * 台词 → { body: {zh,en}, source: {zh,en} }。
 * text 可以是一段文字，也可以是 [正文, 出处]；每一段、或者整个 text 都可以写成 { zh, en }。
 * 也可以把出处单独写在 source 里。
 */
function line(text, source) {
	const split = (x) => (Array.isArray(x) ? [x[0], x[1]] : [x, undefined]);
	let body;
	let src;
	if (isLoc(text)) {
		const zh = has(text.zh) ? split(text.zh) : [];
		const en = has(text.en) ? split(text.en) : [];
		body = loc({ zh: zh[0], en: en[0] });
		src = loc({ zh: zh[1], en: en[1] });
	} else {
		const [b, s] = split(text);
		body = loc(b);
		src = loc(s);
	}
	if (has(source)) src = loc(source);
	return { body, source: src };
}

const warnings = [];
const warn = (m) => warnings.push(m);

function num(obj, key, def, min, max) {
	const v = obj[key];
	if (typeof v !== 'number' || !Number.isFinite(v)) {
		if (v !== undefined) warn(`${key} 不是数字（${JSON.stringify(v)}），已用默认值 ${def}`);
		obj[key] = def;
		return;
	}
	obj[key] = Math.min(max, Math.max(min, v));
}

/** 从文章 frontmatter 里粗扫一遍 category，用于自动生成分类。 */
function scanPostCategories(postsDir) {
	const seen = [];
	if (!fs.existsSync(postsDir)) return seen;
	const walk = (d) => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (/\.mdx?$/.test(e.name)) {
				const head = fs.readFileSync(p, 'utf8').split(/\r?\n---/)[0];
				const m = head.match(/^category:\s*['"]?([^'"\r\n#]+?)['"]?\s*$/m);
				if (m && !seen.includes(m[1])) seen.push(m[1]);
			}
		}
	};
	walk(postsDir);
	return seen;
}

function normalize(cfg, contentDir) {
	const L = cfg.layout;
	const D = DEFAULTS.layout;
	num(L, 'bannerHeight', D.bannerHeight, 40, 200);
	num(L, 'avatarSize', D.avatarSize, 20, 160);
	num(L, 'blockWidth', D.blockWidth, 240, 1600);
	num(L, 'blockHeight', D.blockHeight, 48, 400);
	num(L, 'blockImageRatio', D.blockImageRatio, 0, 4);
	num(L, 'blockGap', D.blockGap, 0, 80);
	num(L, 'activeScale', D.activeScale, 1, 1.5);
	num(L, 'railWidth', D.railWidth, 0, 12);
	num(L, 'categoryWidth', D.categoryWidth, 40, 400);
	num(L, 'categoryHeight', D.categoryHeight, 24, 200);
	num(L, 'categoryGap', D.categoryGap, 0, 80);
	num(L, 'categoryActiveScale', D.categoryActiveScale, 1, 2);
	num(cfg.motion, 'speed', DEFAULTS.motion.speed, 0.1, 10);
	num(cfg.cover, 'interval', DEFAULTS.cover.interval, 1500, 120000);
	num(cfg.cover, 'speed', DEFAULTS.cover.speed, 0.1, 10);
	num(cfg.cover, 'dim', DEFAULTS.cover.dim, 0, 1);

	// 文字
	const S = cfg.site;
	S.author = loc(S.author, DEFAULTS.site.author);
	S.title = loc(S.title, DEFAULTS.site.title);
	S.description = loc(S.description);
	S.lang = String(S.lang || DEFAULTS.site.lang);
	cfg.defaultLang = /^en\b/i.test(S.lang) ? 'en' : 'zh';

	// 分类：all 是旧名字，等同 latest
	const postsDir = path.join(contentDir, 'posts');
	let cats = Array.isArray(cfg.categories)
		? cfg.categories.filter((c) => isObj(c) && typeof c.id === 'string' && c.id)
		: scanPostCategories(postsDir).map((id) => ({ id }));
	cats = cats.map((c) => {
		const id = c.id === 'all' ? 'latest' : c.id;
		return { id, label: loc(has(c.label) ? c.label : (SPECIAL[id] ?? id)), icon: c.icon ?? null };
	});
	const seen = new Set();
	cats = cats.filter((c) => !seen.has(c.id) && seen.add(c.id));
	const search = cats.find((c) => c.id === 'search') ?? { id: 'search', label: SPECIAL.search, icon: null };
	cats = cats.filter((c) => c.id !== 'search');
	const special = (id) => ({ id, label: SPECIAL[id], icon: null });
	if (!seen.has('pinned')) cats.unshift(special('pinned'));
	if (!seen.has('latest')) cats.splice(cats.findIndex((c) => c.id === 'pinned') + 1, 0, special('latest'));
	if (!seen.has('other')) cats.push(special('other'));
	cfg.categories = cats;
	cfg.searchCategory = search;

	cfg.pinned = Array.isArray(cfg.pinned) ? cfg.pinned.filter((s) => typeof s === 'string') : [];
	cfg.links = Array.isArray(cfg.links)
		? cfg.links.filter((l) => isObj(l) && l.href).map((l) => ({ label: loc(l.label, String(l.href)), href: String(l.href), icon: typeof l.icon === 'string' && l.icon ? l.icon : guessIcon(l.href) }))
		: [];
	const side = (v, motto) => ({
		titles: Array.isArray(v?.titles) ? v.titles.filter(has).map((x) => loc(x)) : has(v?.titles) ? [loc(v.titles)] : [],
		motto: has(v?.motto) ? loc(v.motto) : motto,
	});
	cfg.about = { author: side(cfg.about?.author, loc('')), blog: side(cfg.about?.blog, S.description) };
	cfg.copyright = has(cfg.copyright) ? loc(cfg.copyright) : null;
	const F = cfg.fonts;
	for (const k of ['titleZh', 'titleEn', 'bodyZh', 'bodyEn']) F[k] = typeof F[k] === 'string' && F[k] ? F[k] : null;
	num(F, 'titleSize', DEFAULTS.fonts.titleSize, 10, 72);
	num(F, 'bodySize', DEFAULTS.fonts.bodySize, 10, 40);
	num(F, 'lineSize', DEFAULTS.fonts.lineSize, 10, 60);
	num(F, 'categorySize', DEFAULTS.fonts.categorySize, 10, 60);
	cfg.email = isObj(cfg.email) && cfg.email.user && cfg.email.domain ? { user: String(cfg.email.user), domain: String(cfg.email.domain) } : null;
	cfg.cover.slides = Array.isArray(cfg.cover.slides)
		? cfg.cover.slides.filter((s) => isObj(s) && s.image).map((s) => ({ image: String(s.image), ...line(s.text, s.source) }))
		: [];
	delete cfg.clock; // 时钟已经换成了语言切换

	// 引用到的资源必须在 assets/ 下，且确实存在
	const checkAsset = (p, what) => {
		if (!p) return null;
		const rel = String(p).replace(/^\.?\//, '');
		if (!rel.startsWith('assets/')) {
			warn(`${what}「${p}」必须放在内容目录的 assets/ 下，已忽略`);
			return null;
		}
		if (!fs.existsSync(path.join(contentDir, rel))) {
			warn(`${what}「${p}」不存在，已忽略`);
			return null;
		}
		return rel;
	};
	cfg.avatar = checkAsset(cfg.avatar, '头像');
	cfg.favicon = checkAsset(cfg.favicon, '图标');
	cfg.cover.slides = cfg.cover.slides
		.map((s) => ({ ...s, image: checkAsset(s.image, '封面图') }))
		.filter((s) => s.image);

	cfg.site.url = String(cfg.site.url).replace(/\/+$/, '');

	num(cfg.preview, 'port', DEFAULTS.preview.port, 1, 65535);
	cfg.preview.host = String(cfg.preview.host || DEFAULTS.preview.host);
	cfg.preview.open = cfg.preview.open !== false;

	// 旧写法 deploy.azure 自动换成 upload
	if (!cfg.upload && isObj(cfg.deploy) && isObj(cfg.deploy.azure)) {
		cfg.upload = { provider: 'azure-swa', ...cfg.deploy.azure };
	}
	delete cfg.deploy;
	if (isObj(cfg.upload)) {
		cfg.upload = { provider: 'azure-swa', environment: 'production', check: true, ...cfg.upload };
		cfg.upload.provider = String(cfg.upload.provider);
	} else cfg.upload = null;
	return cfg;
}

// ---------- 资源 ----------

/**
 * 增量同步：只拷变了的文件，删掉源里已经没有的。
 * 不整个 rm 再 cp：dev server 开着的时候那样会让 Vite 瞬间看到文件全没了而报错。
 */
function syncDir(src, dst) {
	if (!fs.existsSync(src)) {
		fs.rmSync(dst, { recursive: true, force: true });
		return;
	}
	fs.mkdirSync(dst, { recursive: true });
	const want = new Set(fs.readdirSync(src));
	for (const name of fs.readdirSync(dst)) {
		if (!want.has(name)) fs.rmSync(path.join(dst, name), { recursive: true, force: true });
	}
	for (const name of want) {
		const s = path.join(src, name);
		const d = path.join(dst, name);
		const st = fs.statSync(s);
		if (st.isDirectory()) syncDir(s, d);
		else if (!fs.existsSync(d) || fs.statSync(d).mtimeMs < st.mtimeMs || fs.statSync(d).size !== st.size) {
			fs.copyFileSync(s, d);
		}
	}
}

// ---------- 主流程 ----------

export function loadContent() {
	const { dir, isExample } = resolveContentDir();
	const file = path.join(dir, 'site.json');
	let user = {};
	if (fs.existsSync(file)) {
		try {
			user = JSON.parse(fs.readFileSync(file, 'utf8'));
		} catch (e) {
			throw new Error(`${file} 不是合法的 JSON：${e.message}`);
		}
	}
	const config = normalize(merge(DEFAULTS, user), dir);
	return { contentDir: dir, isExample, config, warnings: [...warnings] };
}

export function generate() {
	const { contentDir, isExample, config, warnings: w } = loadContent();

	// assets/ 拷进 src/，让 Astro 能对封面图、头像做 webp 优化
	syncDir(path.join(contentDir, 'assets'), ASSETS_OUT);

	// favicon 不走图片管线，直接放 public/
	fs.rmSync(PUBLIC_OUT, { recursive: true, force: true });
	let faviconHref = '/favicon.svg';
	if (config.favicon) {
		fs.mkdirSync(PUBLIC_OUT, { recursive: true });
		const name = 'favicon' + path.extname(config.favicon);
		fs.copyFileSync(path.join(contentDir, config.favicon), path.join(PUBLIC_OUT, name));
		faviconHref = `/site/${name}`;
	}

	// 上传与预览的配置只给根目录脚本用，不进页面
	const { upload, preview, ...pageConfig } = config;

	const body = `// 由 scripts/load-content.mjs 自动生成，别手改。改内容目录里的 site.json。
// 本文件已 gitignore。

import type { SiteConfig } from './lib/config-types';

export const isExampleContent = ${isExample};
export const postsDirHref = ${JSON.stringify(pathToFileURL(path.join(contentDir, 'posts')).href + '/')};
export const faviconHref = ${JSON.stringify(faviconHref)};

const config: SiteConfig = ${JSON.stringify(pageConfig, null, '\t')};

export default config;
`;
	const prev = fs.existsSync(GENERATED) ? fs.readFileSync(GENERATED, 'utf8') : null;
	if (prev !== body) fs.writeFileSync(GENERATED, body);

	const rel = path.relative(REPO, contentDir) || contentDir;
	console.log(`  内容目录：${rel}${isExample ? '（示例内容——建一个 content/ 换成你自己的）' : ''}`);
	for (const m of w) console.warn(`  ⚠️  ${m}`);
	return { contentDir, isExample, config };
}

/** generate() + 裁字体（字体要读全部文章，异步） */
export async function generateAll() {
	const r = generate();
	const { buildFonts } = await import('./build-fonts.mjs');
	await buildFonts(r.contentDir, SITE, r.config.fonts);
	return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await generateAll();
}
