import { getCollection, type CollectionEntry } from 'astro:content';
import config from '../site.generated';

export type Post = CollectionEntry<'posts'>;

/** About 就是 slug 为 about 的那篇普通文章；它多一个入口（主页头像），版式可以用 layout: about */
export const ABOUT = 'about';

/** 最后修改时间：有 updatedDate 用它，否则是发布日期。「新」按这个算 */
export const lastModified = (p: Post) => p.data.updatedDate ?? p.data.pubDate;

/** 全站唯一的文章读取入口：去掉草稿，按最后修改从新到旧。 */
export async function getSortedPosts(): Promise<Post[]> {
	const posts = await getCollection('posts', (p) => !p.data.draft);
	return posts.sort((a, b) => lastModified(b).valueOf() - lastModified(a).valueOf());
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
