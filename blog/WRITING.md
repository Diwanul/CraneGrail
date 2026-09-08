# 写博客 / 发博客

日常流程只有三步：

```bash
npm run new       # 建一篇新文章（会自动用 Typora 打开）
npm run dev       # 本地预览 http://localhost:4321，边写边刷新
npm run deploy    # 构建 + 上线 blog.diwanul.xyz
```

图片**不需要任何手动操作**：在 Typora 里直接粘贴（Ctrl/Cmd+V）或拖进正文，
按下面配一次 Typora 之后，图片会自动存到这篇文章专属的 `<slug>.assets/` 目录，
正文里写的是相对路径，Astro 构建时会自动转成优化过的 webp 并生成多档尺寸。

---

## 一、Typora 配一次（Mac 和 Windows 都一样）

打开 **偏好设置 → 图像**（Windows: 文件 → 偏好设置 → 图像），按下面设：

| 项 | 设成 |
|---|---|
| 插入图片时 | **复制到指定路径** |
| 路径填 | `./${filename}.assets` |
| ☑️ 对本地位置的图片应用上述规则 | 勾上 |
| ☑️ 优先使用相对路径 | 勾上 |

> `${filename}` 是 Typora 的内置变量，会替换成当前 md 文件名。
> 这样 `my-post.md` 的图片就都进 `my-post.assets/`，和 `npm run new` 建出来的目录正好对上。

另外建议在 **偏好设置 → Markdown** 里勾上 **YAML Front Matter**，
这样文章顶部的 `title / description / pubDate` 会显示成一个漂亮的表格而不是一堆横线。

## 二、frontmatter 各字段

`npm run new` 会自动填好，需要改的时候看这里：

```yaml
---
title: '文章标题'                              # 必填
description: '一句话简介'                       # 必填，首页卡片和悬停浮层显示的就是它
pubDate: '2026-08-14'                         # 必填，发布日期
heroImage: './my-post.assets/cover.jpg'        # 可选，封面图（首页列表 / 置顶卡片用）
pinned: true                                   # 可选，置顶到首页顶部（最多取 3 篇）
updatedDate: '2026-08-20'                     # 可选，更新日期
---
```

- **没写 `heroImage`** 的文章在首页列表里没有配图，正文照常显示。
- **`pinned: true` 超过 3 篇**时只取最新的 3 篇进置顶区，其余的自动回到下面的列表。

## 三、命令速查

```bash
npm run new                     # 交互式：依次问标题、slug、简介、是否置顶、封面图
npm run new -- --title "标题" --slug my-post --desc "简介" --pinned
npm run new -- ... --no-open    # 建完不自动打开 Typora

npm run dev                     # 本地预览（改文件自动热更新）
npm run build                   # 只构建，产物在 dist/
npm run deploy                  # 构建 + 上线博客

npm run tidy                    # 图片体检：报告哪些源图太大、能省多少，不改文件
npm run tidy -- --write         # 真的压缩（超过 2400px 缩到 2400px，重编码 jpg）
```

封面图路径可以**直接把文件从 Finder / 资源管理器拖到终端里**，脚本会自动处理引号和空格转义。

在仓库根目录还可以：

```bash
node deploy.mjs           # 主页 + 博客都部署
node deploy.mjs home      # 只部署主页
node deploy.mjs blog      # 只部署博客
```

## 四、Windows 上要装什么

1. **Node.js ≥ 22.12**（<https://nodejs.org>），然后在 `blog/` 里跑一次 `npm install`
2. **Typora**（<https://typora.io>），按上面第一节配置
3. **Azure CLI**（<https://aka.ms/installazurecli>），装完跑 `az login`

第 3 步是为了让部署脚本在运行时现取部署令牌，**令牌不会落盘**。
如果暂时不想装 Azure CLI，也可以去 Azure 门户 `swa-blog` → 管理部署令牌，
把令牌设成环境变量 `SWA_TOKEN_BLOG`（主页是 `SWA_TOKEN_HOME`），脚本会优先用它。
但这相当于把长期凭据存在本机，不如装 az。

## 五、常见问题

**图片在 Typora 里能看见，构建后 404？**
检查正文里的路径是不是相对路径（`my-post.assets/pic.png`），
而不是绝对路径（`/Users/...` 或 `C:\...`）。Typora 勾了"优先使用相对路径"就不会出这个问题。

**改了文章但线上没变？**
`npm run deploy` 是「构建 + 上传」，两步都跑完才会变。看到 `✅ 博客已上线` 才算成功。

**Astro 报 `heroImage` 找不到？**
frontmatter 里的路径要以 `./` 开头，且相对于这个 md 文件本身。

**文章不想发但想先存着？**
文件名前加下划线不行（Astro 仍会收录）。最简单的办法是先不放进 `src/content/blog/`，
或者把 `pubDate` 设成未来日期然后自己在列表里忽略——真需要草稿功能告诉我，加个 `draft: true` 字段过滤掉就行。
