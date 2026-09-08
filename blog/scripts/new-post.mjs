#!/usr/bin/env node
// 新建一篇博文：生成 <slug>.md + <slug>.assets/ 目录，可选顺手放一张封面图，然后用 Typora 打开。
// 跨平台（macOS / Windows / Linux）。
//
// 交互用法：   npm run new
// 直接给参数： npm run new -- --title "标题" --slug my-post --desc "简介" --cover ~/Pictures/a.jpg --pinned
// 不自动打开： 加 --no-open

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.resolve(HERE, '..');
const CONTENT_DIR = path.join(BLOG_DIR, 'src', 'content', 'blog');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

// ---------- 参数解析 ----------
function parseArgs(argv) {
	const out = { open: true };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--pinned') out.pinned = true;
		else if (a === '--no-open') out.open = false;
		else if (a.startsWith('--')) {
			const key = a.slice(2);
			const val = argv[i + 1]?.startsWith('--') ? '' : argv[++i];
			if (key === 'title') out.title = val;
			else if (key === 'slug') out.slug = val;
			else if (key === 'desc' || key === 'description') out.desc = val;
			else if (key === 'cover') out.cover = val;
		} else if (!out.title) out.title = a; // 位置参数当标题
	}
	return out;
}

// 终端里拖进来的路径会带引号或反斜杠转义的空格，清一下
function cleanPath(s) {
	let v = (s ?? '').trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		v = v.slice(1, -1);
	}
	v = v.replace(/\\(.)/g, '$1');
	if (v.startsWith('~')) v = path.join(process.env.HOME || process.env.USERPROFILE || '', v.slice(1));
	return v.trim();
}

// 标题 → slug。中文/非 ASCII 会被去掉，所以拿不到有效 slug 时要另外问。
function slugify(title) {
	return (title ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '') // 去掉分解出来的音调符号
		.toLowerCase()
		.replace(/['"’”]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

function today() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// YAML 单引号字符串：内部单引号翻倍
function yamlStr(s) {
	return `'${String(s ?? '').replace(/'/g, "''")}'`;
}

// 用 Typora 打开（打不开就交给系统默认的 .md 关联程序）
function openInEditor(file) {
	let cmd;
	let cmdArgs;
	if (process.platform === 'darwin') {
		const hasTypora = fs.existsSync('/Applications/Typora.app');
		cmd = 'open';
		cmdArgs = hasTypora ? ['-a', 'Typora', file] : [file];
	} else if (process.platform === 'win32') {
		// Windows 装了 Typora 后 .md 默认就归它；start 的第一个空参数是窗口标题占位
		cmd = 'cmd';
		cmdArgs = ['/c', 'start', '', file];
	} else {
		cmd = 'xdg-open';
		cmdArgs = [file];
	}
	const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true });
	child.on('error', () => console.log(`（没能自动打开，手动开一下：${file}）`));
	child.unref();
}

// ---------- 主流程 ----------
const args = parseArgs(process.argv.slice(2));
// 在终端里就逐项询问（已经用参数给过的那项会自动跳过）；被管道/CI 调用时完全靠参数
const interactive = Boolean(process.stdin.isTTY);
const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
const ask = async (q, def = '') => {
	if (!rl) return def;
	const a = (await rl.question(def ? `${q}（默认 ${def}）: ` : `${q}: `)).trim();
	return a || def;
};

try {
	const title = args.title || (await ask('标题'));
	if (!title) {
		console.error('✗ 标题不能为空');
		process.exit(1);
	}

	let slug = args.slug || slugify(title);
	if (!slug) {
		// 中文标题 slug 会是空的，给一个日期兜底再让用户改
		slug = await ask('英文短链（slug，用于网址）', `post-${today()}`);
		slug = slugify(slug) || `post-${today()}`;
	} else if (interactive && !args.slug) {
		slug = slugify(await ask('英文短链（slug，用于网址）', slug)) || slug;
	}

	const mdPath = path.join(CONTENT_DIR, `${slug}.md`);
	const assetsDir = path.join(CONTENT_DIR, `${slug}.assets`);
	if (fs.existsSync(mdPath)) {
		console.error(`✗ 已存在同名文章：${path.relative(BLOG_DIR, mdPath)}`);
		process.exit(1);
	}

	const desc = args.desc ?? (await ask('简介（首页卡片和悬停浮层会显示）'));

	let pinned = args.pinned ?? false;
	if (interactive && args.pinned === undefined) {
		pinned = /^y/i.test(await ask('置顶到首页？(y/N)', 'n'));
	}

	// 封面图
	let coverRel = '';
	let coverSrc = args.cover ? cleanPath(args.cover) : cleanPath(await ask('封面图路径（可直接把文件拖进终端，留空跳过）'));
	if (coverSrc) {
		if (!fs.existsSync(coverSrc)) {
			console.error(`✗ 找不到封面图：${coverSrc}`);
			process.exit(1);
		}
		const ext = path.extname(coverSrc).toLowerCase();
		if (!IMAGE_EXT.has(ext)) {
			console.error(`✗ 不支持的图片格式：${ext}`);
			process.exit(1);
		}
		fs.mkdirSync(assetsDir, { recursive: true });
		fs.copyFileSync(coverSrc, path.join(assetsDir, `cover${ext}`));
		coverRel = `./${slug}.assets/cover${ext}`;
	}

	// 先把图片目录建好，Typora 粘贴图片时直接往里放；
	// 目录里的图片不会被 Astro 当成文章（glob 只认 .md/.mdx）。
	fs.mkdirSync(assetsDir, { recursive: true });

	const fm = [
		'---',
		`title: ${yamlStr(title)}`,
		`description: ${yamlStr(desc)}`,
		`pubDate: ${yamlStr(today())}`,
		...(coverRel ? [`heroImage: ${yamlStr(coverRel)}`] : [`# heroImage: './${slug}.assets/cover.jpg'`]),
		...(pinned ? ['pinned: true'] : []),
		'---',
		'',
		'',
	].join('\n');
	fs.writeFileSync(mdPath, fm);

	console.log(`\n✅ 已创建 ${path.relative(BLOG_DIR, mdPath)}`);
	console.log(`   图片目录 ${path.relative(BLOG_DIR, assetsDir)}/  ← Typora 里粘贴/拖入的图会自动进这里`);
	if (!coverRel) console.log(`   封面：把图片放进上面目录，然后把 frontmatter 里注释掉的 heroImage 打开`);
	console.log(`\n下一步：`);
	console.log(`   npm run dev      本地预览 http://localhost:4321`);
	console.log(`   npm run deploy   构建并上线 blog.diwanul.xyz\n`);

	rl?.close();
	if (args.open) openInEditor(mdPath);
} catch (err) {
	rl?.close();
	if (err?.code === 'ABORT_ERR') process.exit(130); // Ctrl-C
	throw err;
}
