// 主页各模块共用的东西：启动数据、工具函数、全局状态。
//
// 舞台（root[data-stage]）：
//   cover  封面：幻灯片 + 对话框（切换幻灯片途中也是 cover，随时可以进主页）
//   home   主页：章节行 + 文章列
//   busy   封面⇄主页过渡中，忽略输入
//
// 时长：主页动画用 d()，除以 motion.speed；封面幻灯片用 dc()，再除以 cover.speed。
// 系统开了「减少动态效果」则一律为 0。run() 收的是已经换算好的毫秒数。

import type { Lang } from '../i18n';

export type { Lang };
export type Loc = Record<Lang, string>;
export type SearchItem = { slug: string; title: string; desc: string; cat: string };
export type Boot = {
	slides: { src: string; body: Loc; source: Loc }[];
	interval: number;
	coverSpeed: number;
	dim: number;
	speed: number;
	lang: Lang;
	startCat: number;
	search: SearchItem[];
	ui: { noResult: Loc };
	/** 邮箱拆成两半，运行时才拼（About 页的联系方式） */
	email: { user: string; domain: string } | null;
	/** 文章页：预先打开的文章 slug（主页为 null） */
	open: string | null;
};

export const boot: Boot = JSON.parse(document.getElementById('boot')!.textContent!);
export const root = document.documentElement;
export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const d = (ms: number) => (reduce ? 0 : ms / boot.speed);
export const dc = (ms: number) => (reduce ? 0 : ms / (boot.speed * boot.coverSpeed));
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const $ = <T extends Element = HTMLElement>(sel: string, p: ParentNode = document) => p.querySelector<T>(sel)!;
export const $$ = <T extends Element = HTMLElement>(sel: string, p: ParentNode = document) => [...p.querySelectorAll<T>(sel)];
/** 设计稿 1px 在当前屏幕上是多少像素（--u，见 tokens.css）。笔画粗细、花纹尺度都乘它 */
export const U = () => parseFloat(getComputedStyle(root).getPropertyValue('--u')) || 1;
export const cssPx = (name: string, fallback: number, el: Element = root) =>
	parseFloat(getComputedStyle(el).getPropertyValue(name)) || fallback;
export const cssNum = (name: string, fallback: number, el: Element = root) =>
	Number(getComputedStyle(el).getPropertyValue(name)) || fallback;

export const EASE = 'cubic-bezier(.2,.8,.2,1)';
export const EASE_IN = 'cubic-bezier(.55,0,.8,.2)';

/**
 * 播放一段动画（ms 已换算），结束后把终态写回内联样式再撤掉动画，避免 fill 叠加。
 * 被 cancel 时 Promise 照样 resolve，但不写终态。
 */
export function run(el: Element, kf: Keyframe[], ms: number, o: { delay?: number; easing?: string } = {}): Promise<void> {
	const a = (el as HTMLElement).animate(kf, {
		duration: ms,
		delay: o.delay ?? 0,
		easing: o.easing ?? EASE,
		fill: 'both',
	});
	// 不用 commitStyles()：它在 fill + delay 组合下（Chrome）可能不生效
	const last = kf[kf.length - 1];
	return a.finished.then(
		() => {
			const st = (el as HTMLElement).style as unknown as Record<string, string>;
			for (const [k, v] of Object.entries(last)) {
				if (k === 'offset' || k === 'easing' || k === 'composite') continue;
				if (k.startsWith('--')) (el as HTMLElement).style.setProperty(k, String(v));
				else st[k] = String(v);
			}
			a.cancel();
		},
		() => {},
	);
}

/** 停在当前帧：把此刻的 transform / opacity 写进内联样式，撤掉身上所有动画 */
export function halt(...els: Element[]) {
	for (const el of els as HTMLElement[]) {
		const as = el.getAnimations();
		if (!as.length) continue;
		const cs = getComputedStyle(el);
		const tr = cs.transform;
		const op = cs.opacity;
		for (const a of as) a.cancel();
		el.style.transform = tr === 'none' ? '' : tr;
		el.style.opacity = op;
	}
}

export type Stage = 'cover' | 'home' | 'busy';

/** 全局状态。各模块读写同一份 */
export const S = {
	stage: 'busy' as Stage,
	lang: boot.lang,
	/** 当前（目标）章节；下标和 .cat / .list 的 DOM 顺序一致，0 是「搜索」 */
	catI: boot.startCat + 1,
	/** 正在显示文章的那一列 */
	shownI: boot.startCat + 1,
	slideI: 0,
	selBy: {} as Record<string, number>,
};

export function setStage(s: Stage) {
	S.stage = s;
	root.dataset.stage = s;
}

/** 跨模块回调，避免循环依赖：由 home.ts 填进去 */
export const hooks = {
	save: () => {},
};
