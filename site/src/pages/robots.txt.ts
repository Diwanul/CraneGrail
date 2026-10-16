import type { APIRoute } from 'astro';

// 生成而不是放在 public/：sitemap 的绝对地址要跟着 astro.config 的 site 走，
// 硬编码域名会在换域名时悄悄失效。
export const GET: APIRoute = ({ site }) =>
	new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site)}\n`, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
