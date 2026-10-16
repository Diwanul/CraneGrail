// 从专用入口导入，不要从包根 '@astrojs/mdx' —— 包根会连带加载一个未安装的
// 可选 peer dep（@astrojs/markdown-satteri），构建会挂在 MISSING_EXPORT 上。
import { getContainerRenderer as getMDXRenderer } from '@astrojs/mdx/container-renderer';
import rss from '@astrojs/rss';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { render } from 'astro:content';
import sanitizeHtml from 'sanitize-html';
import { config, t } from '../lib/site';
import { getSortedPosts } from '../lib/posts';

// 正文用容器 API 在构建期真正渲染一遍，而不是把原始 markdown 过一遍 markdown-it：
// 后者渲染不了 MDX，也解析不了 ./post.assets/x.png 这类要经过 Astro 图片管线的相对路径。

/** RSS 阅读器不共享站点的 CSS，所以只留结构性标签；style/script/class 一律丢掉。 */
const ALLOWED_TAGS = [
	'p', 'br', 'hr', 'blockquote', 'pre', 'code',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'ul', 'ol', 'li', 'dl', 'dt', 'dd',
	'strong', 'em', 'b', 'i', 'del', 's', 'sup', 'sub', 'mark',
	'a', 'img', 'figure', 'figcaption',
	'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
];

/**
 * 清理并把站内链接绝对化。
 * Astro 渲染出的 src/href 是根相对的（/_astro/xxx.webp），阅读器脱离站点上下文，必须给绝对地址。
 */
function toFeedHtml(html, site) {
	const abs = (u) => {
		if (!u) return u;
		// 纯锚点（脚注的 #user-content-fn-1）必须原样留着：阅读器把正文内联渲染在
		// 自己页面里，锚点在那一页内跳转才是对的。绝对化会把它指向站点首页。
		if (u.startsWith('#')) return u;
		try {
			return new URL(u, site).href;
		} catch {
			return u; // data: URI 之类，原样留着
		}
	};

	return sanitizeHtml(html, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: {
			a: ['href', 'title'],
			img: ['src', 'alt', 'title', 'width', 'height'],
			th: ['colspan', 'rowspan'],
			td: ['colspan', 'rowspan'],
			code: ['class'], // 保留 language-xxx，部分阅读器据此高亮
		},
		// srcset/sizes 里是一串相对 URL，阅读器基本不用，留着只会变成死链
		transformTags: {
			a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, href: abs(attribs.href) } }),
			img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, src: abs(attribs.src) } }),
		},
	});
}

export async function GET(context) {
	const posts = await getSortedPosts();

	const renderers = await loadRenderers([getMDXRenderer()]);
	const container = await AstroContainer.create({ renderers });

	const items = [];
	for (const post of posts) {
		const { Content } = await render(post);
		const html = await container.renderToString(Content);
		items.push({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			link: `/${post.id}/`,
			content: toFeedHtml(html, context.site),
		});
	}

	return rss({
		title: t(config.site.title),
		description: t(config.site.description) || t(config.site.title),
		site: context.site,
		items,
	});
}
