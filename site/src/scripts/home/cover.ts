// 封面：背景幻灯片、对话框（笔画 + 台词 + 出处 + 倒三角）、左右边缘的切换箭头。
//
// 幻灯片切换是一条可打断的流水线，phase 标出走到哪一步：
//   front  台词淡出 → 对话框收缩
//   fade   当前这张从头像处开始淡出，下面已经铺好下一张（交叉淡化，不经过全黑）
//   text   对话框长出 → 逐字出台词 → 逐字出出处 → 倒三角
//   idle   全部就位，等下一次自动切换
// 任何时候都可以进主页（coverOut 会接管流水线）；背景换完以后（text / idle）就可以再切，
// 新的流水线从当前的样子开始收，不必等台词写完。
//
// 速度：只有台词逐字出现走 cover.speed（dc），其余和进主页一样走 motion.speed（d）。
// 播放顺序：每个会话洗一次牌（见下），往左回到上一张。

import { Ink, InkGroup, type Plan, smooth } from '../ink';
import { DIALOG_ORNAMENT, dialogCorner, ornament, P, place, placeCorner } from './frame';
import { $, $$, boot, d, dc, EASE_IN, halt, hooks, reduce, root, run, S, wait } from './core';

const avatarBtn = $<HTMLButtonElement>('#avatar-btn');
export const cover = $('#cover');
export const dialog = $('#dialog');
const frameSvg = $<SVGSVGElement>('#frame');
const line = $('#line');
const source = $('#source');
const nextBtn = $<HTMLButtonElement>('#next');
const nextSvg = $<SVGSVGElement>('#next-svg');
const edge = $('#edge');
const edgeShadow = $('.edge-shadow', edge);
const edgeSvg = $<SVGSVGElement>('#edge-arrow');
const bgs = [$('.bg-a'), $('.bg-b')];
const veil = $('.veil');

export const hasCover = boot.slides.length > 0;
const N = boot.slides.length;

type Phase = 'idle' | 'front' | 'fade' | 'text';
let phase: Phase = 'idle';
/** 流水线令牌：每开一条新流水线（或进主页）就换一个，旧的那条在下一个检查点自己退出 */
let gen = 0;

// ---------------------------------------------------------------- 播放顺序

// 洗牌：每个会话（浏览器标签页）开始时洗一次，得到这个会话自己的顺序，存进 sessionStorage；
// 之后往右按这个顺序走、到头绕回开头，往左倒着走。不同的会话各洗各的，所以顺序各不相同。
const DECK = 'cover:deck';
let deck: number[] = [];
let pos = 0;

