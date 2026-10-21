// 可折叠块。markdown 里这样写（Sätteri 的 directive 容器语法）：
//
//   :::fold[标题]
//   折起来的内容，可以是任何 markdown。
//   :::
//
//   :::fold[默认展开的]{open}
//   ...
//   :::
//
// 嵌套时外层多写一个冒号（::::fold[外] … :::fold[内] … ::: … ::::）。
// 输出 <details class="fold"><summary>标题</summary><div class="fold-body">…</div></details>，
// 没有脚本也能展开；有脚本时由 src/scripts/reader.ts 接管，放展开 / 收起的动画。
//
// 打开 directive 之后，正文里的 :xxx / ::xxx 也会被认成指令（比如 12:30 里的 :30）。
// fold 以外的指令一律原样还原成文字，免得误伤。

/** 节点里的纯文字，用来还原误识别的指令 */
const literal = (n) => (n.type === 'text' ? n.value : (n.children ?? []).map(literal).join(''));
const label = (n) => (n.children?.length ? `[${n.children.map(literal).join('')}]` : '');

const fold = {
	name: 'fold',
	textDirective(n, ctx) {
		ctx.replaceNode(n, { type: 'text', value: `:${n.name}${label(n)}` });
	},
	leafDirective(n, ctx) {
		ctx.replaceNode(n, { type: 'paragraph', children: [{ type: 'text', value: `::${n.name}${label(n)}` }] });
	},
	containerDirective(n, ctx) {
		if (n.name !== 'fold') {
			// 不认识的容器：开头一行还原成文字，里面的内容照常显示
			ctx.replaceNode(n, [{ type: 'paragraph', children: [{ type: 'text', value: `:::${n.name}` }] }, ...n.children]);
			return;
		}
		const [first, ...rest] = n.children;
		const has = !!first?.data?.directiveLabel;
		const open = !!n.attributes && 'open' in n.attributes;
		// 借 blockquote / paragraph 的壳，靠 hName 换成 details / summary / div
		ctx.replaceNode(n, {
			type: 'blockquote',
			data: { hName: 'details', hProperties: { className: ['fold'], ...(open ? { open: true } : {}) } },
			children: [
				{ type: 'paragraph', data: { hName: 'summary' }, children: has ? first.children : [{ type: 'text', value: '…' }] },
				{ type: 'blockquote', data: { hName: 'div', hProperties: { className: ['fold-body'] } }, children: has ? rest : n.children },
			],
		});
	},
};

/**
 * 接到 Astro 默认的 Sätteri 处理器上：打开 directive 语法，挂上 fold。
 * 处理器的 options 本来就留给集成改（见 @astrojs/markdown-satteri），这样不用自己装它，
 * 也不会和 @astrojs/mdx 的版本要求打架。md 和 mdx 共用这一份。
 */
export default function foldIntegration() {
	return {
		name: 'fold',
		hooks: {
			'astro:config:setup': ({ config }) => {
				const o = config.markdown.processor.options;
				o.features.directive = true;
				o.mdastPlugins.push(fold);
			},
		},
	};
}
