// 主页 + 封面的入口：章节切换、搜索、语言、输入、启动。
// 封面在 home/cover.ts，章节行的滑动在 home/track.ts，文章列和标示线在 home/list.ts。

import { applyLang, getLang, storeLang } from './i18n';
import { Reader } from './reader';
import { aboutIn, aboutInstant, aboutOut, aboutPrep, aboutReset, isAbout } from './about';
import { $, $$, boot, d, EASE, EASE_IN, hooks, reduce, run, S, setStage, wait } from './home/core';
import {
	buildFrame,
	buildNext,
	canSlide,
	coverHidden,
	coverIn,
	coverOut,
	dialog,
	firstCover,
	hasCover,
	initSlide,
	nextSlide,
	onEdge,
	placeIdent,
	preload,
	redrawCover,
	relangCover,
} from './home/cover';
import {
	blocksIn,
	blocksOf,
	blocksOut,
	bounceV,
	buildRail,
	cardsInstant,
	freezeBlocks,
	layout,
	lists,
	noTrans,
	park,
	railGrow,
	railInstant,
	railShrink,
	rebuildCards,
	railX,
	stageEl,
} from './home/list';
import { addSearchCard, buildCatFrames, catIndex, cats, emphasize, emphasizeNow, jumpTo, markCat, neighbor, railFoot, searchCard, slideTo } from './home/track';

const ident = $('#ident');
const avatarBtn = $<HTMLButtonElement>('#avatar-btn');
const home = $('#home');
const bannerLines = $$<SVGPathElement>('.bl');
const sides = $$('.side');
const searchList = lists[0];
/** 章节行整体（进出主页时整体淡入淡出；每张卡片自己的透明度归环管） */
const catsEl = $('#cats');

// ---------------------------------------------------------------- 状态持久化

const KEY = 'home:v2';
type Saved = { cat: string; sel: Record<string, string>; slide: number; q: string };
let query = '';

function load(): Saved | null {
	try {
		return JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
	} catch {
		return null;
	}
}

function save() {
	const sel: Record<string, string> = {};
	for (const l of lists) {
		const b = blocksOf(l)[S.selBy[l.dataset.cat!] ?? 0];
		if (b) sel[l.dataset.cat!] = b.dataset.slug!;
	}
	try {
		sessionStorage.setItem(KEY, JSON.stringify({ cat: lists[S.catI].dataset.cat!, sel, slide: S.slideI, q: query } satisfies Saved));
	} catch {
		/* 隐私模式或存储被禁 */
	}
}
hooks.save = save;

// ---------------------------------------------------------------- banner

async function bannerIn() {
	await Promise.all(bannerLines.map((p) => run(p, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], d(440))));
	await Promise.all([
		...sides.map((s) => run(s, [{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'translateY(0)' }], d(340))),
		run(catsEl, [{ opacity: 0 }, { opacity: 1 }], d(340)),
	]);
}

