#!/usr/bin/env node
// 构建后生成 CSP，写进 dist/staticwebapp.config.json。
//
// 为什么要生成而不是手写：Astro 会把体积小的 <script> 直接内联进 HTML（这个行为没有
// 开关），还会注入一段 @font-face 的 <style>。内联内容要么开 'unsafe-inline'（等于没设防），
// 要么逐个算 sha256。这里选后者，并且**从真实产物里算**——所以哈希不可能与内容脱节。
//
// 由 npm run build 自动调用。单独跑：node scripts/gen-csp.mjs

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(SITE_DIR, 'dist');
const CONFIG = path.join(DIST, 'staticwebapp.config.json');

function walk(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (e.name.endsWith('.html')) out.push(p);
	}
	return out;
}

const sha256 = (s) => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;

// 只取真正内联的：有 src 的是外链，走 'self'；空的不需要哈希
function inlineBodies(html, tag) {
	const re = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)</${tag}>`, 'g');
	const out = [];
	for (const [, attrs, body] of html.matchAll(re)) {
		if (/\ssrc\s*=/i.test(attrs)) continue;
		if (!body.trim()) continue;
		out.push(body);
	}
	return out;
}

if (!fs.existsSync(DIST)) {
	console.error('✗ dist/ 不存在，先跑 astro build');
	process.exit(1);
}

const pages = walk(DIST);
const scripts = new Set();
const styles = new Set();
let inlineStyleAttrs = 0;

for (const p of pages) {
	const html = fs.readFileSync(p, 'utf8');
	for (const b of inlineBodies(html, 'script')) scripts.add(sha256(b));
	for (const b of inlineBodies(html, 'style')) styles.add(sha256(b));
	inlineStyleAttrs += (html.match(/\sstyle="/g) ?? []).length;
}

const csp = [
	"default-src 'self'",
	`script-src 'self' ${[...scripts].join(' ')}`.trim(),
	// style= 属性（Shiki 代码高亮每页上百个、splash 的背景图）没法哈希，只能整体放行。
	// 一旦 style-src 里出现哈希，'unsafe-inline' 就会被忽略，所以属性必须单独走
	// style-src-attr。老浏览器不认这条会回退到 style-src，届时属性样式失效但不影响功能。
	`style-src 'self' ${[...styles].join(' ')}`.trim(),
	"style-src-attr 'unsafe-inline'",
	"img-src 'self' data:",
	"font-src 'self'",
	"connect-src 'self'", // View Transitions 的预取走同源 fetch
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
	'upgrade-insecure-requests',
].join('; ');

const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
config.globalHeaders = { 'Content-Security-Policy': csp, ...config.globalHeaders };
fs.writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);

console.log(
	`  CSP 已写入 dist/staticwebapp.config.json\n` +
		`    扫描 ${pages.length} 个页面：内联脚本 ${scripts.size} 种、内联样式 ${styles.size} 种、` +
		`style= 属性 ${inlineStyleAttrs} 处（由 style-src-attr 放行）`,
);
