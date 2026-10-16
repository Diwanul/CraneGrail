#!/usr/bin/env node
// 把站点（代码 + 内容目录里的文章、配置、图片）构建好并上传。
//
//   node scripts/upload.mjs            检查 → 构建 → 上传
//   node scripts/upload.mjs --dry-run  只检查和构建，不上传
//   node scripts/upload.mjs --no-check 跳过 astro check（不推荐）
//
// 传到哪里完全由内容目录 site.json 的 upload 决定，脚本里不写任何目标：
//
//   "upload": {
//     "provider": "azure-swa",          目前支持的唯一一种
//     "resourceGroup": "my-rg",
//     "staticWebApp": "my-swa",
//     "environment": "production",      可选，默认 production；写别的名字就是预览环境
//     "check": true                     可选，默认 true：上传前先跑 astro check
//   }
//
// 部署令牌获取顺序：环境变量 SWA_TOKEN → az staticwebapp secrets list（运行时现取，不落盘）。
// 令牌经环境变量交给 swa CLI，不走命令行参数——命令行参数在进程列表里谁都能看见。

import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../site/scripts/load-content.mjs';
import { capture, die, DIST, have, NPM, run, SITE, WIN } from './lib.mjs';

const argv = new Set(process.argv.slice(2));
const dryRun = argv.has('--dry-run');

const { isExample, contentDir, config } = loadContent();
if (isExample && !dryRun) die('✗ 现在用的是示例内容（content.example/），不能上传。建一个 content/ 或设 CONTENT_DIR。');

const up = config.upload;
if (!up && !dryRun) {
	die(
		'✗ site.json 里没写上传目标。加上：\n' +
			'  "upload": { "provider": "azure-swa", "resourceGroup": "…", "staticWebApp": "…" }',
	);
}

const PROVIDERS = { 'azure-swa': azureSwa };
if (up && !PROVIDERS[up.provider]) {
	die(`✗ 不认识的 upload.provider：${up.provider}。目前支持：${Object.keys(PROVIDERS).join(', ')}`);
}

console.log(`\n▶ 内容目录：${path.relative(process.cwd(), contentDir) || contentDir}`);
console.log(`  站点地址：${config.site.url}`);
if (up) console.log(`  上传目标：${up.provider} / ${up.staticWebApp ?? '?'} / ${up.environment}`);

// ---------- 检查 + 构建 ----------

if (up?.check !== false && !argv.has('--no-check')) {
	console.log('\n  ── 检查 ──');
	if ((await run(NPM, ['run', 'check'], { cwd: SITE })).status !== 0) die('\n✗ astro check 未通过，已中止（上面是具体报错）');
}

// npm run build = 读内容 + astro build + 从产物生成 CSP
console.log('\n  ── 构建 ──');
if ((await run(NPM, ['run', 'build'], { cwd: SITE })).status !== 0) die('\n✗ 构建失败，已中止（上面是具体报错）');
if (!fs.existsSync(path.join(DIST, 'index.html'))) die('✗ 产物不完整：site/dist/index.html 不存在');

const pages = [];
(function walk(d) {
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name);
		if (e.isDirectory()) walk(p);
		else if (e.name.endsWith('.html')) pages.push(path.relative(DIST, p));
	}
})(DIST);
console.log(`\n  产物：${pages.length} 个页面`);

if (dryRun) {
	console.log('\n✅ --dry-run：构建通过，未上传。本地看效果：node scripts/preview.mjs --dist\n');
	process.exit(0);
}

await PROVIDERS[up.provider](up);

// ---------- 各家上传 ----------

async function azureSwa(t) {
	if (!t.resourceGroup || !t.staticWebApp) die('✗ upload 缺 resourceGroup 或 staticWebApp');

	let token = process.env.SWA_TOKEN;
	if (token) console.log('\n  令牌来源：环境变量 SWA_TOKEN');
	else {
		if (!have('az')) {
			die(
				`✗ 拿不到部署令牌：本机没有 az CLI，也没设 SWA_TOKEN。\n` +
					`  装 Azure CLI：https://aka.ms/installazurecli\n` +
					`  或临时用令牌：Azure 门户 → ${t.staticWebApp} → 管理部署令牌，设成环境变量 SWA_TOKEN`,
			);
		}
		console.log('\n  令牌来源：az（运行时现取，不落盘）');
		token = capture('az', [
			'staticwebapp', 'secrets', 'list',
			'--name', t.staticWebApp, '-g', t.resourceGroup,
			'--query', 'properties.apiKey', '-o', 'tsv',
		]);
		if (!token) die('✗ az 取令牌失败。先确认已登录：az login');
	}

	const swa = have('swa')
		? { cmd: 'swa', pre: [] }
		: { cmd: WIN ? 'npx.cmd' : 'npx', pre: ['--yes', '@azure/static-web-apps-cli'] };
	// --swa-config-location 指向产物：不加的话 swa CLI 会在仓库里乱找 staticwebapp.config.json
	const r = await run(
		swa.cmd,
		[...swa.pre, 'deploy', DIST, '--env', t.environment, '--swa-config-location', DIST],
		{ env: { ...process.env, SWA_CLI_DEPLOYMENT_TOKEN: token } },
	);
	if (r.status !== 0) diagnose(r);
	const url = (r.out.match(/https:\/\/\S+azurestaticapps\.net\S*/) ?? [])[0];
	console.log(`\n✅ 已上传${url ? `：${url}` : ''}\n`);
}

// 把报错翻译成「下一步该干什么」。没匹配上就原样把输出末尾交回去。
function diagnose({ status, out, err }) {
	const blob = `${out}\n${err}`;
	const SYMPTOMS = [
		[/401|403|unauthorized|forbidden|invalid.*token|deployment token/i, '部署令牌无效或过期：az login 重新登录，或去门户重新生成令牌。'],
		[/enotfound|etimedout|econnreset|socket hang up|network|getaddrinfo/i, '网络问题：确认网络通畅后重跑即可。'],
		[/quota|limit exceeded|too many/i, '触到 SWA 免费层配额了：去门户看用量。'],
	];
	console.error(`\n✗ 上传失败（退出码 ${status}）`);
	const hits = SYMPTOMS.filter(([re]) => re.test(blob)).map(([, m]) => m);
	for (const h of hits) console.error(`   • ${h}`);
	const tail = blob.trim().split('\n').filter((l) => l.trim()).slice(-20);
	if (tail.length) console.error('\n  ── 输出末尾 ──\n  ' + tail.join('\n  '));
	process.exit(1);
}
