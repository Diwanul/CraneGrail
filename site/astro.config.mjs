// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import { loadContent } from './scripts/load-content.mjs';

// 内容目录（文章、配置、图片）与代码分离，见 scripts/load-content.mjs
const { config, contentDir } = loadContent();

// https://astro.build/config
export default defineConfig({
	site: config.site.url,
	integrations: [mdx(), sitemap()],
	// 内容目录可能在 site/ 之外（默认是仓库根的 content/），dev server 默认不许读项目根以外
	vite: { server: { fs: { allow: ['..', contentDir] } } },
	build: {
		// CSP 需要：默认 'auto' 会把小样式表内联成 <style>，那样 style-src 就只能开 'unsafe-inline'
		inlineStylesheets: 'never',
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
