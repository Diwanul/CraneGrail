// 章节行：一个首尾相接的环。当前章节永远停在左边第二格，标示线压在它左缘上；
// 它前面那格是上一个章节，再往前的绕到最后面去。
//
// 滑动按速度规则走（不是一段段固定时长的动画）：位置 p 是一个连续的「格数」，
// 每一帧离目标还剩 dist，期望速度 v* = min(vmax, √(2·a·dist))，实际速度以很短的时间常数追向 v*。
// 起步平滑但很快地加速到 vmax，不论滑多远最高速度都不变；半路改目标只是换一个 dist，速度连续。
//
// 每张卡片的位置 = (它在环上离 p 的有符号距离) × 格宽，绕着环取最近的那一边。
// 可见范围就是居中栏（--ox 到 100vw − --ox）：越出这一栏的卡片一边滑一边淡出，完全出去就隐藏，
// 绕回来进入栏内时再淡入。
//
// 当前格右边固定多留一段（放大后不压到下一格），这段间距不随强调伸缩，滑动时只是均匀地插在格子之间。
// 「当前」的强调（放大、上浮、暗晕、右侧的框和大标记）不跟着滑动连续变，
// 而是一个单独的量 E（0..1），只属于 hl 这一格：切章节时先把 E 收到 0、再滑、到了新格再把 E 放到 1。

import { InkGroup } from '../ink';
import { $, $$, boot, cssNum, cssPx, reduce } from './core';
import { catCorner, marker, P, place, placeCorner } from './frame';

export const track = $('#cats-track');
export const cats = $$<HTMLButtonElement>('.cat', track);
export const searchCard = cats[0];

const VMAX = 0.012 * boot.speed; // 格/ms
const ACC = 0.00006 * boot.speed * boot.speed; // 格/ms²
const TAU = 55 / boot.speed; // ms

let p = 0;
let v = 0;
let target = 0;
let raf = 0;
let last = 0;
let arrive: (() => void)[] = [];
/** 强调：属于哪一张卡片（cats 下标）、强调程度 */
let hl = -1;
let E = 0;
let eTok: object | null = null;

/** 环上的卡片（「搜索」没用过时不在环上） */
const ring = () => cats.filter((c) => !c.hidden);
const ringIndex = (i: number) => ring().indexOf(cats[i]);

const step = () => cssPx('--cat-w', 200) + cssPx('--cat-gap', 24);
/** 当前格（左边第二格）左缘的 x，相对 .cats */
const slot0 = () => cssPx('--rail-x', 260, track.parentElement!);

function paint() {
	const R = ring();
	const n = R.length;
	const s = step();
	const x0 = slot0();
	const W = track.parentElement!.clientWidth;
	const ox = cssPx('--ox', 0, track.parentElement!);
	const lo = ox; // 居中栏左缘
	const hi = W - ox; // 居中栏右缘
	for (let k = 0; k < n; k++) {
		// 在环上离 p 的有符号距离，取 [-1, n-1) 这一圈：左边只留一格，其余都在右边
		let off = (((k - p) % n) + n) % n;
		if (off >= n - 1) off -= n;
		// 当前格（off = 0）右边固定多留放大多出来的宽度；off 在 0..1 之间按比例插进去，所以滑动是匀的
		const grow = (cssNum('--cat-active-scale', 1.3) - 1) * cssPx('--cat-w', 168) + 18;
		const x = x0 + off * s + grow * Math.min(1, Math.max(0, off));
		const el = R[k];
		// 超出居中栏：越出去越透明，完全出去就隐藏
		const over = x < lo ? (lo - x) / s : x + s > hi ? (x + s - hi) / s : 0;
		const e = R[k] === cats[hl] ? E : 0;
		const sc = 1 + (cssNum('--cat-active-scale', 1.14) - 1) * e;
		el.style.transform = `translate(${x.toFixed(1)}px, calc(-50% - ${(6 * e).toFixed(2)}px)) scale(${sc.toFixed(4)})`;
		el.style.setProperty('--e', e.toFixed(3));
		el.style.opacity = String(Math.max(0, 1 - over * 2.2));
		el.style.visibility = over >= 0.45 ? 'hidden' : '';
	}
	for (const c of cats) if (c.hidden) c.style.opacity = '0';
}

