// upload.mjs / preview.mjs 共用的进程工具。

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = path.join(ROOT, 'site');
export const DIST = path.join(SITE, 'dist');
export const WIN = process.platform === 'win32';
export const NPM = WIN ? 'npm.cmd' : 'npm';

// Windows 需要走 shell（az/swa/npm 都是 .cmd），但 shell:true 配 args 数组会触发
// DEP0190（参数只拼接不转义）。所以自己拼一条带引号的命令串交给 shell。
function winCmd(cmd, args) {
	return [cmd, ...args]
		.map((a) => (/[\s"&|<>^()]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a))
		.join(' ');
}

/** 边流式打印边留一份副本（失败时用来诊断）。 */
export function run(cmd, args, opts = {}) {
	return new Promise((resolve) => {
		const child = WIN
			? spawn(winCmd(cmd, args), { stdio: ['inherit', 'pipe', 'pipe'], shell: true, cwd: ROOT, ...opts })
			: spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], cwd: ROOT, ...opts });
		let out = '';
		let err = '';
		child.stdout.on('data', (c) => {
			out += c;
			process.stdout.write(c);
		});
		child.stderr.on('data', (c) => {
			err += c;
			process.stderr.write(c);
		});
		child.on('error', (e) => resolve({ status: -1, out, err: err + e.message }));
		child.on('close', (status) => resolve({ status, out, err }));
	});
}

/** 后台常驻子进程，输出直通，返回句柄。 */
export function start(cmd, args, opts = {}) {
	return WIN
		? spawn(winCmd(cmd, args), { stdio: 'inherit', shell: true, cwd: ROOT, ...opts })
		: spawn(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
}

export function capture(cmd, args) {
	const r = WIN
		? spawnSync(winCmd(cmd, args), { encoding: 'utf8', shell: true, cwd: ROOT })
		: spawnSync(cmd, args, { encoding: 'utf8', cwd: ROOT });
	return r.status === 0 ? (r.stdout ?? '').trim() : null;
}

export function have(cmd) {
	const r = WIN
		? spawnSync(winCmd(cmd, ['--version']), { stdio: 'ignore', shell: true })
		: spawnSync(cmd, ['--version'], { stdio: 'ignore' });
	return r.status === 0;
}

/** 用系统默认浏览器打开一个地址。 */
export function openBrowser(url) {
	const [cmd, args] =
		process.platform === 'darwin' ? ['open', [url]] : WIN ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
	spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

export function die(msg) {
	console.error(msg);
	process.exit(1);
}