function shuffled() {
	const a = [...Array(N).keys()];
	for (let i = N - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** 起始一张：本会话的牌接着用（回到上次停的那张），没有就洗一副新的、从第一张开始 */
export function initSlide(saved: number | null) {
	try {
		const d = JSON.parse(sessionStorage.getItem(DECK) ?? 'null');
		if (Array.isArray(d) && d.length === N && [...d].sort((x, y) => x - y).every((x, i) => x === i)) deck = d;
	} catch {
		/* 存储不可用 */
	}
	if (deck.length !== N) {
		deck = shuffled();
		try {
			sessionStorage.setItem(DECK, JSON.stringify(deck));
		} catch {
			/* 隐私模式 */
		}
	}
	pos = saved !== null && deck.includes(saved) ? deck.indexOf(saved) : 0;
	S.slideI = deck[pos] ?? 0;
}

function step(dir: 1 | -1) {
	if (N < 2) return 0;
	pos = (pos + dir + N) % N;
	return deck[pos];
}

// ---------------------------------------------------------------- 头像位置

/** 「从头像处淡出」的径向遮罩以头像为圆心 */
export function placeIdent() {
	const r = avatarBtn.getBoundingClientRect();
	root.style.setProperty('--ident-y', `${Math.round(r.top + r.height / 2)}px`);
}

// ---------------------------------------------------------------- 对话框笔画

// 笔画按对话框的实际像素尺寸生成（不能用 viewBox 拉伸，否则会把笔画压扁）。
// 包裹率低：对话框只有左上、右上两个角，加底边中央一个吊坠（.next），边不贯通，框靠联想补完；
// 但每处落笔都是几根缠绕的笔拧成的一束（frame.ts 的 braid），厚而不单薄。
const frameG = new InkGroup();
const nextG = new InkGroup();

export function buildFrame() {
	const w = dialog.clientWidth;
	const h = dialog.clientHeight;
	frameSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
	frameSvg.replaceChildren();
	const m = 14;
	const a = Math.min(300, w * 0.3);
	const b = Math.max(40, h * 0.62);
	const plans: Plan[] = [];
	for (const sx of [1, -1] as const) {
		const cx = sx === 1 ? m : w - m;
		plans.push(...placeCorner(frameSvg, dialogCorner(a, b), cx, m, sx, 1));
	}
	frameG.set(plans);
}

export function buildNext() {
	nextSvg.replaceChildren();
	// 吊坠，原点在底边中点（.next 的定位让 svg 的 (150, 6) 压在对话框底边上）
	nextG.set(place(nextSvg, ornament(DIALOG_ORNAMENT), (q) => P(150 + q.x, 6 + q.y)));
}

/** 尺寸变了：按当前状态重画 */
export function redrawCover() {
	placeIdent();
	buildFrame();
}

// ---------------------------------------------------------------- 台词与出处

function fill(el: HTMLElement, text: string) {
	el.replaceChildren(
		...Array.from(text, (ch) => {
			const s = document.createElement('span');
			s.className = 'ch';
			s.textContent = ch;
			return s;
		}),
	);
	el.hidden = text === '';
}

/** 当前语言下这张幻灯片的台词与出处（双语回退已在构建期做完） */
const textOf = (i: number) => ({ body: boot.slides[i]?.body[S.lang] ?? '', src: boot.slides[i]?.source[S.lang] ?? '' });

/** 台词、出处、倒三角一起从当前的样子下滑淡出 */
function textOut(ms: number) {
	halt(line, source, nextBtn);
	nextG.to(0, ms * 1.4, reduce);
	const from = (el: HTMLElement) => Number(getComputedStyle(el).opacity);
	const down = (el: HTMLElement, x = '') =>
		run(el, [{ opacity: from(el), transform: `${x} translateY(0)` }, { opacity: 0, transform: `${x} translateY(14px)` }], ms, { easing: EASE_IN });
	return Promise.all([down(line), down(source), down(nextBtn, 'translateX(-50%)')]);
}

/** 逐字快速淡入：先台词，台词全部出现后用同样的节奏出出处 */
async function textIn(i: number, alive: () => boolean) {
	const { body, src } = textOf(i);
	fill(line, body);
	fill(source, src);
	for (const el of [line, source]) {
		el.style.opacity = '1';
		el.style.transform = 'none';
	}
	const step_ = dc(26);
	const fade = dc(200);
	for (const el of [line, source]) {
		const chs = $$('.ch', el);
		chs.forEach((c, k) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade, delay: k * step_, fill: 'both', easing: 'ease-out' }));
		if (chs.length) await wait(chs.length * step_ + fade);
		if (!alive()) return;
	}
}

/** 不放动画，直接把这张的文字摆出来（切语言时用） */
function textNow(i: number) {
	const { body, src } = textOf(i);
	fill(line, body);
	fill(source, src);
	for (const c of $$('.ch', dialog)) c.style.opacity = '1';
}