function frame(now: number) {
	const dt = Math.min(40, now - last);
	last = now;
	const dist = target - p;
	const want = Math.sign(dist) * Math.min(VMAX, Math.sqrt(2 * ACC * Math.abs(dist)));
	v += (want - v) * (1 - Math.exp(-dt / TAU));
	const d = v * dt;
	if ((Math.abs(d) >= Math.abs(dist) && Math.sign(d) === Math.sign(dist)) || (Math.abs(dist) < 0.002 && Math.abs(v) < 0.0003)) {
		p = target;
		v = 0;
	} else p += d;
	paint();
	if (p === target) {
		raf = 0;
		// 落位后把 p 规整回 [0, n)，免得一直绕圈数字越来越大
		const n = ring().length;
		p = target = ((p % n) + n) % n;
		const fs = arrive;
		arrive = [];
		fs.forEach((f) => f());
		return;
	}
	raf = requestAnimationFrame(frame);
}

/** 沿环上较近的方向（或按 dir 指定的方向）滑到第 i 张卡片 */
export function slideTo(i: number, dir = 0): Promise<void> {
	const n = ring().length;
	const k = ringIndex(i);
	if (k < 0) return Promise.resolve();
	const base = ((target % n) + n) % n;
	let delta = k - base;
	if (dir > 0 && delta < 0) delta += n;
	else if (dir < 0 && delta > 0) delta -= n;
	else if (!dir) {
		if (delta > n / 2) delta -= n;
		if (delta < -n / 2) delta += n;
	}
	target += delta;
	if (reduce) {
		p = target;
		v = 0;
		paint();
	}
	return new Promise((r) => {
		if (p === target && !raf) {
			r();
			return;
		}
		arrive.push(r);
		if (!raf) {
			last = performance.now();
			raf = requestAnimationFrame(frame);
		}
	});
}

/** 不放动画直接摆到第 i 张 */
export function jumpTo(i: number) {
	const k = Math.max(0, ringIndex(i));
	p = target = k;
	v = 0;
	paint();
}

export const moving = () => raf !== 0;

/**
 * 「搜索」卡片加入环：它是环上的第 0 张，加进来以后其余卡片的环下标都 +1，
 * p 和 target 一起 +1，画面不动。返回它此刻应该在的 x（给滑入动画当终点）。
 */
export function addSearchCard() {
	if (!searchCard.hidden) return;
	searchCard.hidden = false;
	p += 1;
	target += 1;
	// 它隐藏时尺寸是 0，框是按 0×0 生成的（笔画全挤在原点，看着像一个怪图标）；显示出来后按真实尺寸重画
	buildCatFrames();
	paint();
}

export function markCat(i: number) {
	cats.forEach((c, k) => {
		c.classList.toggle('active', k === i);
		c.setAttribute('aria-pressed', String(k === i));
	});
}

/**
 * 强调第 i 张（target = 1）或收起当前强调（target = 0，i 被忽略）。E 从当前值走到目标，
 * 框（大标记 + 右侧两个角）跟着 E 写出 / 收回，小标记反过来。新的调用接管旧的。
 */
