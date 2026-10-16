// 主页的文章列、标示线、文章卡片的框。
//
// 标示线：当前章节卡片左边那个小框（frame.ts 的 bracket）向上延伸出去的一道墨线，
// 一直拉到文章区顶部。作用是纵向对齐和「屏障」：文章越过它就渐隐（.list 的遮罩）。
//
// 文章卡片没有边框和底色。它的「框」是：左边 = 标示线（再在卡片高度处多一个 bracket），
// 右上、右下两个角 = 和对话框同一种笔法的 corner，向左和向中间延伸。
// 出现时：两个角先在标示线右边一点点的地方各冒出一个点，一边书写一边向右移到右边界
// （右边界和标示线关于卡片对称，但不画出来）；角到位后，图片和文字整段淡入。
// 收回：内容淡出、角收回成点、整块向左滑过标示线消失。

import { InkGroup, pen, type Plan } from '../ink';
import { $, $$, cssNum, cssPx, d, EASE_IN, reduce, run, S, U } from './core';
import { activeCardCorner, cardCorner, marker, P, place, placeCorner, type Strand } from './frame';

export const stageEl = $('#stage');
const railSvg = $<SVGSVGElement>('#rail');
export const lists = $$<HTMLOListElement>('.list', stageEl);

// ---------------------------------------------------------------- 标示线

const railG = new InkGroup();

/** 标示线的 x（相对视口），由 CSS 变量 --rail-x 决定 */
export const railX = () => stageEl.getBoundingClientRect().left + cssPx('--rail-x', 160, stageEl);

/**
 * 标示线画在覆盖整个主页的 svg 上：一根贯穿文章区和章节行的竖线，
 * 从章节行下方起笔一直拉到文章区顶部。线上每篇文章、当前章节的位置挂着荆棘饰（那些由各自的框画）。
 * bottom = 章节行中线的 y（视口坐标）
 */
export function buildRail(bottom: number) {
	const u = U();
	const r = railSvg.getBoundingClientRect();
	railSvg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
	railSvg.replaceChildren();
	const x = railX() - r.left;
	const y0 = bottom - r.top;
	const top = stageEl.getBoundingClientRect().top - r.top + 4 * u;
	const foot = y0 + 46 * u;
	const len = foot - top;
	const W = cssPx('--rail-w', 2) / 2 + 0.5;
	const strands: Strand[] = [
		// 主线：笔直、两头出锋，从底部向上写
		{ w: W * 1.6, from: 0, to: 1, grow: Math.max(60, len * 0.2), lead: 30, pts: [P(x, foot), P(x, foot - len * 0.3), P(x, foot - len * 0.65), P(x, top)] },
	];
	railG.set(place(railSvg, strands, (q) => q));
}

export const railGrow = () => railG.to(1, d(420), reduce);
export const railShrink = () => railG.to(0, d(200), reduce);
export const railInstant = (g: number) => railG.draw(g);

// ---------------------------------------------------------------- 文章卡片

export const blocksOf = (l: HTMLElement) => $$('.block', l);
export const itemsOf = (l: HTMLElement) => $$(':scope > li', l);

type Card = { g: InkGroup; w: number; h: number; right: SVGGElement; on: Plan[]; off: Plan[]; active: boolean | null };
const cards = new WeakMap<HTMLElement, Card>();

/**
 * 卡片的框：右上、右下两个角，左边一个挂在标示线上的标记（底边压在线上，尖朝左）。
 * 当前那篇用「长臂」的角和大标记；其余的用「同笔缩小」的角和小标记——两套都建好，
 * 按卡片当前是否选中写出其中一套（另一套画成 0）。
 * 坐标以卡片左上为原点；svg 比卡片大一圈，好让角尖伸出去。
 */
function buildCard(el: HTMLElement): Card {
	const svg = el.querySelector<SVGSVGElement>('.block-frame')!;
	const w = el.offsetWidth;
	const h = el.offsetHeight;
	const pad = 60;
	svg.setAttribute('viewBox', `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`);
	svg.replaceChildren();
	const inset = cssPx('--block-inset', 26, stageEl);
	const plans: Plan[] = [];
	// 右边两个直角钩放在一个组里，展开时整组从左边平移到位
	const right = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	svg.appendChild(right);
	// 右上、右下两个角（臂向左、向中间）
	const on = [
		...placeCorner(right, activeCardCorner(Math.min(w * 0.36, 300), h * 0.24), w, 0, -1, 1),
		...placeCorner(right, activeCardCorner(Math.min(w * 0.36, 300), h * 0.24), w, h, -1, -1),
		...place(svg, marker('big'), (q) => P(-inset + q.x, h * 0.5 + q.y)),
	];
	const off = [
		...placeCorner(right, cardCorner(Math.min(w * 0.2, 150), h * 0.24), w, 0, -1, 1),
		...placeCorner(right, cardCorner(Math.min(w * 0.2, 150), h * 0.24), w, h, -1, -1),
		...place(svg, marker('small'), (q) => P(-inset + q.x, h * 0.5 + q.y)),
	];
	plans.push(...on, ...off);
	const g = new InkGroup(plans);
	g.draw(0);
	const c: Card = { g, w, h, right, on, off, active: null };
	cards.set(el, c);
	return c;
}

