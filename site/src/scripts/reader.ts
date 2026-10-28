// 文章阅读：目录挂在标示线上 + 正文里的装饰笔画。主页阅读模式和独立文章页共用。
//
// 目录：正文里的 h1 / h2 / h3 各对应线上一个三角，名字写在线左边（右对齐，太长就换行）。
//   - 位置按「这一节在页面上实际有多高」等比例缩放到线上：长的节占的线段长，短的节占得短；
//   - 级别越高三角越大、名字越大；h4 及以下太细了，不放进目录；
//   - 线上有一个滑动的框，框住「这一屏」对应的那一段（同样等比例缩放）；框里的小节名字提亮。
//
// 文章标题不再自动放在正文上面：要标题就在 markdown 里写 #，它会作为一级挂到线上。
// 装饰：封面图左上、右下两个角；引用一个左上角。代码块不加框。

import { InkGroup } from './ink';
import { cardCorner, DIALOG_ORNAMENT, marker, ornament, P, place, placeCorner } from './home/frame';

type Level = 1 | 2 | 3;
type Section = { el: HTMLElement; level: Level; item: HTMLAnchorElement; lit: boolean };

/** 每一级用哪种标记（frame.ts 的 marker） */
const SIZE: Record<Level, Parameters<typeof marker>[0]> = { 1: 'cat', 2: 'small', 3: 'tiny' };

export class Reader {
	private sections: Section[] = [];
	private raf = 0;
	/** 线上表示「这一屏」的滑动框 */
	private view: HTMLElement | null = null;
	private span0: [number, number] = [0, 0];

	constructor(
		/** 滚动容器（主页阅读模式下是 .reader，独立页面是 window） */
		private scroller: HTMLElement | Window,
		private doc: HTMLElement,
		private toc: HTMLElement,
		private railX: () => number,
		/** 目录在线上占的纵向范围（视口坐标） */
		private span: () => [number, number],
		private reduce = false,
	) {
		this.build();
		this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
		this.doc.addEventListener('click', this.onAnchor);
		this.doc.addEventListener('click', this.onFold);
	}

	/**
	 * 折叠块（:::fold，渲染成 <details class="fold">）：接管展开 / 收起，换成动画。
	 *   展开  先打开，内容区高度从 0 长到实际高度，左边那道竖线自上而下写出来，内容随后淡入下移到位；
	 *   收起  倒着放，放完才真的关上。三角在点下的那一刻就转过去。
	 * 正文高度变了，放完重排目录（折起来的标题不挂在线上）。
	 */
	private onFold = (e: MouseEvent) => {
		const sum = (e.target as HTMLElement).closest('summary');
		const det = sum?.parentElement;
		if (!sum || !(det instanceof HTMLDetailsElement) || !det.classList.contains('fold') || !this.doc.contains(det)) return;
		e.preventDefault();
		this.toggleFold(det);
	};

