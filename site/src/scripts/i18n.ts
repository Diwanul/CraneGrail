// 运行时切换中英文。
//
// 页面上所有可切换的文字都带着两份：data-zh / data-en（正文）、data-zh-label / data-en-label（aria-label）、
// data-zh-ph / data-en-ph（placeholder）。日期用 <time data-date> 标出，按语言重新格式化。
// 访客的选择存在 localStorage，所有页面共用；没选过就用 site.json 的 site.lang。

export type Lang = 'zh' | 'en';

const KEY = 'lang';

export function getLang(def: Lang): Lang {
	try {
		const v = localStorage.getItem(KEY);
		if (v === 'zh' || v === 'en') return v;
	} catch {
		/* 存储被禁 */
	}
	return def;
}

export function storeLang(l: Lang) {
	try {
		localStorage.setItem(KEY, l);
	} catch {
		/* 存储被禁：只在这一页生效 */
	}
}

const DATE: Record<Lang, Intl.DateTimeFormat> = {
	zh: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
	en: new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }),
};

export function applyLang(l: Lang, scope: ParentNode = document) {
	document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
	for (const el of scope.querySelectorAll<HTMLElement>('[data-zh], [data-en]')) {
		const v = el.dataset[l];
		if (v !== undefined && el.textContent !== v) el.textContent = v;
	}
	for (const el of scope.querySelectorAll<HTMLElement>('[data-zh-label]')) {
		el.setAttribute('aria-label', el.dataset[`${l}Label`] ?? '');
	}
	for (const el of scope.querySelectorAll<HTMLInputElement>('[data-zh-ph]')) {
		el.placeholder = el.dataset[`${l}Ph`] ?? '';
	}
	for (const el of scope.querySelectorAll<HTMLTimeElement>('time[data-date]')) {
		const t = new Date(el.dateTime);
		if (!Number.isNaN(t.valueOf())) el.textContent = DATE[l].format(t);
	}
}
