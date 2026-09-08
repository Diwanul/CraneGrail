#!/usr/bin/env node
// 给文章里的图片瘦身：手机/相机原图动辄 5MB+，留着只会拖慢构建、占满磁盘。
// Astro 构建时本来就会生成优化过的 webp，这里瘦的是**源文件**。
//
//   npm run tidy            只体检，报告能省多少，不改任何文件
//   npm run tidy -- --write 真的改（原地覆盖）
//
// 注意：.assets 里的图已经是从相册/原始文件复制过来的副本，覆盖它不影响你的原图。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.resolve(HERE, '..');
const SCAN_DIRS = [path.join(BLOG_DIR, 'src', 'content', 'blog'), path.join(BLOG_DIR, 'src', 'assets')];

const MAX_WIDTH = 2400; // 再大对网页毫无意义
const JPEG_QUALITY = 82;
const EXTS = new Set(['.jpg', '.jpeg', '.png']);

const WRITE = process.argv.includes('--write');

function walk(dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (EXTS.has(path.extname(e.name).toLowerCase())) out.push(p);
	}
	return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(d));
if (files.length === 0) {
	console.log('没找到可处理的图片。');
	process.exit(0);
}

let savedTotal = 0;
let touched = 0;
const kb = (n) => `${(n / 1024).toFixed(0)}kB`;

for (const file of files) {
	const before = fs.statSync(file).size;
	const ext = path.extname(file).toLowerCase();

	let pipeline;
	try {
		const img = sharp(file);
		const meta = await img.metadata();
		const needResize = (meta.width ?? 0) > MAX_WIDTH;
		pipeline = needResize ? img.resize({ width: MAX_WIDTH, withoutEnlargement: true }) : img;
		pipeline = ext === '.png' ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
	} catch (err) {
		console.log(`  跳过（读不出来）${path.relative(BLOG_DIR, file)}: ${err.message}`);
		continue;
	}

	const buf = await pipeline.toBuffer();
	const saved = before - buf.length;
	// 省不到 10% 就别动，避免无意义的重编码损失画质
	if (saved <= 0 || saved / before < 0.1) continue;

	touched++;
	savedTotal += saved;
	console.log(`  ${WRITE ? '压缩' : '可压缩'} ${path.relative(BLOG_DIR, file)}  ${kb(before)} → ${kb(buf.length)}`);
	if (WRITE) fs.writeFileSync(file, buf);
}

console.log(
	`\n扫了 ${files.length} 张图，${touched} 张值得压，合计${WRITE ? '已省下' : '可省下'} ${kb(savedTotal)}。` +
		(WRITE || touched === 0 ? '' : '\n要真的压缩：npm run tidy -- --write'),
);
