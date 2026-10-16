// 全站框体的笔画语汇（定稿）。几何直接取自选定的效果图：
//   对话框  第三批「合」的角（两根笔，横竖各一个压低张宽的尖拱）+ 第六批「窄扁 + 高角」的底饰
//   文章    当前：第七批「长臂」的角；非当前：「同笔缩小」——同一种角，只留两根主笔和一道拱
//   章节    当前：同笔缩小的角；标示线上的标记是对话框底饰转 90°（尖朝左，底边压在线上）
//
// 坐标约定（局部）：
//   corner   原点 = 角点，+x 沿横边、+y 向框里；竖边的笔画在局部里也写成「沿 +x」，由 place 时交换
//   ornament 原点 = 底边中点，x 沿底边、+y 向尖（朝框外）
// 用 placeCorner / place 把局部坐标映射到实际位置（镜像、旋转都在映射里做）。

import { Ink, type Plan, type Pt, smooth } from '../ink';

export const P = (x: number, y: number): Pt => ({ x, y });

export type Strand = {
	pts: Pt[];
	/** 最大半宽（px） */
	w: number;
	from: number;
	to: number;
	grow?: number;
	lead?: number;
	origin?: number;
	/** 这一笔属于竖边（局部 x 沿竖边）：placeCorner 会交换它的 x、y */
	side?: boolean;
};

export function place(svg: SVGSVGElement | SVGGElement, strands: Strand[], map: (q: Pt) => Pt, cls = 'ink', wk = 1): Plan[] {
	return strands.map((s) => ({
		ink: new Ink(
			svg as SVGSVGElement,
			{
				segs: smooth(s.pts.map(map)),
				width: s.w * wk,
				grow: s.grow === undefined ? undefined : s.grow * wk,
				lead: s.lead === undefined ? undefined : s.lead * wk,
				origin: s.origin,
			},
			cls,
		),
		from: s.from,
		to: s.to,
	}));
}

/** 竖边的笔画在局部坐标里沿 +x 写，这里换成沿 +y */
export const unfold = (ss: Strand[]): Strand[] => ss.map((s) => (s.side ? { ...s, side: false, pts: s.pts.map((q) => P(q.y, q.x)) } : s));

// ---------------------------------------------------------------- 角

export type CornerSpec = {
	/** 横边长 */
	top: number;
	/** 竖边长 */
	side: number;
	/** 角尖向外伸出的长度 */
	tip: number;
	/** 缠绕起伏的幅度 */
	amp: number;
	/** 整体粗细 */
	w?: number;
	/** 主笔半宽 */
	main?: number;
	/** 第二根缠绕笔的半宽；0 = 不画（同笔缩小） */
	sub?: number;
	/** 尖拱：0 无，1 一道弧，2 两道弧 */
	arch?: 0 | 1 | 2;
	/** 竖边也起尖拱 */
	archSide?: boolean;
	/** 尖拱的高、宽（以 tip 为单位） */
	archH?: number;
	archW?: number;
};

/**
 * 一个角：从角外的刺尖起笔，横、竖各一根主笔沿边拉出去（带轻微起伏），
 * 可选一根缠绕的副笔，角上横竖各起一个压低张宽的哥特尖拱。
 */