const cardOf = (el: HTMLElement) => {
	const c = cards.get(el);
	return c && c.w === el.offsetWidth && c.h === el.offsetHeight ? c : buildCard(el);
};

/**
 * 卡片的「展开度」u（0..1）：框的书写进度、框从左边的点向右移到位、内容淡入，都由它驱动。
 *   0..0.75  框边写边向右移（右边两个角从 x≈0 移到 x=w）
 *   0.75..1  图片和文字整段淡入
 */
function setU(el: HTMLElement, u: number) {
	const c = cardOf(el);
	el.dataset.u = String(u);
	const f = Math.min(1, u / 0.75);
	// 只写和当前状态对应的那一套框，另一套保持收起
	const on = el.classList.contains('active');
	drawPlans(on ? c.on : c.off, f);
	drawPlans(on ? c.off : c.on, 0);
	c.g.g = f;
	// 角从「标示线右边一点点」移到右边界
	c.right.setAttribute('transform', `translate(${(-(1 - easeOut(f)) * (c.w - 12)).toFixed(1)} 0)`);
	const content = el.querySelector<HTMLElement>('.block-link')!;
	content.style.opacity = String(Math.max(0, (u - 0.75) / 0.25));
}
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** 按总进度 g 画一组笔画（和 InkGroup.draw 同一套时间表） */
function drawPlans(plans: Plan[], g: number) {
	for (const p of plans) p.ink.draw(pen(Math.min(1, Math.max(0, (g - p.from) / (p.to - p.from)))));
}

const anims = new WeakMap<HTMLElement, object>();
/** 正在被 layout() 补展开的卡片（滚进视窗时），免得每次 layout 都重开一遍动画 */
const growing = new WeakSet<HTMLElement>();
/** 把卡片的 u 从当前值动画到 target；新的调用会接管旧的 */
function animU(el: HTMLElement, target: number, ms: number, delay = 0): Promise<void> {
	const tok = {};
	anims.set(el, tok);
	const u0 = Number(el.dataset.u ?? 0);
	const dur = ms * Math.abs(target - u0);
	if (reduce || dur < 1) {
		setU(el, target);
		return Promise.resolve();
	}
	return new Promise((done) => {
		const t0 = performance.now() + delay;
		const frame = (now: number) => {
			if (anims.get(el) !== tok) return done();
			const t = Math.min(1, Math.max(0, (now - t0) / dur));
			setU(el, u0 + (target - u0) * t);
			if (t < 1) requestAnimationFrame(frame);
			else done();
		};
		requestAnimationFrame(frame);
	});
}

