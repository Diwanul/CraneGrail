# diwanul-web

[diwanul.xyz](https://www.diwanul.xyz)（主页）和 [blog.diwanul.xyz](https://blog.diwanul.xyz)（博客）的源码。

托管在 **Azure Static Web Apps 免费层**，从本机手动部署，**不经过 GitHub Actions**——
这个仓库只是源码存放和跨设备同步，推代码不会触发任何自动部署，上线要显式跑 `npm run deploy`。

```
diwanul-web/
├── home/           主页（纯静态 HTML）        → SWA: swa-home
├── blog/           博客（Astro）              → SWA: swa-blog
│   ├── src/content/blog/   文章 .md + 同名 .assets/ 图片目录
│   ├── scripts/            新建文章 / 图片瘦身脚本
│   └── WRITING.md          ★ 写博客的完整说明，先看这个
├── deploy.mjs      跨平台部署脚本（Mac / Windows 通用）
└── deploy.sh       转发给 deploy.mjs 的壳，兼容旧习惯
```

---

## 换到新设备怎么开始

### 1. 装三样东西

| 装什么 | 用途 | 地址 |
|---|---|---|
| **Node.js ≥ 22.12** | 构建博客、跑脚本 | <https://nodejs.org> |
| **Typora** | 写文章（图片自动入库靠它） | <https://typora.io> |
| **Azure CLI** | 部署时现取令牌 | <https://aka.ms/installazurecli> |

### 2. 拉代码、装依赖

这是**私有仓库**，新设备上得先认证。最省事的办法是用 GitHub CLI（<https://cli.github.com>）：

```bash
gh auth login                          # GitHub.com → HTTPS → 浏览器登录
gh api user --jq '{login,id}'          # 必须是 {"login":"Diwanul","id":309150450}
gh repo clone Diwanul/diwanul-web
cd diwanul-web/blog
npm install
```

> ⚠️ 有两个 GitHub 账户：**Diwanul（id 309150450）才是这个项目用的**，
> yfhu25（id 55041545）是老身份。`gh` 显示的账户名不可信，永远按 **id** 核对。
> 已登录过多个账户时用 `gh auth switch --user Diwanul` 切过来。

`gh auth login` 会顺带配好 git 凭据助手，之后 `git pull` / `git push` 不用再输密码。
不想装 gh 就自己配 SSH key，然后 `git clone git@github.com:Diwanul/diwanul-web.git`。

> `npm install` 只在 `blog/` 里跑，`home/` 是纯静态 HTML 没有依赖。
> 注意别并发跑两次 `npm install`，会把 astro 包装坏（踩过）。

### 3. 登录 Azure

```bash
az login          # 选 Diwanul@outlook.com，订阅要是 "Azure for Students"
```

部署令牌**不存在这个仓库里，也不落盘**，每次部署时由 `deploy.mjs` 现从 `az` 取。

### 4. 配一次 Typora

**偏好设置 → 图像**：插入图片时选「复制到指定路径」，路径填 `./${filename}.assets`，
勾上「对本地位置的图片应用上述规则」和「优先使用相对路径」。
细节和截图级说明见 [`blog/WRITING.md`](blog/WRITING.md)。

### 5. 验证一切正常

```bash
cd blog
npm run dev       # 打开 http://localhost:4321 能看到博客即成功
```

---

## 日常命令

在 `blog/` 目录下：

```bash
npm run new       # 新建文章：建骨架 + 建图片目录 + 自动开 Typora
npm run dev       # 本地预览，改文件自动热更新
npm run deploy    # 构建 + 上线博客
npm run tidy      # 源图体检（加 -- --write 才真的压缩）
```

在仓库根目录：

```bash
node deploy.mjs           # 主页 + 博客都部署
node deploy.mjs home      # 只部署主页
node deploy.mjs blog      # 只部署博客
```

写文章的完整流程、frontmatter 字段、常见问题：**[`blog/WRITING.md`](blog/WRITING.md)**

---

## 线上架构

| 域名 | 指向 | 说明 |
|---|---|---|
| `diwanul.xyz` | 301 → `www.diwanul.xyz` | Cloudflare Bulk Redirects |
| `www.diwanul.xyz` | `swa-home` | 主页 |
| `blog.diwanul.xyz` | `swa-blog` | 博客 |

- 域名注册在阿里云，**DNS 解析托管在 Cloudflare**（免费层支持根域 CNAME 扁平化，阿里云不行）。
- Cloudflare 里指向 SWA 的 CNAME 必须保持 **DNS only（灰云）**，开橙云会让 SWA 的证书自动续期失败。
- Azure 资源组 `dev-rg`，区域 eastasia，两个 Static Web App 都在免费层，不消耗学生额度。