export function corner(c: CornerSpec): Strand[] {
	// 点列逐字取自效果图（frames 第三 / 七 / 九批的 corner / cornerLite），竖边的笔在局部坐标里写好后由 unfold 交换 x、y
	const T = c.tip;
	const A = c.amp;
	const top = c.top;
	const side = c.side;
	const w = c.w ?? 1;
	const main = (c.main ?? 2.4) * w;
	const sub = (c.sub ?? 1.15) * w;
	const tip = P(-T, -T * 0.92);
	const tipS = P(tip.y, tip.x);
	const out: Strand[] = [
		{ w: main, from: 0, to: 1, lead: T * 1.2, grow: top * 0.22, pts: [tip, P(0, 0), P(top * 0.18, A * 0.5), P(top * 0.42, -A * 0.15), P(top * 0.7, A * 0.1), P(top, 0)] },
		{ side: true, w: main, from: 0, to: 1, lead: T * 1.2, grow: side * 0.25, pts: [tipS, P(0, 0), P(side * 0.2, -A * 0.5), P(side * 0.45, A * 0.7), P(side * 0.7, -A * 0.5), P(side, A * 0.2)] },
	];
	if (sub > 0) {
		out.push(
			{ w: sub, from: 0, to: 0.7, lead: T, grow: 30, pts: [tip, P(T * 0.2, -A * 0.6), P(top * 0.2, -A * 0.9), P(top * 0.38, A * 0.6), P(top * 0.58, A * 0.25)] },
			{ side: true, w: sub, from: 0, to: 0.7, lead: T, grow: 28, pts: [tipS, P(T * 0.3, A * 0.6), P(side * 0.25, A * 0.9), P(side * 0.5, -A * 0.6), P(side * 0.78, A * 0.7), P(side * 0.96, A * 1.1)] },
		);
	}
	if (c.arch) {
		const H = c.archH ?? 1.6;
		const Wd = c.archW ?? 3.4;
		const ap = P(-T * 0.45, -T * H);
		out.push({ w: 1.6 * w, from: 0, to: 0.4, grow: 14, lead: 4, pts: [P(T * 0.5, A * 0.2), P(-T * 0.2, -T * H * 0.32), P(-T * 0.5, -T * H * 0.72), ap] });
		if (c.arch === 2) out.push({ w: 1.2 * w, from: 0.05, to: 0.45, grow: 12, lead: 4, pts: [P(T * Wd, -A * 0.1), P(T * Wd * 0.3, -T * H * 0.36), P(-T * 0.2, -T * H * 0.72), ap] });
		if (c.archSide) {
			const aq = P(-T * 0.45, T * H);
			out.push({ side: true, w: 1.6 * w, from: 0, to: 0.4, grow: 14, lead: 4, pts: [P(T * 0.5, -A * 0.2), P(-T * 0.2, T * H * 0.32), P(-T * 0.5, T * H * 0.72), aq] });
			if (c.arch === 2) out.push({ side: true, w: 1.2 * w, from: 0.05, to: 0.45, grow: 12, lead: 4, pts: [P(T * Wd, A * 0.1), P(T * Wd * 0.3, T * H * 0.36), P(-T * 0.2, T * H * 0.72), aq] });
		}
	}
	return out;
}

/**
 * 把一个角放到 (x, y)，dx / dy = ±1 表示横边、竖边伸展的方向
 * （右上角：dx = -1, dy = 1；右下角：dx = -1, dy = -1）。
 */
export function placeCorner(svg: SVGSVGElement | SVGGElement, c: CornerSpec, x: number, y: number, dx: 1 | -1, dy: 1 | -1, cls = 'ink'): Plan[] {
	return place(svg, unfold(corner(c)), (q) => P(x + dx * q.x, y + dy * q.y), cls);
}

// ---------------------------------------------------------------- 底饰（对话框底边、标示线上的标记）

export type OrnamentSpec = {
	/** 半宽 */
	H: number;
	/** 深度（尖离底边多远） */
	D: number;
	w?: number;
	/** 角笔起笔翘在底边上方多高（以 D 为单位） */
	lift?: number;
	/** 托笔：从更远处兜进来，和角笔一起汇进尖 */
	lower?: boolean;
	/** 托笔和角笔额外交叉的幅度 */
	tangle?: number;
	/** 贴着角笔内侧的第三笔 */
	third?: boolean;
	/** 中间的倒 V（眼） */
	eye?: boolean;
	/** 底边的横线，半长；0 = 不画 */
	rule?: number;
};

/**
 * 参考图的底饰：两侧各一根角笔从底边上方翘起、穿过底边弯向中央收成长尖；
 * 托笔从更外侧兜进来汇进同一个尖；可选第三笔、中间的倒 V、底边横线。左右对称。
 */