const T = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) scale(${s})`;

/** 按当前选中项把文章卡片摆好：选中的略放大，上面的变淡，下面的照常 */
/**
 * 每一列自己的「视窗」偏移（px）：所有卡片一样大，排成一列，选中的那篇略放大。
 * 视窗只在需要时才动：选中项的前一篇和后一篇都要在屏幕里（除非它是第一篇或最后一篇），
 * 往下切到某一篇，只有当它的下一篇会掉出屏幕时整列才上滑；往上同理。
 */
const scrollOf = new WeakMap<HTMLElement, number>();

export function layout(l: HTMLElement) {
	const items = itemsOf(l);
	if (!items.length) return;
	const n = items.length;
	const sel = Math.min(S.selBy[l.dataset.cat!] ?? 0, n - 1);
	const s = cssNum('--active-scale', 1.06);
	const h = items[0].offsetHeight;
	const gap = cssPx('--block-gap', 36);
	const H = stageEl.clientHeight;
	// 上下各留一点：列表两头有 70px 的淡出（home-main.css），完整显示的卡片不要落进淡出区太深
	const pad = Math.min(36, H * 0.05);
	const extra = h * (s - 1); // 选中那篇放大多出来的高度，平分给上下
	// 第 i 篇在「列」里的顶部位置（不含视窗偏移）
	// 选中那篇以自己的中线为准放大（transform-origin 在左边中点），所以它前面的往上让半份、后面的往下让半份
	const top = (i: number) => i * (h + gap) + (i < sel ? -extra / 2 : i > sel ? extra / 2 : 0);
	const bottomOf = (i: number) => top(i) + h + (i === sel ? extra / 2 : 0);
	const topOf = (i: number) => top(i) - (i === sel ? extra / 2 : 0);
	// 需要完整可见的范围：选中项的前一篇 … 后一篇
	const lo = Math.max(0, sel - 1);
	const hi = Math.min(n - 1, sel + 1);
	let off = scrollOf.get(l) ?? 0;
	const viewTop = pad;
	const viewBot = H - pad;
	if (topOf(lo) - off < viewTop) off = topOf(lo) - viewTop;
	if (bottomOf(hi) - off > viewBot) off = bottomOf(hi) - viewBot;
	// 范围本身比屏幕还高时，优先保证选中项和它的前一篇
	if (topOf(lo) - off < viewTop) off = topOf(lo) - viewTop;
	// 下限是「第一篇顶到 pad」，不是 0：选中项前面的卡片会往上让半份放大量，可能是负的
	const minOff = Math.min(0, topOf(0) - viewTop);
	off = Math.max(minOff, Math.min(off, Math.max(minOff, bottomOf(n - 1) - viewBot)));
	scrollOf.set(l, off);
	items.forEach((el, i) => {
		const k = i - sel;
		const sc = k === 0 ? s : 1;
		const y = top(i) - off;
		const vis = y + h > -h * 0.2 && y < H;
		el.dataset.y = String(y);
		el.dataset.sc = String(sc);
		el.style.transform = T(0, y, sc);
		el.style.opacity = vis ? (k === 0 ? '1' : '0.82') : '0';
		const was = el.classList.contains('active');
		el.classList.toggle('active', k === 0);
		if (was !== (k === 0) && isBlock(el) && el.dataset.u) setU(el, Number(el.dataset.u));
		const a = el.querySelector('a');
		if (a) a.tabIndex = k === 0 ? 0 : -1;
		// 列表已经展开（不是在 park / 收回的过程中）时，滚进视窗的卡片还没展开过（u = 0），就地展开它
		if (vis && isBlock(el) && l.dataset.open === '1' && Number(el.dataset.u ?? 0) < 1 && !growing.has(el)) {
			growing.add(el);
			animU(el, 1, d(760)).then(() => growing.delete(el));
		}
	});
}

export const noTrans = (l: HTMLElement, on: boolean) => l.classList.toggle('no-trans', on);

const visible = (l: HTMLElement) => itemsOf(l).filter((el) => Number(el.dataset.y) < stageEl.clientHeight && el.style.opacity !== '0');
const isBlock = (el: HTMLElement) => el.classList.contains('block');

/** 把一列摆好，框和内容都收成 0，等着展开 */
export function park(l: HTMLElement) {
	l.dataset.open = '0';
	noTrans(l, true);
	layout(l);
	for (const el of itemsOf(l)) {
		if (isBlock(el)) setU(el, 0);
		else el.style.opacity = '0';
	}
}

/** 收回：内容淡出、框收回成点，同时整块向左滑过标示线消失 */
export async function blocksOut(l: HTMLElement) {
	l.dataset.open = '0';
	noTrans(l, true);
	await Promise.all(
		visible(l).map((el, i) => {
			const y = Number(el.dataset.y);
			const sc = Number(el.dataset.sc);
			const from = getComputedStyle(el).transform;
			for (const a of el.getAnimations()) a.cancel();
			const X = -(el.offsetWidth * 0.35 + 120);
			const slide = run(el, [{ transform: from === 'none' ? T(0, y, sc) : from }, { transform: T(X, y, sc) }], d(200), { delay: d(i * 12), easing: EASE_IN });
			const fold = isBlock(el) ? animU(el, 0, d(240), d(i * 12)) : run(el, [{ opacity: el.style.opacity || '1' }, { opacity: 0 }], d(160));
			return Promise.all([slide, fold]).then(() => {
				// 收完就彻底藏起来，回到原位等下次展开
				el.style.opacity = '0';
				el.style.transform = T(0, y, sc);
				if (isBlock(el)) setU(el, 0);
			});
		}),
	);
}

/** 展开：框从标示线右边的点一边写一边右移到位，然后内容淡入 */
export async function blocksIn(l: HTMLElement) {
	noTrans(l, true);
	layout(l);
	await Promise.all(
		visible(l).map((el, i) => {
			if (!isBlock(el)) return run(el, [{ opacity: 0 }, { opacity: 1 }], d(300));
			el.style.opacity = el.classList.contains('active') || Number(el.dataset.y) >= 0 ? el.style.opacity : '0';
			const start = Number(el.dataset.u ?? 0);
			if (start === 0) setU(el, 0);
			// 依次出现：上一篇展开到 40% 时下一篇才开始
			return animU(el, 1, d(760), d(i * 760 * 0.4));
		}),
	);
	l.dataset.open = '1';
}

/** 打断展开：停在当前进度（下一次收回从这里开始） */
export function freezeBlocks(l: HTMLElement) {
	for (const el of itemsOf(l)) anims.set(el, {});
}

/** 尺寸变了：框按新尺寸重建，保持展开度 */
export function rebuildCards(l: HTMLElement) {
	for (const el of blocksOf(l)) {
		buildCard(el);
		setU(el, Number(el.dataset.u ?? 1));
	}
}

/** 不放动画直接展开（刷新、后退回来） */
export function cardsInstant(l: HTMLElement) {
	for (const el of blocksOf(l)) setU(el, 1);
	l.dataset.open = '1';
}

export function bounceV(l: HTMLElement, dir: number) {
	l.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-dir * 16}px)` }, { transform: 'translateY(0)' }], {
		duration: d(260),
		easing: 'ease-out',
	});
}

