// 毛笔 / 钢笔质感的笔画。
//
// 一笔 = 一条光滑曲线（三次贝塞尔串）。渲染时不是用 SVG stroke（等宽），
// 而是沿曲线采样，算出每个采样点的半宽，再把左右两条边拼成一个填充多边形。
//
// 书写过程中「笔尖」在曲线上移动：笔尖处半宽为 0（尖的），越往后越粗，
// 而且是非线性的——先快速变粗，再慢慢趋于饱和：
//
//     w(d) = W · (1 − e^(−d / L)) · taper(s)
//
//   d      离笔尖的弧长距离
//   W      这一笔的最大半宽
//   L      「变粗」的特征长度：d = L 时到 63%，d = 3L 时到 95%
//   taper  起笔处也收尖（s = 离起点的弧长），否则起点会是个钝头
//
// 写完以后笔尖停在终点，终点依旧是尖的——这就是钢笔/毛笔收笔出锋的样子。
// 收回（倒放）时笔尖沿原路退回起点。

export type Pt = { x: number; y: number };
/** 一段三次贝塞尔：起点、两个控制点、终点 */
export type Seg = [Pt, Pt, Pt, Pt];

export interface StrokeSpec {
	segs: Seg[];
	/** 最大半宽（px） */
	width: number;
	/** 变粗的特征长度（px），默认为全长的 0.28（双向时 0.18） */
	grow?: number;
	/** 起笔收尖的长度（px），默认 width × 3。只对单向笔画有效 */
	lead?: number;
	/**
	 * 双向书写：从曲线上这个位置（0..1，按弧长）起笔，同时向两头写。
	 * 两头都是笔尖，越靠近起笔处越粗——看起来是「一条线向两边扩展」，而不是两笔对接。
	 */
	origin?: number;
}

const bez = (p: Seg, t: number): Pt => {
	const u = 1 - t;
	const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
	return {
		x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
		y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y,
	};
};

