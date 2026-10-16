#!/usr/bin/env node
// 本地预览。
//
//   node scripts/preview.mjs          开发模式：改文章、改 site.json、换图片，浏览器自动刷新
//   node scripts/preview.mjs --dist   先完整构建，再预览产物（和线上完全一致，含 CSP）
//   node scripts/preview.mjs --port 5000 --no-open
//
// 端口、地址、是否自动开浏览器写在内容目录 site.json 的 preview 里；命令行参数优先。

import fs from 'node:fs';
import { generateAll, resolveContentDir } from '../site/scripts/load-content.mjs';
import { die, NPM, openBrowser, run, SITE, start } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
	const i = args.indexOf(n);
	return i >= 0 ? args[i + 1] : undefined;
};

const { config } = await generateAll();
const port = Number(opt('--port') ?? config.preview.port);
const host = opt('--host') ?? config.preview.host;
const open = flag('--no-open') ? false : flag('--open') || config.preview.open;
const dist = flag('--dist');
const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/`;

if (dist) {
	console.log('\n  ── 构建 ──');
	if ((await run(NPM, ['run', 'build'], { cwd: SITE })).status !== 0) die('\n✗ 构建失败');
}

// 开发模式下内容目录在 site/ 外面，Astro 只盯着文章（glob loader 会监听），
// site.json 和 assets/ 的变化要自己盯：变了就重新生成，Vite 会接着热更新。
let watcher = null;
if (!dist) {
	const { dir } = resolveContentDir();
	let t = 0;
	const regen = (file) => {
		clearTimeout(t);
		t = setTimeout(async () => {
			try {
				await generateAll();
				console.log(`  ↻ ${file} 已变化，内容已重新生成`);
			} catch (e) {
				console.error(`  ✗ ${e.message}`);
			}
		}, 150);
	};
	try {
		watcher = fs.watch(dir, { recursive: true }, (_, f) => {
			if (f && (f === 'site.json' || f.startsWith('assets'))) regen(f);
		});
	} catch {
		console.warn('  ⚠️  这个平台不支持递归监听，改 site.json 后要重启预览');
	}
}

const child = start(
	NPM,
	['exec', '--', 'astro', dist ? 'preview' : 'dev', '--port', String(port), '--host', host],
	// Astro 检测到在 AI 助手/CI 里运行时会把 dev 自动转到后台并立刻返回，
	// 那样本脚本就退出了、文件监听也没了。显式要求前台。
	{ cwd: SITE, env: { ...process.env, ASTRO_DEV_BACKGROUND: '1' } },
);

// 等端口通了再开浏览器
if (open) {
	const t0 = Date.now();
	const poll = async () => {
		try {
			const r = await fetch(url);
			if (r.ok || r.status === 404) return openBrowser(url);
		} catch {
			/* 还没起来 */
		}
		if (Date.now() - t0 < 30000) setTimeout(poll, 400);
	};
	setTimeout(poll, 600);
}

const stop = () => {
	watcher?.close();
	child.kill();
	process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (c) => {
	watcher?.close();
	process.exit(c ?? 0);
});

console.log(`\n  预览：${url}${dist ? '（产物）' : '（开发模式，改内容自动刷新）'}  Ctrl+C 退出\n`);
