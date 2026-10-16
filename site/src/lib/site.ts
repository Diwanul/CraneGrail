// 页面侧对内容层的访问：配置、资源查找、尺寸变量。

import type { ImageMetadata } from 'astro';
import config from '../site.generated';

export { config };

export type { Lang, Loc } from './config-types';
import type { Lang, Loc } from './config-types';

/** 构建期用的默认语言版本（<title>、RSS、文章页等不切换语言的地方） */
export const lang: Lang = config.defaultLang;
export const t = (v: Loc, l: Lang = lang) => v[l];

// 内容目录的 assets/ 在构建前被拷进 src/content-assets/，这里让 Astro 图片管线接管它们
const files = import.meta.glob<{ default: ImageMetadata }>(
	'../content-assets/**/*.{png,jpg,jpeg,webp,avif,gif,svg}',
	{ eager: true },
);

/** site.json 里写的资源路径（assets/xxx）→ 图片元数据。找不到返回 null。 */
export function asset(rel: string | null | undefined): ImageMetadata | null {
	if (!rel) return null;
	return files[`../content-assets/${rel.replace(/^assets\//, '')}`]?.default ?? null;
}

/**
 * site.json 的 layout / motion 落成 CSS 变量，挂在 <html style> 上。
 * 用 style 属性而不是 <style> 块：值随配置变，放进 <style> 会让 CSP 哈希每改一次配置就变。
 */
export function htmlStyle(): string {
	const L = config.layout;
	// 普通像素：脚本要用 getComputedStyle 读这些变量，必须是能直接 parseFloat 的值
	const u = (n: number) => `${n}px`;
	const vars: Record<string, string> = {
		'--banner-h': u(L.bannerHeight),
		'--avatar': u(L.avatarSize),
		'--block-w': u(L.blockWidth),
		'--block-h': u(L.blockHeight),
		'--block-img-w': L.blockImageRatio > 0 ? u(Math.round(L.blockHeight * L.blockImageRatio)) : '0px',
		'--block-gap': u(L.blockGap),
		'--active-scale': String(L.activeScale),
		'--rail-w': u(L.railWidth),
		'--cat-w': u(L.categoryWidth),
		'--cat-h': u(L.categoryHeight),
		'--cat-gap': u(L.categoryGap),
		'--cat-active-scale': String(L.categoryActiveScale),
		'--speed': String(config.motion.speed),
		'--fs-title': u(config.fonts.titleSize),
		'--fs-body': u(config.fonts.bodySize),
		'--fs-line': u(config.fonts.lineSize),
		'--fs-cat': u(config.fonts.categorySize),
	};
	return Object.entries(vars)
		.map(([k, v]) => `${k}:${v}`)
		.join(';');
}
