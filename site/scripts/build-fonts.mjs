// 站点字体：按 site.json 的 fonts 取字体文件，按全站实际用到的字裁成小 woff2，
// 写到 public/site-fonts/（单独一个目录，不会被 load-content 清 public/site/ 时误删），
// 并生成 src/styles/fonts.generated.css（@font-face）。
//
// 字体都是商业字体，所以不进仓库：放在内容目录（content/ 已 gitignore）里由你自己提供。
// site.json 的 fonts.titleZh / titleEn / bodyZh / bodyEn 写路径（相对内容目录）；
// 没写的那一项，再到 assets/fonts/ 里按文件名关键字找（不区分大小写）：
//   标题 · 中文   含 "yongle" / "永乐" 且含 "m"（如 FZWenQinYongLeDaDianM.ttf、方正文沁永乐大典体M简.ttf）
//   正文 · 中文   同上且含 "r"
//   标题 · 西文   含 "trajan"
//   正文 · 西文   含 "perpetua"
// 缺哪个就跳过哪个，页面会回退到系统字体，不会报错。
//
// 中文字体有几万字、十几 MB，必须裁剪：收集 site.json、全部文章、界面文字里出现过的字符，
// 只保留这些（再加上 ASCII 和常用标点）。字体换了或文章改了，每次构建都会重新裁。

import fs from 'node:fs';
import path from 'node:path';
import subsetFont from 'subset-font';

const ROLES = [
	{ key: 'titleZh', family: 'Site Title ZH', test: (n) => /(yongle|永乐)/i.test(n) && /(^|[^a-z])m([^a-z]|$)|m简|m\.|_m|-m|medium/i.test(n) },
	{ key: 'bodyZh', family: 'Site Body ZH', test: (n) => /(yongle|永乐)/i.test(n) && /(^|[^a-z])r([^a-z]|$)|r简|r\.|_r|-r|regular/i.test(n) },
	{ key: 'titleEn', family: 'Site Title EN', test: (n) => /trajan/i.test(n) },
	{ key: 'bodyEn', family: 'Site Body EN', test: (n) => /perpetua/i.test(n) },
];

const EXT = /\.(ttf|otf|woff2?|ttc)$/i;

function walk(dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const n of fs.readdirSync(dir)) {
		const p = path.join(dir, n);
		const st = fs.statSync(p);
		if (st.isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

/** 全站会显示的字符 */
function charset(contentDir, siteDir) {
	const set = new Set();
	const add = (s) => {
		for (const ch of s) set.add(ch);
	};
	// ASCII 可见字符 + 常用中文标点
	for (let c = 0x20; c < 0x7f; c++) set.add(String.fromCharCode(c));
	add('，。、；：？！“”‘’（）《》〈〉【】—…·～　©→←↑↓');
	const json = path.join(contentDir, 'site.json');
	if (fs.existsSync(json)) add(fs.readFileSync(json, 'utf8'));
	for (const f of walk(path.join(contentDir, 'posts'))) if (/\.(md|mdx)$/i.test(f)) add(fs.readFileSync(f, 'utf8'));
	for (const f of [path.join(siteDir, 'src', 'lib', 'ui.ts'), path.join(siteDir, 'scripts', 'load-content.mjs')]) {
		if (fs.existsSync(f)) add(fs.readFileSync(f, 'utf8'));
	}
	// 日期格式里的字
	add('0123456789年月日JanFebMarAprMayJunJulAugSepOctNovDec,');
	return [...set].filter((ch) => ch.codePointAt(0) >= 0x20).join('');
}

/**
 * @returns 生成了哪些角色（给 CSS 变量用）
 */
export async function buildFonts(contentDir, siteDir, cfg = {}) {
	const outDir = path.join(siteDir, 'public', 'site-fonts');
	const cssFile = path.join(siteDir, 'src', 'styles', 'fonts.generated.css');
	const files = walk(path.join(contentDir, 'assets', 'fonts')).filter((f) => EXT.test(f));
	const found = {};
	for (const r of ROLES) {
		const want = cfg[r.key];
		if (want) {
			const p = path.resolve(contentDir, want);
			if (fs.existsSync(p)) found[r.key] = p;
			else console.warn(`  ⚠️  fonts.${r.key} 指向的文件不存在：${want}`);
			continue;
		}
		const f = files.find((x) => r.test(path.basename(x)));
		if (f) found[r.key] = f;
	}
	fs.rmSync(outDir, { recursive: true, force: true });
	const text = Object.keys(found).length ? charset(contentDir, siteDir) : '';
	const urls = {};
	for (const r of ROLES) {
		const src = found[r.key];
		if (!src) continue;
		fs.mkdirSync(outDir, { recursive: true });
		// 西文字体只留拉丁字符和数字；中文字体留全站字符
		const keep = r.key.endsWith('Zh') ? text : text.replace(/[^ -ɏ -⁯©]/gu, '');
		let out;
		try {
			out = await subsetFont(fs.readFileSync(src), keep, { targetFormat: 'woff2' });
		} catch (e) {
			console.warn(`  ⚠️  字体 ${path.basename(src)} 裁剪失败（${e.message}），跳过`);
			continue;
		}
		const name = `${r.key}.woff2`;
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(path.join(outDir, name), out);
		urls[r.key] = `/site-fonts/${name}`;
		console.log(`  字体 ${r.key}：${path.basename(src)} → ${(out.length / 1024).toFixed(0)} KB`);
	}

	// 用 unicode-range 把两种字体拼成一个字族，同一段话里中文、西文自动用各自的字体：
	//   Site Title  中文模式的标题：汉字用永乐大典 M，拉丁字母和数字用 Trajan
	//   Site Body   中文模式的正文：汉字和数字用永乐大典 R，拉丁字母用 Perpetua
	//   Site Trajan / Site Perpetua  英文模式整段用西文字体（汉字回退到上面两个）
	// 同一个字族里，后声明的 face 优先，所以覆盖全部字符的中文字体写在前面。
	// 西文字体覆盖全部 ASCII 标点和空格（不然中文模式下 "Tom's Blog" 里的空格、撇号会落到中文字体，和英文模式宽度不同、位置跳动）。
	// 正文的数字仍用中文字体（LATIN 不含 0-9）；标题的数字用西文（LATIN_NUM）。
	const LATIN = 'U+0020-002F, U+003A-007E, U+00A0-024F, U+2010-201F, U+2026';
	const LATIN_NUM = `U+0030-0039, ${LATIN}`;
	const face = (family, url, range) =>
		`@font-face {
	font-family: '${family}';
	src: url('${url}') format('woff2');
	font-display: swap;${range ? `
	unicode-range: ${range};` : ''}
}`;
	const faces = [];
	if (urls.titleZh) faces.push(face('Site Title', urls.titleZh));
	if (urls.titleEn) faces.push(face('Site Title', urls.titleEn, LATIN_NUM), face('Site Trajan', urls.titleEn));
	if (urls.bodyZh) faces.push(face('Site Body', urls.bodyZh));
	if (urls.bodyEn) faces.push(face('Site Body', urls.bodyEn, LATIN), face('Site Perpetua', urls.bodyEn));
	const body = `/* 由 scripts/build-fonts.mjs 生成，别手改。已 gitignore。 */\n${faces.join('\n')}\n`;
	const prev = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, 'utf8') : null;
	if (prev !== body) fs.writeFileSync(cssFile, body);
	if (!faces.length) console.log('  字体：内容目录 assets/fonts/ 里没有站点字体，用系统字体');
	return Object.keys(urls);
}