async function bannerOut() {
	await Promise.all([
		...sides.map((s) => run(s, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-14px)' }], d(300), { easing: EASE_IN })),
		run(catsEl, [{ opacity: 1 }, { opacity: 0 }], d(300), { easing: EASE_IN }),
	]);
	await Promise.all(bannerLines.map((p) => run(p, [{ strokeDashoffset: 0 }, { strokeDashoffset: 1 }], d(420), { easing: EASE_IN })));
}

// ---------------------------------------------------------------- 章节切换

// 顺序：收文章 → 收标示线 → 章节行滑到目标 → 出标示线 → 出文章。
//   收的阶段再按：只改目标，收完直接滑向最新的目标；
//   滑的途中再按：小车改道，速度连续（见 track.ts）；
//   出的阶段再按：文章和标示线停在当前帧，从这里开始收。
let phase: 'idle' | 'out' | 'emphOut' | 'slide' | 'emphIn' | 'in' = 'idle';
/** 当前这一列的内容被换掉了（新的搜索），即使目标没变也要收了再出 */
let dirty = false;
/** 切换循环里的额外工作（搜索卡片滑入）在滑动开始前要等它 */
let beforeSlide: Promise<void> | null = null;
let entering = false;

/** 最近一次切换的方向：环上沿这个方向滑（-1 左、1 右、0 走近路） */
let dir = 0;

function interrupt() {
	if (phase === 'in') {
		freezeBlocks(lists[S.shownI]);
		railShrink(); // 接管还在长的标示线，循环里会接着收
	} else if (phase === 'slide') {
		// 还在滑：直接改道，速度连续
		markCat(S.catI);
		slideTo(S.catI, dir);
	} else if (phase === 'emphIn') {
		// 刚到站正在放大：不等它放完，从当前程度收回去，循环接着滑向新目标
		emphasize(S.shownI === S.catI ? S.catI : -1, 0);
	}
	// out / emphOut：只改目标，收完会直接滑向最新的目标
}

async function cycle() {
	if (phase !== 'idle') return interrupt();
	do {
		dirty = false;
		phase = 'out';
		const A = lists[S.shownI];
		await blocksOut(A);
		await railShrink();

		if (beforeSlide) await beforeSlide;
		// 当前章节先收起强调（缩小、去框），再滑；到了目标格再放大、加框——不和滑动同时进行。
		// 放大途中目标又变了：从当前程度收回、接着滑，直到放大完成时目标没再变
		let to = S.catI;
		for (;;) {
			phase = 'emphOut';
			await emphasize(-1, 0);
			phase = 'slide';
			do {
				to = S.catI;
				markCat(to);
				await slideTo(to, dir);
			} while (S.catI !== to);
			phase = 'emphIn';
			await emphasize(to, 1);
			if (S.catI === to) break;
		}

		const B = lists[to];
		if (B !== A) A.hidden = true;
		B.hidden = false;
		S.shownI = to;
		park(B);

		phase = 'in';
		await railGrow();
		if (S.catI !== S.shownI || dirty) continue;
		await blocksIn(B);
	} while (S.catI !== S.shownI || dirty);
	noTrans(lists[S.shownI], false);
	phase = 'idle';
	focusActive();
}

/** 切到第 to 个章节；d = 方向（键盘、滚轮给 ±1，点卡片给 0 走近路） */
function switchCat(to: number, d = 0) {
	if (S.stage !== 'home' || entering || langBusy) return;
	if (to < 0 || to === S.catI) return;
	dir = d;
	S.catI = to;
	save();
	cycle();
}

function move(dir: number) {
	if (S.stage !== 'home' || phase !== 'idle' || entering || langBusy) return;
	const l = lists[S.catI];
	const id = l.dataset.cat!;
	const cur = S.selBy[id] ?? 0;
	const next = Math.max(0, Math.min(blocksOf(l).length - 1, cur + dir));
	if (next === cur) return bounceV(l, Math.sign(dir));
	S.selBy[id] = next;
	layout(l);
	focusActive();
	save();
}

const activeLink = () => lists[S.catI].querySelector<HTMLAnchorElement>('.block.active a');

function focusActive() {
	if (S.stage !== 'home' || document.activeElement === sInput) return;
	const a = activeLink();
	if (a && (document.activeElement === document.body || home.contains(document.activeElement))) a.focus({ preventScroll: true });
}

function open() {
	const a = activeLink();
	if (!a) return;
	save();
	openArticle(a.href);
}

// ---------------------------------------------------------------- 阅读模式
//
// 在主页里就地打开文章：背景、banner、头像、标示线都不动，只换内容区——
//   收文章卡片（和切章节一样向左收过标示线）→ 章节行淡出 → 标示线拉长到底
//   → 正文在线右边淡入，目录挂到线上。
// 地址栏换成 /<slug>/（history.pushState），后退 / Esc / 点头像倒着放回主页。
// 文章 HTML 取自 /<slug>/ 这一页的 .reader-doc，和直达时看到的是同一份。

const readerEl = $('#reader');
const tocEl = $('#toc');
let reading: Reader | null = null;
let readingSlug: string | null = null;
let readBusy = false;
/** 这次阅读是不是从主页点进来的（决定回主页时是后退还是改地址） */
let openedFromHome = true;
const docCache = new Map<string, Promise<HTMLElement | null>>();

function fetchDoc(href: string) {
	const url = new URL(href, location.href).pathname;
	let p = docCache.get(url);
	if (!p) {
		p = fetch(url)
			.then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
			.then((html) => new DOMParser().parseFromString(html, 'text/html').querySelector<HTMLElement>('.reader-doc'))
			.catch(() => null);
		docCache.set(url, p);
	}
	return p;
}

/** 标示线在阅读时覆盖的纵向范围（目录排在里面） */
// 章节行阅读时也留着，所以目录和正文一样只占文章区（stage）这一段，下面不多留白
const tocSpan = (): [number, number] => {
	const r = stageEl.getBoundingClientRect();
	return [r.top + 40, r.bottom - 24];
};

const infoEl = $('#read-info');
/** 阅读时章节行停在哪一格：文章所属的普通分类（从置顶、最新、搜索进来的也换成它） */
let readCat = -1;

/** 章节行从 from 换到 to：先收强调、再滑、再放强调（和切章节同一套时序） */
async function ringTo(from: number, to: number) {
	if (to < 0 || to === from) return;
	await emphasize(from, 0);
	markCat(to);
	const here = cats[from].getBoundingClientRect().left;
	await slideTo(to, cats[to].getBoundingClientRect().left >= here ? 1 : -1);
	await emphasize(to, 1);
}

/** 把文章的 .doc-info（标题、日期）挪到章节卡片右边 */
function fillInfo(node: HTMLElement) {
	const src = node.querySelector<HTMLElement>('.doc-info');
	infoEl.replaceChildren(...(src ? [...src.childNodes].map((n) => n.cloneNode(true)) : []));
}

async function openArticle(href: string, push = true) {
	if (S.stage !== 'home' || readBusy) return;
	// 章节还在切换：等它停下再打开，不吞掉这次点击
	while (phase !== 'idle') await new Promise((r) => setTimeout(r, 50));
	readBusy = true;
	const docP = fetchDoc(href);
	closeSearch();
	// 收卡片，同时取文章；其余章节卡片淡去（CSS：html.reading），只留当前这一格
	root_.classList.add('reading');
	await blocksOut(lists[S.shownI]);
	const doc = await docP;
	if (!doc) {
		// 取不到（离线等）：退回普通跳转
		location.href = href;
		return;
	}
	const node = document.importNode(doc, true);
	applyLang(S.lang, node);
	fillEmail(node);
	if (isAbout(node)) aboutPrep(node);
	readerEl.replaceChildren(node);
	readerEl.scrollTop = 0;
	// 从特殊分类进来的：章节行换到文章所属的普通分类
	const want = node.dataset.cat ? catIndex(node.dataset.cat) : -1;
	readCat = want >= 0 ? want : S.catI;
	// About 整页居中，不要标示线：和章节行换格同时收掉
	await Promise.all([ringTo(S.catI, readCat), isAbout(node) && railShrink()]);
	fillInfo(node);
	readingSlug = node.dataset.slug ?? null;
	document.title = `${node.dataset.title ?? ''} · ${document.title.split(' · ').pop()}`;
	if (push) history.pushState({ reading: readingSlug }, '', new URL(href, location.href).pathname);
	reading = new Reader(readerEl, node, tocEl, railX, tocSpan, reduce);
	// About 卷首：banner 上的头像和名字飞下来放大，称号、座右铭、图标随后淡入。
	// 和正文淡入同时开始；正文这时不横移，否则飞行的落点会差那一段
	const about = isAbout(node);
	await Promise.all([
		run(readerEl, about ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateX(-18px)' }, { opacity: 1, transform: 'translateX(0)' }], d(420)),
		run(tocEl, [{ opacity: 0 }, { opacity: 1 }], d(420), { delay: d(120) }),
		run(infoEl, [{ opacity: 0, transform: 'translate(-12px, -50%)' }, { opacity: 1, transform: 'translate(0, -50%)' }], d(420), { delay: d(60) }),
		about && aboutIn(node, ident, d),
	]);
	catsEl.inert = true;
	readBusy = false;
	(node.querySelector('h1') as HTMLElement | null)?.focus?.({ preventScroll: true });
}

/** 正在读的是 About 版式（没有标示线） */
const aboutNow = () => !!reading && isAbout(readerEl.querySelector<HTMLElement>('.reader-doc'));

async function closeArticle(pop = false) {
	if (!reading || readBusy) return;
	readBusy = true;
	const doc = readerEl.querySelector<HTMLElement>('.reader-doc');
	const wasAbout = isAbout(doc);
	if (wasAbout && readerEl.scrollTop < 40) await aboutOut(doc, ident, d);
	await Promise.all([
		run(readerEl, [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-18px)' }], d(300), { easing: EASE_IN }),
		run(tocEl, [{ opacity: 1 }, { opacity: 0 }], d(240), { easing: EASE_IN }),
		run(infoEl, [{ opacity: 1 }, { opacity: 0 }], d(240), { easing: EASE_IN }),
	]);
	infoEl.replaceChildren();
	// 卷首滚出屏幕了就不飞：头像和名字在 banner 上直接淡回来
	if (ident.style.visibility === 'hidden') {
		aboutReset(ident);
		run(ident, [{ opacity: 0 }, { opacity: 1 }], d(300));
	}
	reading.destroy();
	reading = null;
	readingSlug = null;
	readerEl.replaceChildren();
	root_.classList.remove('reading');
	// 章节行回到进来之前的那一格
	await ringTo(readCat, S.catI);
	readCat = -1;
	document.title = document.title.split(' · ').pop() ?? document.title;
	if (!pop) {
		// 从主页点进来的：后退一格回到「/」。直达的文章页（刷新、外链）：没有可退的那一格，原地改地址
		if (openedFromHome) history.back();
		else history.replaceState(null, '', '/');
	}
	openedFromHome = true;
	catsEl.inert = false;
	const L = lists[S.shownI];
	park(L);
	if (wasAbout) await railGrow();
	await blocksIn(L);
	noTrans(L, false);
	readBusy = false;
	focusActive();
}

/** 邮箱：HTML 里只有占位，用户名和域名在 boot 里分开放，运行时才拼起来 */
function fillEmail(scope: ParentNode) {
	if (!boot.email) return;
	const addr = boot.email.user + '@' + boot.email.domain;
	for (const a of scope.querySelectorAll<HTMLAnchorElement>('a[data-email]')) {
		a.href = 'mailto:' + addr;
		const t = a.querySelector('[data-email-text]');
		if (t) t.textContent = addr;
	}
}

/** 文章页启动：阅读区里已经有服务端渲染好的文章，接上目录、标题和状态 */
function startReading() {
	const node = readerEl.querySelector<HTMLElement>('.reader-doc');
	if (!node) return;
	applyLang(S.lang, node);
	fillEmail(node);
	root_.classList.add('reading');
	if (isAbout(node)) {
		aboutInstant(ident);
		railInstant(0);
	}
	readingSlug = node.dataset.slug ?? null;
	openedFromHome = false;
	history.replaceState({ reading: readingSlug }, '', location.pathname);
	catsEl.inert = true;
	const want = node.dataset.cat ? catIndex(node.dataset.cat) : -1;
	readCat = want >= 0 ? want : S.catI;
	if (readCat !== S.catI) {
		markCat(readCat);
		jumpTo(readCat);
		emphasizeNow(readCat);
	}
	fillInfo(node);
	infoEl.style.opacity = '1';
	for (const l of lists) for (const el of l.querySelectorAll<HTMLElement>(':scope > li')) el.style.opacity = '0';
	readerEl.style.opacity = '1';
	tocEl.style.opacity = '1';
	// 字体和图片会改变正文高度：等它们就位再排目录
	reading = new Reader(readerEl, node, tocEl, railX, tocSpan, reduce);
	document.fonts?.ready.then(() => reading?.build());
}

// 浏览器后退 / 前进
addEventListener('popstate', (e) => {
	const st = e.state as { reading?: string } | null;
	if (reading && !st?.reading) closeArticle(true);
	else if (!reading && st?.reading) openArticle(`/${st.reading}/`, false);
});

// 鼠标悬停在已选中的卡片上时就先取文章，点开时几乎不用等
stageEl.addEventListener('pointerover', (e) => {
	const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('.block.active a');
	if (a) fetchDoc(a.href);
});

// ---------------------------------------------------------------- 搜索

const sForm = $<HTMLFormElement>('#search');
const sInput = $<HTMLInputElement>('#search-input');
const sLine = $<SVGPathElement>('#search-line');
let sOpen = false;

function openSearch() {
	if (S.stage !== 'home' || sOpen) return;
	// 搜索框在 banner 上，阅读时也点得到：先倒着放回主页，搜索结果才有地方显示
	sOpen = true;
	sForm.classList.add('open');
	sInput.tabIndex = 0;
	run(sLine, [{ strokeDashoffset: Number(getComputedStyle(sLine).strokeDashoffset) || 1 }, { strokeDashoffset: 0 }], d(320));
	sInput.focus({ preventScroll: true });
}

function closeSearch() {
	if (!sOpen) return;
	sOpen = false;
	sForm.classList.remove('open');
	sInput.tabIndex = -1;
	run(sLine, [{ strokeDashoffset: Number(getComputedStyle(sLine).strokeDashoffset) || 0 }, { strokeDashoffset: 1 }], d(240), { easing: EASE_IN });
	if (document.activeElement === sInput) sInput.blur();
	focusActive();
}

/** 相关度：标题命中最重（开头命中再加分），分类其次，简介最轻；每个词都要命中 */
function score(p: (typeof boot.search)[number], terms: string[]) {
	const t = p.title.toLowerCase();
	const c = p.cat.toLowerCase();
	const s = p.desc.toLowerCase();
	let total = 0;
	for (const w of terms) {
		let k = 0;
		if (t.includes(w)) k += 8 + (t.startsWith(w) ? 4 : 0) + (t === w ? 4 : 0);
		if (c.includes(w)) k += 4;
		if (s.includes(w)) k += 2 + Math.min(2, s.split(w).length - 2);
		if (!k) return 0;
		total += k;
	}
	return total;
}

/** 按查询重建「搜索」那一列：从「最新」里克隆文章块，按相关度排序 */
function fillSearch(q: string) {
	const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
	const hits = boot.search
		.map((p, i) => ({ p, i, s: score(p, terms) }))
		.filter((h) => h.s > 0)
		.sort((a, b) => b.s - a.s || a.i - b.i);
	const latest = lists.find((l) => l.dataset.cat === 'latest')!;
	const bySlug = new Map(blocksOf(latest).map((b) => [b.dataset.slug!, b]));
	const items = hits.map((h) => bySlug.get(h.p.slug)?.cloneNode(true) as HTMLElement | undefined).filter((x): x is HTMLElement => !!x);
	for (const el of items) el.removeAttribute('style');
	if (!items.length) {
		const li = document.createElement('li');
		li.className = 'empty';
		li.dataset.zh = boot.ui.noResult.zh;
		li.dataset.en = boot.ui.noResult.en;
		li.textContent = boot.ui.noResult[S.lang];
		items.push(li);
	}
	searchList.replaceChildren(...items);
	S.selBy.search = 0;
	searchCard.querySelector('.cat-count')!.textContent = String(hits.length);
}


async function submitSearch() {
	const q = sInput.value.trim();
	if (!q || S.stage !== 'home' || entering) return;
	if (reading) await closeArticle();
	while (readBusy) await new Promise((r) => setTimeout(r, 30));
	query = q;
	fillSearch(q);
	sInput.blur();
	if (searchCard.hidden) {
		// 「搜索」插进环里当前章节的前面一格（左边那格），从屏幕左边外滑进来；
		// 在收文章的同时进行，赶在章节行开始滑动前到位，滑动一口气直达「搜索」
		addSearchCard();
		const r = searchCard.getBoundingClientRect();
		beforeSlide = run(searchCard, [{ translate: `${-(r.right + 40)}px 0` }, { translate: '0 0' }], d(phase === 'idle' ? 380 : 260), { easing: EASE }).then(() => {
			beforeSlide = null;
		});
	}
	dirty = S.shownI === 0;
	dir = 0;
	S.catI = 0;
	save();
	cycle();
}

sForm.addEventListener('submit', (e) => {
	e.preventDefault();
	submitSearch();
});
$('#search-btn').addEventListener('click', () => {
	if (!sOpen) openSearch();
	else if (sInput.value.trim()) submitSearch();
	else closeSearch();
});
sInput.addEventListener('keydown', (e) => {
	// 输入框里的按键不冒泡给全局：方向键、Esc 等都属于输入框
	e.stopPropagation();
	if (e.key === 'Escape') {
		e.preventDefault();
		closeSearch();
	}
});

// ---------------------------------------------------------------- 语言

const langCode = $('#lang-code');

function setLang(l: typeof S.lang) {
	S.lang = l;
	applyLang(l);
	langCode.textContent = l === 'zh' ? '中' : 'EN';
	relangCover();
}

// 切换语言：和离开主页同一套动作把内容收掉（文章卡片 / 正文 → 标示线 → banner 和章节行 → 名字），
// 但不回封面，换成另一种语言后，再按进主页的顺序放出来。阅读时同理：正文、目录、标题条代替文章卡片。
let langBusy = false;
const names = $$('.name', ident);
const fadeNames = (a: number, b: number, ms: number) =>
	Promise.all(names.map((n) => run(n, [{ opacity: a }, { opacity: b }], ms, a > b ? { easing: EASE_IN } : {})));

$('#lang-btn').addEventListener('click', async () => {
	if (langBusy || S.stage !== 'home' || entering || readBusy) return;
	langBusy = true;
	while (phase !== 'idle') await wait(40);
	const l = S.lang === 'zh' ? 'en' : 'zh';
	storeLang(l);
	closeSearch();
	home.inert = true;
	const L = lists[S.shownI];
	if (reading) {
		await Promise.all([
			run(readerEl, [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-18px)' }], d(300), { easing: EASE_IN }),
			run(tocEl, [{ opacity: 1 }, { opacity: 0 }], d(240), { easing: EASE_IN }),
			run(infoEl, [{ opacity: 1 }, { opacity: 0 }], d(240), { easing: EASE_IN }),
		]);
	} else await blocksOut(L);
	await railShrink();
	await Promise.all([bannerOut(), fadeNames(1, 0, d(420))]);

	setLang(l);
	await Promise.all([document.fonts?.ready, wait(d(120))]);
	placeIdent();
	buildCatFrames();
	emphasizeNow(reading && readCat >= 0 ? readCat : S.catI);

	await Promise.all([bannerIn(), fadeNames(0, 1, d(520))]);
	if (!aboutNow()) await railGrow();
	if (reading) {
		reading.build();
		await Promise.all([
			run(readerEl, [{ opacity: 0, transform: 'translateX(-18px)' }, { opacity: 1, transform: 'translateX(0)' }], d(420)),
			run(tocEl, [{ opacity: 0 }, { opacity: 1 }], d(420), { delay: d(120) }),
			run(infoEl, [{ opacity: 0 }, { opacity: 1 }], d(420), { delay: d(60) }),
		]);
	} else {
		park(L);
		await blocksIn(L);
		noTrans(L, false);
	}
	home.inert = false;
	langBusy = false;
	focusActive();
});

// ---------------------------------------------------------------- 封面 ⇄ 主页

async function enterHome() {
	if (S.stage !== 'cover') return;
	setStage('busy');
	entering = true;
	const L = lists[S.catI];
	park(L);
	if (hasCover) await coverOut();
	home.inert = false;
	avatarBtn.tabIndex = 0;
	setStage('home');
	await bannerIn();
	root_.classList.add('show-home');
	await railGrow();
	await blocksIn(L);
	noTrans(L, false);
	entering = false;
	focusActive();
}

async function backToCover() {
	if (!hasCover || S.stage !== 'home' || phase !== 'idle' || entering) return;
	setStage('busy');
	closeSearch();
	home.inert = true;
	avatarBtn.tabIndex = -1;
	await blocksOut(lists[S.catI]);
	await railShrink();
	root_.classList.remove('show-home');
	await bannerOut();
	setStage('cover');
	await coverIn();
	avatarBtn.focus({ preventScroll: true });
}

const root_ = document.documentElement;

/** 不放动画，直接摆成主页的样子（刷新、后退、站内返回） */
function instantHome() {
	if (hasCover) coverHidden();
	bannerLines.forEach((p) => (p.style.strokeDashoffset = '0'));
	sides.forEach((s) => (s.style.opacity = '1'));
	catsEl.style.opacity = '1';
	railInstant(1);
	root_.classList.add('show-home');
	const L = lists[S.catI];
	noTrans(L, true);
	layout(L);
	cardsInstant(L);
	requestAnimationFrame(() => noTrans(L, false));
	home.inert = false;
	avatarBtn.tabIndex = 0;
	setStage('home');
	focusActive();
}

// ---------------------------------------------------------------- 输入

addEventListener('keydown', (e) => {
	if (e.altKey || e.ctrlKey || e.metaKey) return;
	const k = e.key;
	if (S.stage === 'cover') {
		if (k === 'Enter' || k === ' ' || k === 'ArrowDown' || k === 'PageDown') {
			e.preventDefault();
			enterHome();
		} else if (k === 'ArrowRight' || k === 'ArrowLeft') {
			e.preventDefault();
			if (canSlide()) nextSlide(k === 'ArrowRight' ? 1 : -1);
		}
		return;
	}
	if (S.stage !== 'home') {
		if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
		return;
	}
	const handled = (fn: () => unknown) => {
		e.preventDefault();
		fn();
	};
	if (reading || readBusy) {
		// 阅读时方向键、空格留给页面滚动；Esc 回主页
		if (k === 'Escape') handled(() => closeArticle());
		return;
	}
	if (k === 'ArrowRight') handled(() => switchCat(neighbor(S.catI, 1), 1));
	else if (k === 'ArrowLeft') handled(() => switchCat(neighbor(S.catI, -1), -1));
	else if (k === 'ArrowDown') handled(() => move(1));
	else if (k === 'ArrowUp') handled(() => move(-1));
	else if (k === 'Enter') handled(open);
	// 输入框获得焦点时 Esc 由它自己处理（收起搜索框）；其余时候 Esc = 回封面
	else if (k === 'Escape') handled(backToCover);
	else if (k === '/') handled(openSearch);
});

// 封面上点头像或名字 = 进主页；主页上点头像 = 进 About（回封面用 Esc）
ident.addEventListener('click', () => {
	if (S.stage === 'cover') enterHome();
	else if (S.stage === 'home') {
		if (reading) closeArticle();
		else {
			save();
			openArticle('/about/');
		}
	}
});

// About 卷首的大头像 = banner 上的头像搬下来了，点它同样回主页
readerEl.addEventListener('click', (e) => {
	if ((e.target as HTMLElement).closest('.ah-av') && reading) closeArticle();
});

dialog.addEventListener('click', (e) => {
	if (S.stage === 'cover' && !onEdge()) enterHome();
	e.stopPropagation();
});

// 点右边的章节就向右滚到它（哪怕向左绕更近），点左边那一格就向左：和眼睛看到的方向一致
cats.forEach((c, i) =>
	c.addEventListener('click', () => {
		if (reading) return;
		const here = cats[S.catI].getBoundingClientRect().left;
		switchCat(i, c.getBoundingClientRect().left >= here ? 1 : -1);
	}),
);

// 点文章块：没选中的先选中，已选中的才进入文章
stageEl.addEventListener('click', (e) => {
	const li = (e.target as HTMLElement).closest<HTMLElement>('.block');
	if (!li || S.stage !== 'home') return;
	const l = lists[S.catI];
	const idx = blocksOf(l).indexOf(li);
	const id = l.dataset.cat!;
	e.preventDefault();
	if (idx !== (S.selBy[id] ?? 0)) {
		if (phase !== 'idle') return;
		S.selBy[id] = idx;
		layout(l);
		save();
		return;
	}
	open();
});

// 滚轮：封面上向下 = 进主页；主页上文章区上下选，章节行左右切。
// 滚动量累计起来，每满一格（鼠标滚轮的一格 ≈ 100px）走一步：滚得多就走得多，触控板的小增量也能攒起来。
// 停下超过一会儿、或者换了方向，就清零，免得上次剩下的零头算进下一次。
const WHEEL_STEP = 100;
let wheelAcc = 0;
let wheelAt = 0;
addEventListener(
	'wheel',
	(e) => {
		if (reading || readBusy || langBusy) return; // 阅读时滚轮用来滚正文
		const now = performance.now();
		if (now - wheelAt > 280) wheelAcc = 0;
		wheelAt = now;
		let dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
		if (e.deltaMode === 1) dy *= 40;
		else if (e.deltaMode === 2) dy *= innerHeight;
		if (S.stage === 'cover') {
			if (dy > 8) enterHome();
			return;
		}
		if (S.stage !== 'home') return;
		if (Math.sign(dy) !== Math.sign(wheelAcc)) wheelAcc = 0;
		wheelAcc += dy;
		const n = Math.trunc(wheelAcc / WHEEL_STEP);
		if (!n) return;
		wheelAcc -= n * WHEEL_STEP;
		const s = Math.sign(n) as 1 | -1;
		if ((e.target as HTMLElement).closest('#cats')) {
			let to = S.catI;
			for (let k = 0; k < Math.abs(n); k++) to = neighbor(to, s);
			switchCat(to, s);
		} else move(n);
	},
	{ passive: true },
);

// 触屏：上滑 = 下一篇 / 进主页，左右滑 = 切分类（封面上左右滑 = 切幻灯片）
let tx = 0;
let ty = 0;
addEventListener(
	'touchstart',
	(e) => {
		tx = e.touches[0].clientX;
		ty = e.touches[0].clientY;
	},
	{ passive: true },
);
addEventListener(
	'touchend',
	(e) => {
		if (reading || readBusy) return;
		const dx = e.changedTouches[0].clientX - tx;
		const dy = e.changedTouches[0].clientY - ty;
		if (Math.max(Math.abs(dx), Math.abs(dy)) < 36) return;
		const horiz = Math.abs(dx) > Math.abs(dy);
		if (S.stage === 'cover') {
			if (!horiz && dy < 0) enterHome();
			else if (horiz && canSlide()) nextSlide(dx < 0 ? 1 : -1);
		} else if (S.stage === 'home') {
			if (horiz) switchCat(neighbor(S.catI, dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
			else move(dy < 0 ? 1 : -1);
		}
	},
	{ passive: true },
);

let resizeT = 0;
addEventListener('resize', () => {
	clearTimeout(resizeT);
	resizeT = window.setTimeout(() => {
		redrawCover();
		if (S.stage === 'busy' || phase !== 'idle') return;
		jumpTo(S.catI);
		buildCatFrames();
		markCat(S.catI);
		emphasizeNow(S.catI);
		buildRail(railFoot());
		railInstant(S.stage === 'home' && !aboutNow() ? 1 : 0);
		const L = lists[S.catI];
		noTrans(L, true);
		layout(L);
		rebuildCards(L);
		requestAnimationFrame(() => noTrans(L, false));
	}, 120);
});

// ---------------------------------------------------------------- 启动

(function start() {
	const l = getLang(boot.lang);
	if (l !== boot.lang) setLang(l);
	else S.lang = l;

	const saved = load();
	if (saved) {
		if (saved.q) {
			query = saved.q;
			sInput.value = saved.q;
			fillSearch(saved.q);
			searchCard.hidden = false;
		}
		const ci = lists.findIndex((x) => x.dataset.cat === saved.cat);
		if (ci > 0 || (ci === 0 && saved.q)) S.catI = ci;
		for (const x of lists) {
			const slug = saved.sel?.[x.dataset.cat!];
			const idx = slug ? blocksOf(x).findIndex((b) => b.dataset.slug === slug) : -1;
			if (idx >= 0) S.selBy[x.dataset.cat!] = idx;
		}
	}
	// 站内回来接着用原来那张；第一次进来随机挑一张
	const back = saved && Number.isInteger(saved.slide) && saved.slide >= 0 && saved.slide < boot.slides.length;
	if (hasCover) initSlide(back ? saved!.slide : null);
	S.shownI = S.catI;
	lists.forEach((x, i) => (x.hidden = i !== S.catI));
	placeIdent();
	buildFrame();
	buildNext();
	jumpTo(S.catI);
	buildCatFrames();
	markCat(S.catI);
	emphasizeNow(S.catI);
	buildRail(railFoot());
	if (hasCover) preload(S.slideI);

	// 刷新、浏览器后退、从本站页面回来：直接回到原位，不放封面
	const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
	const type = nav?.type ?? 'navigate';
	let fromSite = false;
	try {
		fromSite = !!document.referrer && new URL(document.referrer).origin === location.origin;
	} catch {
		/* 非法 referrer */
	}
	if (boot.open) {
		// 文章页（/<slug>/、/about/）：文章已经在阅读区里，直接摆成主页 + 阅读模式，不放封面
		instantHome();
		startReading();
	} else if (saved && (type === 'reload' || type === 'back_forward' || fromSite)) instantHome();
	else if (!hasCover) {
		setStage('cover');
		run(ident, [{ opacity: 0 }, { opacity: 1 }], d(600)).then(enterHome);
	} else {
		setStage('cover');
		firstCover(ident);
	}
	save();
})();