/** 沿曲线等弧长采样，返回点和累计弧长 */
function sample(segs: Seg[], step = 2): { pts: Pt[]; len: number[] } {
	// 先密采，再按弧长重采，保证曲率大的地方不会稀
	const dense: Pt[] = [];
	for (const s of segs) {
		for (let i = dense.length ? 1 : 0; i <= 64; i++) dense.push(bez(s, i / 64));
	}
	const acc = [0];
	for (let i = 1; i < dense.length; i++) {
		acc.push(acc[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
	}
	const total = acc[acc.length - 1];
	const n = Math.max(2, Math.ceil(total / step));
	const pts: Pt[] = [];
	const len: number[] = [];
	let j = 0;
	for (let k = 0; k <= n; k++) {
		const s = (total * k) / n;
		while (j < acc.length - 2 && acc[j + 1] < s) j++;
		const f = acc[j + 1] === acc[j] ? 0 : (s - acc[j]) / (acc[j + 1] - acc[j]);
		pts.push({ x: dense[j].x + (dense[j + 1].x - dense[j].x) * f, y: dense[j].y + (dense[j + 1].y - dense[j].y) * f });
		len.push(s);
	}
	return { pts, len };
}

export class Ink {
	readonly el: SVGPathElement;
	private pts: Pt[];
	private total: number;
	private W: number;
	private L: number;
	private lead: number;
	private origin: number | null;
	/** 0 = 没写，1 = 写完 */
	progress = 0;

	constructor(svg: SVGSVGElement, spec: StrokeSpec, cls = 'ink') {
		const { pts, len } = sample(spec.segs);
		this.pts = pts;
		this.total = len[len.length - 1];
		// 尺寸为 0 的元素（比如还没显示的「搜索」卡片）会给出长度为 0 的笔画，origin 可能是 NaN
		this.origin = spec.origin !== undefined && Number.isFinite(spec.origin) ? spec.origin : null;
		this.W = spec.width;
		this.L = spec.grow ?? this.total * (this.origin === null ? 0.28 : 0.18);
		this.lead = spec.lead ?? spec.width * 3;
		this.el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		this.el.setAttribute('class', cls);
		svg.appendChild(this.el);
		this.draw(0);
	}

	/** 这一笔的总弧长（px） */
	get length() {
		return this.total;
	}

	/** 弧长 s 处的点（采样是等弧长的，直接按比例插值） */
	private at(s: number): Pt {
		const n = this.pts.length - 1;
		const f = Math.min(n, Math.max(0, (s / this.total) * n));
		const k = Math.min(n - 1, Math.floor(f));
		const u = f - k;
		const A = this.pts[k];
		const B = this.pts[k + 1];
		return { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u };
	}

	/** 画到进度 p（0..1） */
	draw(p: number) {
		this.progress = p;
		if (!(this.total > 0.5) || this.pts.length < 2) {
			this.el.setAttribute('d', '');
			return;
		}
		// 已写出的弧长区间 [a, b]：单向时 a 固定在起点；双向时从 origin 向两头扩
		let a: number;
		let b: number;
		if (this.origin === null) {
			a = 0;
			b = p * this.total;
		} else {
			const o = this.origin * this.total;
			a = o * (1 - p);
			b = o + (this.total - o) * p;
		}
		if (b - a < 0.5) {
			this.el.setAttribute('d', '');
			return;
		}
		const step = this.total / (this.pts.length - 1);
		const ss = [a];
		for (let s = Math.ceil(a / step + 1e-6) * step; s < b; s += step) ss.push(s);
		ss.push(b);
		const left: string[] = [];
		const right: string[] = [];
		for (const s of ss) {
			let w: number;
			if (this.origin === null) {
				// 离笔尖越远越粗（非线性饱和）；起笔处用 sin 缓出收尖，比线性更像落笔时的「顿」
				const taper = Math.sin((Math.min(1, s / this.lead) * Math.PI) / 2);
				w = this.W * (1 - Math.exp(-(b - s) / this.L)) * taper;
			} else {
				w = this.W * (1 - Math.exp(-Math.min(s - a, b - s) / this.L));
			}
			const P = this.at(s);
			const A = this.at(s - step);
			const B = this.at(s + step);
			let nx = -(B.y - A.y);
			let ny = B.x - A.x;
			const m = Math.hypot(nx, ny) || 1;
			nx /= m;
			ny /= m;
			left.push(`${(P.x + nx * w).toFixed(2)},${(P.y + ny * w).toFixed(2)}`);
			right.push(`${(P.x - nx * w).toFixed(2)},${(P.y - ny * w).toFixed(2)}`);
		}
		this.el.setAttribute('d', `M${left.join('L')}L${right.reverse().join('L')}Z`);
	}
}

/**
 * 一组笔画按时间表书写。每一笔有自己的起止时间（相对 0..1 的总进度），
 * 每一笔内部用 pen() 让「下笔慢—行笔快—收笔慢」。
 */
export interface Plan {
	ink: Ink;
	/** 在总进度的哪一段里写这一笔 */
	from: number;
	to: number;
}

/** 书写的节奏：慢起、快行、慢收 */
export const pen = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * 一组笔画和它们的总进度 g。to() 从「当前进度」出发走向目标，
 * 所以写到一半要收回、收到一半又要写出来，都是从当前的样子接着走，不会跳。
 * 新的 to() 会接管：旧的那次立刻停手，它返回的 Promise 也立刻 resolve。
 */
export class InkGroup {
	g = 0;
	private tok: object | null = null;

	constructor(public plans: Plan[] = []) {}

	/** 换一套笔画（比如尺寸变了重建），保持当前进度 */
	set(plans: Plan[]) {
		this.plans = plans;
		this.draw(this.g);
	}

	draw(g: number) {
		this.g = g;
		for (const p of this.plans) {
			const local = Math.min(1, Math.max(0, (g - p.from) / (p.to - p.from)));
			p.ink.draw(pen(local));
		}
	}

	/** 从当前进度走到 target。ms 是走完整个 0→1 的时长，只走一部分就按比例缩短 */
	to(target: number, ms: number, reduce = false): Promise<void> {
		const tok = {};
		this.tok = tok;
		const g0 = this.g;
		const dur = ms * Math.abs(target - g0);
		if (reduce || dur <= 1) {
			this.draw(target);
			return Promise.resolve();
		}
		return new Promise((done) => {
			const t0 = performance.now();
			const frame = (now: number) => {
				if (this.tok !== tok) return done();
				const u = Math.min(1, (now - t0) / dur);
				this.draw(g0 + (target - g0) * u);
				if (u < 1) requestAnimationFrame(frame);
				else done();
			};
			requestAnimationFrame(frame);
		});
	}

	/** 停在当前进度 */
	stop() {
		this.tok = null;
	}
}

/**
 * 过一串点的光滑曲线（Catmull-Rom 转三次贝塞尔）。
 * 手写贝塞尔控制点太难调，给「笔要经过哪些点」更直观。
 */
export function smooth(pts: Pt[], tension = 1): Seg[] {
	const segs: Seg[] = [];
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[Math.max(0, i - 1)];
		const p1 = pts[i];
		const p2 = pts[i + 1];
		const p3 = pts[Math.min(pts.length - 1, i + 2)];
		const k = tension / 6;
		segs.push([
			p1,
			{ x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k },
			{ x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k },
			p2,
		]);
	}
	return segs;
}