export function ornament(o: OrnamentSpec): Strand[] {
	const { H, D } = o;
	const w = o.w ?? 1.15;
	const lift = o.lift ?? 0.4;
	const tg = o.tangle ?? 0;
	const out: Strand[] = [];
	const S = (sx: number, pts: [number, number][], W: number, grow: number, from = 0, to = 1): Strand => ({
		w: W * w,
		from,
		to,
		grow,
		lead: 3,
		pts: pts.map(([u, v]) => P(sx * u * H, v * D)),
	});
	for (const sx of [1, -1]) {
		out.push(S(sx, [[1.0, -lift], [0.78, -lift * 0.2], [0.5, 0.24], [0.22, 0.6], [0.06, 0.88], [0, 1]], 2.2, H * 0.35));
		if (o.lower !== false) out.push(S(sx, [[1.35, 0.02], [0.89, 0.1 + tg], [0.5, 0.36 - tg], [0.2, 0.7 + tg * 0.5], [0.05, 0.92], [0, 0.98]], 1.6, H * 0.3, 0.08, 1));
		if (o.third) out.push(S(sx, [[0.82, -lift * 0.6], [0.6, 0.12], [0.36, 0.38], [0.16, 0.64]], 1.0, H * 0.2, 0.15, 0.9));
		if (o.eye !== false) out.push(S(sx, [[0.4, 0.02], [0.24, 0.16], [0.1, 0.3], [0, 0.4]], 1.2, H * 0.14, 0.3, 1));
	}
	if (o.rule) {
		const L = o.rule;
		out.push({ w: 1.2 * w, from: 0, to: 0.8, origin: 0.5, grow: L * 0.25, pts: [P(-L, 0), P(-L * 0.5, 0), P(0, 0), P(L * 0.5, 0), P(L, 0)] });
	}
	return out;
}

/** 对话框底饰：「窄扁 + 高角」，带缠绕（托笔多交叉一次 + 第三笔）和短横线 */
export const DIALOG_ORNAMENT: OrnamentSpec = { H: 90, D: 32, rule: 200, w: 1.15, tangle: 0.12, third: true, lift: 0.4 };

/**
 * 挂在竖线上的标记：底饰转 90°，尖朝左，底边压在竖线上（原点 = 竖线上那一点）。
 * level：'big' 当前文章，'cat' 当前章节，'small' 非当前文章，'tiny' 非当前章节
 */
export function marker(level: 'big' | 'cat' | 'small' | 'tiny'): Strand[] {
	const spec: Record<typeof level, OrnamentSpec> = {
		big: { H: 22, D: 30, w: 1.0, tangle: 0.12, third: true, lift: 0.4 },
		cat: { H: 18, D: 24, w: 0.95, tangle: 0.12, third: false, eye: false, lift: 0.4 },
		small: { H: 9, D: 12, w: 0.8, lower: false, eye: false, lift: 0.3 },
		tiny: { H: 7, D: 9, w: 0.75, lower: false, eye: false, lift: 0.3 },
	};
	// 底饰局部坐标 (x 沿底边, y 朝尖) → 竖线上：底边竖着压在线上，尖朝 -x
	return ornament(spec[level]).map((s) => ({ ...s, pts: s.pts.map((q) => P(-q.y, q.x)) }));
}

// ---------------------------------------------------------------- 各处用的角

/** 对话框的角：第三批「合」 */
export const dialogCorner = (top: number, side: number): CornerSpec => ({ top, side, tip: 22, amp: 6, w: 1.25, main: 2.4, sub: 1.15, arch: 2, archSide: true, archH: 1.6, archW: 3.4 });
/** 当前文章的角：「长臂」 */
export const activeCardCorner = (top: number, side: number): CornerSpec => ({ top, side, tip: 12, amp: 3.5, w: 0.95, main: 2.2, sub: 1.0, arch: 2, archSide: true, archH: 1.6, archW: 3.0 });
/** 非当前文章：同笔缩小（两根主笔 + 一道拱，没有副笔） */
export const cardCorner = (top: number, side: number): CornerSpec => ({ top, side, tip: 9, amp: 3, w: 0.8, main: 2.1, sub: 0, arch: 1, archSide: true, archH: 1.6, archW: 2.8 });
/** 当前章节：同笔缩小的小号 */
export const catCorner = (top: number, side: number): CornerSpec => ({ top, side, tip: 8, amp: 2.2, w: 0.75, main: 2.1, sub: 0, arch: 1, archSide: true, archH: 1.6, archW: 2.8 });