export function emphasize(i: number, target: 0 | 1, ms = 170): Promise<void> {
	// 收起（target = 0）总是收「当前强调着的那张」，不管 i 是谁：连按方向键时目标早就变了，
	// 但放大着的还是原来那张，必须把它收掉
	if (target === 1 && i !== hl) {
		// 换了一张：旧的那张如果还亮着，直接收掉
		const old = frames.get(cats[hl]);
		if (old) {
			old.accent.draw(0);
			old.base.draw(1);
		}
		hl = i;
		E = 0;
	}
	const tok = {};
	eTok = tok;
	const f = frames.get(cats[hl]);
	const e0 = E;
	const dur = reduce ? 0 : (ms / boot.speed) * Math.abs(target - e0);
	f?.accent.to(target, ms / boot.speed, reduce);
	f?.base.to(1 - target, ms / boot.speed, reduce);
	if (dur < 1) {
		E = target;
		paint();
		return Promise.resolve();
	}
	return new Promise((done) => {
		const t0 = performance.now();
		const tick = (now: number) => {
			if (eTok !== tok) return done();
			const u = Math.min(1, (now - t0) / dur);
			const k = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
			E = e0 + (target - e0) * k;
			if (!raf) paint();
			if (u < 1) requestAnimationFrame(tick);
			else done();
		};
		requestAnimationFrame(tick);
	});
}

/** 不放动画：直接让第 i 张处于强调状态 */
export function emphasizeNow(i: number) {
	hl = i;
	E = 1;
	cats.forEach((c, k) => {
		const f = frames.get(c);
		f?.accent.draw(k === i ? 1 : 0);
		f?.base.draw(k === i ? 0 : 1);
	});
	paint();
}

/** data-cat 为 id 的那张卡片（cats 下标），没有就 -1 */
export const catIndex = (id: string) => cats.findIndex((c) => c.dataset.cat === id);

/** 下一张 / 上一张（环上的，绕回去） */
export function neighbor(i: number, dir: 1 | -1) {
	const R = ring();
	const k = R.indexOf(cats[i]);
	return cats.indexOf(R[(k + dir + R.length) % R.length]);
}

/** 章节行的中线（视口坐标），标示线从这里下面一点起笔 */
export function railFoot() {
	const r = track.parentElement!.getBoundingClientRect();
	return r.top + r.height / 2;
}

// ---------------------------------------------------------------- 章节卡片的框

// 每张卡片的框分两层：
//   base    所有卡片都有：左边一个很小的三角标记（底边压在卡片左缘）
//   accent  只有当前章节有：一个大的三角标记（底边压在标示线上），加右上、右下两个尖拱角
// 当前章节还会放大、凸出、背后衬一层暗晕。这些都按「离当前格的距离」连续变化，
// 所以滑动途中是平滑地从一张过渡到下一张，而不是到站才跳。
type Frames = { base: InkGroup; accent: InkGroup };
const frames = new Map<HTMLElement, Frames>();

export function buildCatFrames() {
	for (const c of cats) {
		const svg = c.querySelector<SVGSVGElement>('.cat-frame')!;
		const w = c.offsetWidth;
		const h = c.offsetHeight;
		const pad = 40;
		svg.setAttribute('viewBox', `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`);
		svg.replaceChildren();
		// 隐藏着的卡片（还没用过的「搜索」）没有尺寸，先不画，显示时再建
		if (w < 4 || h < 4) {
			frames.delete(c);
			continue;
		}
		const base = new InkGroup(place(svg, marker('tiny'), (q) => P(q.x, h / 2 + q.y)));
		const a = Math.min(w * 0.36, 60);
		const b = h * 0.3;
		const accent = new InkGroup([
			...place(svg, marker('cat'), (q) => P(q.x, h / 2 + q.y)),
			...placeCorner(svg, catCorner(a, b), w, 0, -1, 1),
			...placeCorner(svg, catCorner(a, b), w, h, -1, -1),
		]);
		const on = c === cats[hl] ? E : 0;
		base.draw(1 - on);
		accent.draw(on);
		frames.set(c, { base, accent });
	}
}


/** 到头了：轻轻弹一下（环没有头，只在只有一个章节时用得到） */
export function bounceH(dir: number) {
	track.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-dir * 22}px)` }, { transform: 'translateX(0)' }], {
		duration: reduce ? 0 : 280 / boot.speed,
		easing: 'ease-out',
	});
}
