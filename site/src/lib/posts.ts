import { getCollection, type CollectionEntry } from 'astro:content';
import config from '../site.generated';

export type Post = CollectionEntry<'posts'>;

/** About 是一篇特殊的文章：posts/about.md，只在 /about/ 显示，不进主页列表、RSS、搜索 */
export const ABOUT = 'about';

/** 全站唯一的文章读取入口：去掉草稿和 About，按发布日期从新到旧。 */
export async function getSortedPosts(): Promise<Post[]> {
	const posts = await getCollection('posts', (p) => !p.data.draft && p.id !== ABOUT);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

const known = new Set(config.categories.map((c) => c.id));

/**
 * 某个分类下的文章，主页每一格用它。
 *   pinned  site.json 的 pinned，按那里的顺序
 *   latest  全部文章，从新到旧
 *   other   没写分类、或者写的分类不在 categories 里的
 */
export function postsInCategory(all: Post[], categoryId: string): Post[] {
	if (categoryId === 'latest') return all;
	if (categoryId === 'pinned') {
		const bySlug = new Map(all.map((p) => [p.id, p]));
		return config.pinned.map((s) => bySlug.get(s)).filter((p): p is Post => !!p);
	}
	if (categoryId === 'other') return all.filter((p) => !p.data.category || !known.has(p.data.category));
	return all.filter((p) => p.data.category === categoryId);
}

/** About 那篇（没写或是草稿就返回 null） */
export async function getAbout(): Promise<Post | null> {
	const all = await getCollection('posts', (p) => p.id === ABOUT && !p.data.draft);
	return all[0] ?? null;
}