function nextIn() {
	return Promise.all([
		run(nextBtn, [{ opacity: 0, transform: 'translate(-50%, -6px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], d(360)),
		nextG.to(1, d(480), reduce),
	]);
}

// ---------------------------------------------------------------- 背景

let front = 0;
/** 正在进行的交叉淡化（进主页时要接管它） */
let fading: Promise<void> | null = null;

export function preload(i: number): Promise<void> {
	const src = boot.slides[i]?.src;
	if (!src) return Promise.resolve();
	const img = new Image();
	img.src = src;
	return img.decode().catch(() => {});
}

function layer(el: HTMLElement, i: number, z: number) {
	for (const a of el.getAnimations()) a.cancel();
	el.classList.remove('m-out');
	el.style.backgroundImage = `url("${boot.slides[i].src}")`;
	el.style.opacity = '1';
	el.style.zIndex = String(z);
}

export function showBgInstant(i: number) {
	layer(bgs[front], i, 2);
	bgs[front ^ 1].style.opacity = '0';
}

/** 第一次进来：从全黑开始，从头像处显现出第一张 */
async function bgFirst(i: number) {
	await preload(i);
	const el = bgs[front];
	layer(el, i, 2);
	el.classList.add('m-in');
	await run(el, [{ '--r': '-18%', opacity: 0 }, { opacity: 1, offset: 0.35 }, { '--r': '100%', opacity: 1 }], d(820), { easing: 'ease-out' });
	el.classList.remove('m-in');
}

/** 交叉淡化：下一张先铺在下面，当前这张从头像处开始向外淡出，露出下一张 */
async function crossfade(i: number) {
	await preload(i);
	const top = bgs[front];
	const under = bgs[front ^ 1];
	layer(under, i, 1);
	top.style.zIndex = '2';
	top.classList.add('m-out');
	fading = run(top, [{ '--r': '-18%' }, { '--r': '100%' }], d(1100), { easing: 'cubic-bezier(.4,0,.3,1)' });
	await fading;
	fading = null;
	top.classList.remove('m-out');
	top.style.opacity = '0';
	top.style.zIndex = '0';
	under.style.zIndex = '2';
	front ^= 1;
}

/** 封面进主页：黑色从头像处铺开，只铺到「较暗」 */
async function veilDim() {
	const v = 1 - boot.dim;
	veil.classList.add('m-in');
	await run(veil, [{ '--r': '-18%', opacity: 0 }, { opacity: v, offset: 0.35 }, { '--r': '100%', opacity: v }], d(760), { easing: 'ease-out' });
	veil.classList.remove('m-in');
	veil.style.opacity = String(v);
}

/** 主页回封面：从头像处把暗色揭开 */
async function veilLift() {
	const v = Number(veil.style.opacity) || 1 - boot.dim;
	veil.classList.add('m-out');
	await run(veil, [{ '--r': '-18%', opacity: v }, { opacity: v, offset: 0.55 }, { '--r': '100%', opacity: 0 }], d(820), { easing: 'ease-out' });
	veil.classList.remove('m-out');
	veil.style.opacity = '0';
}

export function veilInstant() {
	veil.style.opacity = String(1 - boot.dim);
}

// ---------------------------------------------------------------- 幻灯片流水线

let timer = 0;
export function schedule() {
	clearTimeout(timer);
	if (S.stage === 'cover' && phase === 'idle' && N > 1 && !document.hidden) {
		timer = window.setTimeout(() => nextSlide(1), boot.interval);
	}
}
export const unschedule = () => clearTimeout(timer);
document.addEventListener('visibilitychange', () => (document.hidden ? unschedule() : schedule()));

/** 背景换完以后就能再切 */
export const canSlide = () => S.stage === 'cover' && N > 1 && (phase === 'idle' || phase === 'text');

/** 后半：对话框长出 → 台词 → 出处 → 倒三角 */
async function showText(i: number, my: number) {
	const alive = () => gen === my;
	phase = 'text';
	refreshEdge();
	// 先把这张的字（透明地）放进去撑开对话框，再按撑开后的尺寸生成笔画，底边和倒三角才对得齐
	const { body, src } = textOf(i);
	fill(line, body);
	fill(source, src);
	buildFrame();
	await frameG.to(1, d(900), reduce);
	if (!alive()) return;
	await textIn(i, alive);
	if (!alive()) return;
	await nextIn();
	if (!alive()) return;
	phase = 'idle';
	schedule();
}

export async function nextSlide(dir: 1 | -1) {
	if (!canSlide()) return;
	unschedule();
	const my = ++gen;
	const alive = () => gen === my;
	const n = step(dir);
	S.slideI = n;
	hooks.save();
	preload(n);
	phase = 'front';
	refreshEdge(); // 切换中暗影和箭头先收起来
	await textOut(d(300));
	if (!alive()) return;
	await frameG.to(0, d(560), reduce);
	if (!alive()) return;
	phase = 'fade';
	await crossfade(n);
	if (!alive()) return;
	await showText(n, my);
}

/** 第一次从站外进来：全黑、只有头像和名字，然后从头像处显现第一张 */
export async function firstCover(ident: HTMLElement) {
	const my = ++gen;
	await run(ident, [{ opacity: 0 }, { opacity: 1 }], d(600));
	phase = 'fade';
	await bgFirst(S.slideI);
	if (gen !== my) return;
	await showText(S.slideI, my);
}

// ---------------------------------------------------------------- 封面 ⇄ 主页

/**
 * 封面收起，背景压暗。不管流水线走到哪一步都可以调：先接管（旧流水线退出），
 * 文字和对话框从当前样子收回；交叉淡化若还在进行，就让它和压暗同时走完。
 */
export async function coverOut() {
	unschedule();
	++gen;
	phase = 'idle';
	refreshEdge();
	await textOut(d(260));
	await frameG.to(0, d(480), reduce);
	await Promise.all([veilDim(), fading ?? Promise.resolve()]);
}

export async function coverIn() {
	const my = ++gen;
	phase = 'fade';
	await veilLift();
	if (gen !== my) return;
	await showText(S.slideI, my);
}

/** 不放动画，直接成主页背景的样子 */
export function coverHidden() {
	++gen;
	phase = 'idle';
	showBgInstant(S.slideI);
	veilInstant();
	frameG.draw(0);
	nextG.draw(0);
	nextBtn.style.opacity = '0';
	line.style.opacity = '0';
	source.style.opacity = '0';
}

/** 切语言：封面上正在显示的台词换成另一种语言 */
export function relangCover() {
	if (S.stage === 'cover' && phase === 'idle') textNow(S.slideI);
}

// ---------------------------------------------------------------- 左右边缘

// 鼠标进入左右边缘区：以鼠标为中心晕开一团暗影，暗影中心「写」出一个朝外的小箭头。
//
// 暗影的浓淡由一个 presence（0..1）决定，每帧更新：
//   在边缘区里（并且此刻能切）：presence 平滑地升到 1（就是晕开）
//   离开边缘区：presence 随时间衰减，离得越远衰减越快；同时不超过 1 − 距离/区宽，
//              所以离开整整一个区宽时一定已经消失
//   切换幻灯片途中：当作离开，下一张出来以后鼠标还在区里就重新晕开
const EDGE = 0.07;
let mx = -1;
let my_ = -1;
let presence = 0;
let armed: -1 | 0 | 1 = 0; // 箭头当前朝哪边写着
let loop = 0;
let lastT = 0;
const edgeG = new InkGroup();

function arrowInk(side: -1 | 1): Plan[] {
	edgeSvg.replaceChildren();
	// 所有笔画都从尖端起笔：一对倒钩向后掠，一道杆向后拖，在尖端汇成锐角
	const pts = (a: [number, number][]) => smooth(a.map(([x, y]) => P(side === 1 ? x : 56 - x, y)));
	const tip: [number, number] = [44, 28];
	const plans: Plan[] = [{ ink: new Ink(edgeSvg, { segs: pts([tip, [34, 28.6], [22, 27.4], [10, 28]]), width: 1.25 }, 'ink-arrow'), from: 0, to: 0.8 }];
	for (const sy of [1, -1]) {
		const Y = (y: number) => 28 + sy * (y - 28);
		plans.push(
			{ ink: new Ink(edgeSvg, { segs: pts([tip, [37, Y(23.5)], [31, Y(17)], [29, Y(10)]]), width: 1.4, grow: 7 }, 'ink-arrow'), from: 0, to: 1 },
			{ ink: new Ink(edgeSvg, { segs: pts([tip, [35, Y(26)], [27, Y(23)], [22, Y(18)]]), width: 0.9, grow: 5 }, 'ink-arrow'), from: 0.15, to: 1 },
		);
	}
	return plans;
}

/** 鼠标在哪一侧的边缘区里（0 = 不在），以及离最近的边缘区有多远（区宽为 1） */
function zone(): { side: -1 | 0 | 1; far: number } {
	if (mx < 0) return { side: 0, far: 9 };
	const Z = innerWidth * EDGE;
	if (mx < Z) return { side: -1, far: 0 };
	if (mx > innerWidth - Z) return { side: 1, far: 0 };
	return { side: 0, far: Math.min(mx - Z, innerWidth - Z - mx) / Z };
}

function tick(now: number) {
	const dt = Math.min(50, now - lastT);
	lastT = now;
	const { side, far } = zone();
	const on = side !== 0 && canSlide();
	if (on) {
		presence += (1 - presence) * (1 - Math.exp(-dt / d(110)));
		if (presence > 0.999) presence = 1;
	} else {
		// 基础衰减 ~260ms 走完，离得越远越快；距离再给一个硬上限
		const rate = (1 + 5 * far) / Math.max(1, d(260));
		presence = Math.max(0, Math.min(presence - rate * dt, 1 - far));
	}
	if (reduce) presence = on ? 1 : 0;
	// 箭头：进区（且能切）就写，离区或切换中就收
	const want = on ? side : 0;
	if (want !== armed) {
		if (want) {
			edgeG.stop();
			edgeG.g = 0;
			edgeG.set(arrowInk(want));
			edgeG.to(1, d(380), reduce);
		} else edgeG.stop();
		armed = want;
	}
	// 离开时箭头跟着暗影一起退：书写进度不超过暗影的浓度，暗影没了箭头也一定没了
	if (!want) edgeG.draw(Math.min(edgeG.g, presence));
	edgeShadow.style.opacity = String(presence);
	edgeShadow.style.scale = String(0.35 + 0.65 * presence);
	cover.classList.toggle('edge-on', on);
	// 全部消停了就停下循环
	if (!on && presence === 0 && edgeG.g === 0) {
		loop = 0;
		return;
	}
	loop = requestAnimationFrame(tick);
}

/** 状态变了（开始切换、换完、进主页）：让循环重新看一眼 */
export function refreshEdge() {
	if (loop || N < 2) return;
	lastT = performance.now();
	loop = requestAnimationFrame(tick);
}

/** 进主页时立刻收掉 */
export function hideEdge() {
	mx = -1;
	refreshEdge();
}

export const onEdge = () => (zone().side !== 0 && canSlide() ? zone().side : 0);

addEventListener('mousemove', (e) => {
	if (N < 2) return;
	mx = e.clientX;
	my_ = e.clientY;
	edge.style.setProperty('--ex', `${mx}px`);
	edge.style.setProperty('--ey', `${my_}px`);
	if (S.stage === 'cover') refreshEdge();
});
// 边缘区贴着窗口边，鼠标很容易直接移出窗口，这时不会再有 mousemove
addEventListener('mouseout', (e) => !e.relatedTarget && hideEdge());
addEventListener('blur', hideEdge);
cover.addEventListener('click', () => {
	const s = onEdge();
	if (s) nextSlide(s);
});
