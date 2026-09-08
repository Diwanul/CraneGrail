#!/usr/bin/env node
// 一键部署到 Azure Static Web Apps 免费层（不经过 GitHub）。跨平台：macOS / Windows / Linux。
//
//   node deploy.mjs          主页 + 博客都部署
//   node deploy.mjs blog     只构建并部署博客（等价于在 blog/ 里 npm run deploy）
//   node deploy.mjs home     只部署主页
//
// 部署令牌获取顺序：
//   1. 环境变量 SWA_TOKEN_BLOG / SWA_TOKEN_HOME（Windows 上没装 az 时用这个）
//   2. az staticwebapp secrets list（推荐：令牌不落盘，运行时现取）

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RG = 'dev-rg';
const WIN = process.platform === 'win32';

const TARGETS = {
	home: { label: '主页', swa: 'swa-home', dist: 'home', build: false, tokenEnv: 'SWA_TOKEN_HOME' },
	blog: { label: '博客', swa: 'swa-blog', dist: 'blog/dist', build: 'blog', tokenEnv: 'SWA_TOKEN_BLOG' },
};

function run(cmd, args, opts = {}) {
	// Windows 上 az / swa / npm 都是 .cmd 包装，必须走 shell 才能找到
	return spawnSync(cmd, args, { stdio: 'inherit', shell: WIN, cwd: ROOT, ...opts });
}

function capture(cmd, args) {
	const r = spawnSync(cmd, args, { encoding: 'utf8', shell: WIN, cwd: ROOT });
	return r.status === 0 ? (r.stdout ?? '').trim() : null;
}

function have(cmd) {
	const r = spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: WIN });
	return r.status === 0;
}

// swa CLI：装了就用，没装就用 npx 现拉（免全局安装，Windows 上省事）
const SWA = have('swa')
	? { cmd: 'swa', pre: [] }
	: { cmd: WIN ? 'npx.cmd' : 'npx', pre: ['--yes', '@azure/static-web-apps-cli'] };

function getToken(t) {
	const fromEnv = process.env[t.tokenEnv];
	if (fromEnv) {
		console.log(`  令牌来源：环境变量 ${t.tokenEnv}`);
		return fromEnv;
	}
	if (!have('az')) {
		console.error(
			`✗ 拿不到 ${t.swa} 的部署令牌：本机没有 az CLI，也没设 ${t.tokenEnv}。\n` +
				`  装 Azure CLI（推荐）：https://aka.ms/installazurecli\n` +
				`  或临时用令牌：在 Azure 门户 ${t.swa} → 管理部署令牌，然后设环境变量 ${t.tokenEnv}`,
		);
		process.exit(1);
	}
	console.log('  令牌来源：az（运行时现取，不落盘）');
	const token = capture('az', [
		'staticwebapp',
		'secrets',
		'list',
		'--name',
		t.swa,
		'-g',
		RG,
		'--query',
		'properties.apiKey',
		'-o',
		'tsv',
	]);
	if (!token) {
		console.error(`✗ az 取令牌失败。先确认已登录：az login（当前订阅要是 Azure for Students）`);
		process.exit(1);
	}
	return token;
}

function deploy(key) {
	const t = TARGETS[key];
	console.log(`\n▶ ${t.label} → ${t.swa}`);

	if (t.build) {
		console.log(`  构建 ${t.build}/`);
		const b = run(WIN ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: path.join(ROOT, t.build) });
		if (b.status !== 0) {
			console.error(`✗ ${t.label}构建失败，已中止部署`);
			process.exit(1);
		}
	}

	const distPath = path.join(ROOT, t.dist);
	if (!fs.existsSync(distPath)) {
		console.error(`✗ 产物目录不存在：${t.dist}`);
		process.exit(1);
	}

	const token = getToken(t);

	// swa deploy 偶发网络抖动，重试几次
	for (let attempt = 1; attempt <= 3; attempt++) {
		const r = run(SWA.cmd, [
			...SWA.pre,
			'deploy',
			`./${t.dist}`,
			'--deployment-token',
			token,
			'--env',
			'production',
		]);
		if (r.status === 0) {
			console.log(`✅ ${t.label}已上线`);
			return;
		}
		if (attempt < 3) console.log(`  第 ${attempt} 次失败，重试…`);
	}
	console.error(`✗ ${t.label}部署失败（已重试 3 次）`);
	process.exit(1);
}

const arg = (process.argv[2] ?? 'all').toLowerCase();
if (arg === 'all') {
	deploy('home');
	deploy('blog');
} else if (TARGETS[arg]) {
	deploy(arg);
} else {
	console.error('用法: node deploy.mjs [home|blog|all]');
	process.exit(1);
}
console.log('');
