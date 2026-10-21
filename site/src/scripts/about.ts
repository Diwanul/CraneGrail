// About 卷首（layout: about）的进出场。
//
// 进：banner 上的头像和两侧名字「飞」到卷首对应的位置并放大（banner 上那一份同时藏起来）；
//     落定后名字上方的称号自下而上淡入（竖着一串时离名字近的先出），名字下方的座右铭向下淡入，
//     头像背后一排图标链接从头像中心散开、落到头像下方。
// 出：倒着放：图标收回头像背后、称号和座右铭淡去，头像和名字飞回 banner。
//
// 飞的是卷首那一份的克隆（字号大，放大过程不糊），起点按 banner 上文字的实际外框换算成 transform。

import { EASE, EASE_IN, run } from './home/core';

type Pair = { src: HTMLElement; dst: HTMLElement; text: boolean };

export const isAbout = (node: HTMLElement | null | undefined): node is HTMLElement => !!node?.classList.contains('about');

/** 文字元素：取文字本身的外框（元素可能比文字宽，比如右对齐的名字） */
function box(el: HTMLElement, text: boolean): DOMRect {
	if (!text) return el.getBoundingClientRect();
	const r = document.createRange();
	r.selectNodeContents(el);
	return r.getBoundingClientRect();
}

function pairs(ident: HTMLElement, node: HTMLElement): Pair[] {
	const out: Pair[] = [];
	const add = (s: string, t: string, text: boolean) => {
		const src = ident.querySelector<HTMLElement>(s);
		const dst = node.querySelector<HTMLElement>(t);
		if (src && dst) out.push({ src, dst, text });
	};
	add('.avatar-btn', '.ah-av', false);
	add('.name-l', '.ah-l .ah-name', true);
	add('.name-r', '.ah-r .ah-name', true);
	return out;
}

const extras = (node: HTMLElement) => ({
	titles: [...node.querySelectorAll<HTMLElement>('.ah-title')],
	mottos: [...node.querySelectorAll<HTMLElement>('.ah-motto')],
	links: [...node.querySelectorAll<HTMLElement>('.ah-link')],
});

/** 每个图标相对头像中心的位移（散开的起点 / 收回的终点） */
function toCenter(node: HTMLElement, el: HTMLElement) {
	const av = node.querySelector<HTMLElement>('.ah-av')!.getBoundingClientRect();
	const r = el.getBoundingClientRect();
	return { x: av.left + av.width / 2 - (r.left + r.width / 2), y: av.top + av.height / 2 - (r.top + r.height / 2) };
}

/** 头像、名字从 a 飞到 b：dir 1 = banner → 卷首，-1 = 卷首 → banner */
async function fly(ps: Pair[], dir: 1 | -1, ms: number) {
	const jobs = ps.map(({ src, dst, text }) => {
		const a = box(src, text);
		const b = box(dst, text);
		const c = dst.cloneNode(true) as HTMLElement;
		c.classList.add('ah-fly');
		c.style.visibility = ''; // 卷首那一份进场前是藏着的，克隆别带上
		Object.assign(c.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
		document.body.appendChild(c);
		dst.style.visibility = 'hidden';
		const s = b.height ? a.height / b.height : 1;
		const far = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${s})`;
		const kf = dir === 1 ? [{ transform: far }, { transform: 'none' }] : [{ transform: 'none' }, { transform: far }];
		return run(c, kf, ms, { easing: dir === 1 ? EASE : EASE_IN }).then(() => c);
	});
	return Promise.all(jobs);
}

/** 进场前：卷首的头像、名字、称号、座右铭、图标都先藏起来 */
export function aboutPrep(node: HTMLElement) {
	for (const el of node.querySelectorAll<HTMLElement>('.ah-av, .ah-name')) el.style.visibility = 'hidden';
	const { titles, mottos, links } = extras(node);
	for (const el of [...titles, ...mottos, ...links]) el.style.opacity = '0';
}

export async function aboutIn(node: HTMLElement, ident: HTMLElement, d: (ms: number) => number) {
	const ps = pairs(ident, node);
	const clones = await (async () => {
		const p = fly(ps, 1, d(560));
		ident.style.visibility = 'hidden';
		return p;
	})();
	for (const { dst } of ps) dst.style.visibility = '';
	for (const c of clones) c.remove();

	const { titles, mottos, links } = extras(node);
	await Promise.all([
		// 称号：离名字近的（最下面那个）先出，向上淡入
		...titles.map((el) => {
			const list = [...el.parentElement!.children];
			const k = list.length - 1 - list.indexOf(el);
			return run(el, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], d(420), { delay: d(80 + k * 90) });
		}),
		...mottos.map((el) => run(el, [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], d(460), { delay: d(160) })),
		// 图标：从头像中心（头像背后）散开到各自的位置
		...links.map((el, i) => {
			const c = toCenter(node, el);
			return run(el, [{ opacity: 0, transform: `translate(${c.x}px, ${c.y}px) scale(0.4)` }, { opacity: 1, transform: 'none' }], d(520), { delay: d(60 + i * 70) });
		}),
	]);
}

export async function aboutOut(node: HTMLElement, ident: HTMLElement, d: (ms: number) => number) {
	const { titles, mottos, links } = extras(node);
	await Promise.all([
		...[...titles, ...mottos].map((el) => run(el, [{ opacity: 1 }, { opacity: 0 }], d(220), { easing: EASE_IN })),
		...links.map((el, i) => {
			const c = toCenter(node, el);
			return run(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate(${c.x}px, ${c.y}px) scale(0.4)` }], d(300), { delay: d(i * 40), easing: EASE_IN });
		}),
	]);
	const ps = pairs(ident, node);
	const clones = await fly(ps, -1, d(460));
	ident.style.visibility = '';
	for (const c of clones) c.remove();
}

/** 直接打开 /about/：不飞，卷首直接就位，banner 上的那份藏起来 */
export function aboutInstant(ident: HTMLElement) {
	ident.style.visibility = 'hidden';
}

/** 离开时（不播动画的路径）把 banner 上的那份放回来 */
export function aboutReset(ident: HTMLElement) {
	ident.style.visibility = '';
}
