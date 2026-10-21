import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { postsDirHref } from './site.generated';

// 文章在内容目录的 posts/ 下（见 scripts/load-content.mjs），不在 site/ 里。
const posts = defineCollection({
	loader: glob({ base: postsDirHref, pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string().default(''),
			pubDate: z.coerce.date(),
			/** 最后修改日期。排序和列表上显示的日期都按它（没写就用 pubDate） */
			updatedDate: z.coerce.date().optional(),
			/** 列表 block 左侧的图，也是文章页顶部的大图。相对这篇 md，以 ./ 开头 */
			heroImage: z.optional(image()),
			/** 对应 site.json categories 里的 id。不写就只出现在「全部」里 */
			category: z.string().optional(),
			/** 版式：article 普通文章；about 多一个卷首（大头像、名字、简介）和底部的链接卡片 */
			layout: z.enum(['article', 'about']).default('article'),
			/** 草稿不进构建 */
			draft: z.boolean().default(false),
		}),
});

export const collections = { posts };