	private async toggleFold(det: HTMLDetailsElement) {
		const body = det.querySelector<HTMLElement>(':scope > .fold-body');
		if (!body) return;
		for (const a of body.getAnimations({ subtree: true })) a.cancel();
		const opening = !det.open || det.classList.contains('closing');
		const ms = this.reduce ? 0 : 1;
		if (opening) {
			det.classList.remove('closing');
			det.open = true;
			const h = body.scrollHeight;
			const kids = [...body.children] as HTMLElement[];
			await Promise.all([
				body.animate([{ height: '0px', opacity: 0.4 }, { height: `${h}px`, opacity: 1 }], { duration: 380 * ms, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished,
				body.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 420 * ms, easing: 'cubic-bezier(.3,.7,.2,1)', pseudoElement: '::before' }).finished,
				...kids.slice(0, 12).map(
					(k, i) => k.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 320 * ms, delay: (90 + i * 40) * ms, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }).finished,
				),
			]).catch(() => {});
		} else {
			det.classList.add('closing');
			const h = body.offsetHeight;
			const ok = await Promise.all([
				body.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 300 * ms, easing: 'cubic-bezier(.55,0,.8,.2)' }).finished,
				body.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)', transformOrigin: 'top' }], { duration: 260 * ms, easing: 'cubic-bezier(.55,0,.8,.2)', pseudoElement: '::before' }).finished,
			]).then(
				() => true,
				() => false,
			);
			// 半路又被点开了：那边接管，这边不关
			if (!ok || !det.classList.contains('closing')) return;
			det.classList.remove('closing');
			det.open = false;
		}
		this.build();
	}

	/**
	 * 正文里的页内链接（脚注 [^1] 和脚注末尾的 ↩ 返回链接、手写的 #锚点）：就地滚过去，不改地址栏。
	 * 不拦的话浏览器会为 #… 新增一条历史记录，之后的后退 / popstate 会被主页当成「回主页」把文章关掉。
	 */
	private onAnchor = (e: MouseEvent) => {
		const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
		if (!a || !this.doc.contains(a)) return;
		e.preventDefault();
		const id = decodeURIComponent(a.getAttribute('href')!.slice(1));
		const el = id ? document.getElementById(id) : null;
		if (!el || !this.doc.contains(el)) return;
		this.scrollTo(el, 'center');
		// 落点闪一下，告诉读者跳到了哪
		el.animate([{ backgroundColor: 'rgba(255, 255, 255, 0.16)' }, { backgroundColor: 'rgba(255, 255, 255, 0)' }], { duration: 1400, easing: 'ease-out' });
	};

	/**
	 * 只滚阅读区自己。不用 scrollIntoView：它会把所有能滚的祖先都滚一遍，
	 * 包括 overflow: hidden 的 .stage，整个阅读区就被顶上去、下边界跑到屏幕中间。
	 */
	private scrollTo(el: HTMLElement, block: 'start' | 'center') {
		const behavior: ScrollBehavior = this.reduce ? 'auto' : 'smooth';
		if (!(this.scroller instanceof HTMLElement)) {
			el.scrollIntoView({ behavior, block });
			return;
		}
		const box = this.scroller.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
		const y = block === 'start' ? r.top - box.top - margin : r.top - box.top - (box.height - r.height) / 2;
		this.scroller.scrollTo({ top: this.scroller.scrollTop + y, behavior });
	}

	destroy() {
		this.scroller.removeEventListener('scroll', this.onScroll);
		this.doc.removeEventListener('click', this.onAnchor);
		this.doc.removeEventListener('click', this.onFold);
		cancelAnimationFrame(this.raf);
		this.toc.replaceChildren();
	}

	/** 尺寸变了：重新排目录和装饰 */
	build() {
		this.toc.replaceChildren();
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
		this.toc.appendChild(svg);
		// 只给读者看得见的标题挂目录（脚注区的「Footnotes」是给读屏用的 .sr-only，不挂；折起来的也不挂）
		// About 版式整页居中，不挂目录
		const plain = this.doc.classList.contains('about');
		const heads = plain ? [] : [...this.doc.querySelectorAll<HTMLElement>('.doc-body h1, .doc-body h2, .doc-body h3')].filter((h) => !h.classList.contains('sr-only') && !h.closest('details:not([open])'));
		const [top, bottom] = this.span();
		this.span0 = [top, bottom];
		const x = this.railX();
		const ys = this.positions(heads, top, bottom);
		this.sections = heads.map((el, i) => {
			if (!el.id) el.id = `s-${i + 1}`;
			const level = Number(el.tagName[1]) as Level;
			const y = ys[i];
			const item = document.createElement('a');
			item.className = `toc-item lv${level}`;
			item.href = `#${el.id}`;
			item.textContent = el.textContent ?? '';
			item.style.top = `${y}px`;
			item.addEventListener('click', (e) => {
				e.preventDefault();
				this.scrollTo(el, 'start');
			});
			this.toc.appendChild(item);
			new InkGroup(place(svg, marker(SIZE[level]), (q) => P(x + q.x, y + q.y))).draw(1);
			return { el, level, item, lit: false };
		});
		this.view = null;
		if (!plain) {
			this.view = document.createElement('div');
			this.view.className = 'toc-view';
			this.view.style.left = `${x}px`;
			this.toc.appendChild(this.view);
		}
		this.declutter();
		this.buildDecos();
		this.update(true);
	}

	/**
	 * 每个标题在线上的 y：按它在页面上的实际位置（离正文顶部多远）等比例缩放到 [top, bottom]。
	 * 于是两个标题在线上的间距 ∝ 它们之间那一节在页面上的高度。
	 */
	private positions(heads: HTMLElement[], top: number, bottom: number) {
		if (!heads.length) return [];
		const body = this.doc.querySelector<HTMLElement>('.doc-body') ?? this.doc;
		const b0 = body.getBoundingClientRect().top;
		const total = Math.max(1, body.scrollHeight);
		return heads.map((h) => top + ((h.getBoundingClientRect().top - b0) / total) * (bottom - top));
	}

	/** 名字可能换行变高，相邻两个挤在一起时往下推开（三角不动，只动名字） */
	private declutter() {
		let last = -Infinity;
		for (const s of this.sections) {
			const y = parseFloat(s.item.style.top);
			const h = s.item.offsetHeight;
			const want = Math.max(y, last + h / 2 + 4);
			s.item.style.top = `${want}px`;
			last = want + h / 2;
		}
	}

	private buildDecos() {
		for (const s of this.doc.querySelectorAll('.deco')) s.remove();
		const add = (host: HTMLElement, fn: (svg: SVGSVGElement, w: number, h: number) => ReturnType<typeof place>) => {
			const w = host.offsetWidth;
			const h = host.offsetHeight;
			if (w < 4 || h < 4) return;
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('class', 'deco');
			svg.setAttribute('aria-hidden', 'true');
			svg.setAttribute('viewBox', `-40 -40 ${w + 80} ${h + 80}`);
			host.prepend(svg);
			new InkGroup(fn(svg, w, h)).draw(1);
		};
		const hero = this.doc.querySelector<HTMLElement>('.doc-hero');
		if (hero)
			add(hero, (svg, w, h) => [
				...placeCorner(svg, cardCorner(Math.min(w * 0.22, 160), h * 0.3), -8, -8, 1, 1),
				...placeCorner(svg, cardCorner(Math.min(w * 0.22, 160), h * 0.3), w + 8, h + 8, -1, -1),
			]);
		// About 卷首：底边中央一个和封面对话框同款的底饰，把卷首和正文隔开
		const head = this.doc.querySelector<HTMLElement>('.about-head');
		if (head) add(head, (svg, w, h) => place(svg, ornament({ ...DIALOG_ORNAMENT, rule: Math.min(w * 0.2, 160) }), (q) => P(w / 2 + q.x, h + q.y)));
		for (const q of this.doc.querySelectorAll<HTMLElement>('.doc-body blockquote'))
			add(q, (svg, w, h) => placeCorner(svg, cardCorner(Math.min(w * 0.18, 90), Math.min(h * 0.7, 60)), 0, 0, 1, 1));
	}

	private onScroll = () => {
		if (!this.raf) this.raf = requestAnimationFrame(() => ((this.raf = 0), this.update()));
	};

	/**
	 * 哪些小节在屏幕里：一节从它的标题开始，到下一个同级或更高级标题为止；
	 * 和视口有交集就亮。
	 */
	private update(force = false) {
		const H = innerHeight;
		const tops = this.sections.map((s) => s.el.getBoundingClientRect().top);
		const end = (this.doc.querySelector('.doc-body') ?? this.doc).getBoundingClientRect().bottom;
		// 滑动框：视口在正文里的范围 [−b0, −b0 + H]，按 positions() 同样的比例落到线上
		const body = this.doc.querySelector<HTMLElement>('.doc-body') ?? this.doc;
		const b0 = body.getBoundingClientRect().top;
		const total = Math.max(1, body.scrollHeight);
		const [top, bottom] = this.span0;
		const clamp = (v: number) => Math.min(1, Math.max(0, v));
		const y0 = top + clamp(-b0 / total) * (bottom - top);
		const y1 = top + clamp((H - b0) / total) * (bottom - top);
		if (this.view) {
			this.view.style.top = `${y0}px`;
			this.view.style.height = `${Math.max(14, y1 - y0)}px`;
			if (force) this.view.style.transition = 'none';
			else this.view.style.transition = '';
		}
		this.sections.forEach((s, i) => {
			let j = i + 1;
			while (j < this.sections.length && this.sections[j].level > s.level) j++;
			const a = tops[i];
			const b = j < this.sections.length ? tops[j] : end;
			const lit = b > 0 && a < H;
			if (lit === s.lit && !force) return;
			s.lit = lit;
			s.item.classList.toggle('on', lit);
		});
	}
}
