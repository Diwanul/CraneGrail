# 写博客 / 发博客

日常流程只有三步：

```bash
npm run new                     # 建一篇新文章（会自动用 Typora 打开）
node ../scripts/preview.mjs     # 本地预览，边写边刷新
node ../scripts/upload.mjs      # 检查 + 构建 + 上线
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
description: '一句话简介'                       # 主页 block 里标题下面那行
pubDate: '2026-08-14'                         # 必填，发布日期
heroImage: './my-post.assets/cover.jpg'        # 可选，block 左侧的图，也是文章页顶部大图
category: 'thoughts'                           # 可选，对应 site.json categories 的 id
                                              # 路径相对于这篇 md 自己，必须以 ./ 开头
updatedDate: '2026-08-20'                     # 可选，最后修改日期：改过文章就更新它，排序和列表日期按它
layout: about                                  # 可选，about 版式（卷首 + 链接卡片）
---
```

- **没写 `heroImage`** 的文章在主页 block 里图片位置是空的，正文照常显示。
- **置顶**不写在文章里，写在 `site.json` 的 `pinned`（slug 列表，按顺序排在「全部」最上面）。

## 三、命令速查

```bash
npm run new                     # 交互式：依次问标题、slug、简介、分类、封面图
npm run new -- --title "标题" --slug my-post --desc "简介" --category life
npm run new -- ... --no-open    # 建完不自动打开 Typora

npm run dev                     # 只起 Astro dev（不监听 site.json，推荐用下面的 preview）
npm run check                   # 类型 / frontmatter 检查（upload 会自动先跑）
npm run build                   # 只构建，产物在 dist/

npm run tidy                    # 图片体检：报告哪些源图太大、能省多少，不改文件
npm run tidy -- --write         # 真的压缩（超过 2400px 缩到 2400px，重编码 jpg）
```

封面图路径可以**直接把文件从 Finder / 资源管理器拖到终端里**，脚本会自动处理引号和空格转义。

在仓库根目录还可以：

```bash
node scripts/preview.mjs            # 开发预览（site.json / assets 变了也会刷新）
node scripts/preview.mjs --dist     # 预览构建产物
node scripts/upload.mjs             # 检查 + 构建 + 上传到 site.json 的 upload 目标
node scripts/upload.mjs --dry-run   # 不上传
```

## 四、Windows 上要装什么

1. **Node.js ≥ 22.12**（<https://nodejs.org>），然后在 `site/` 里跑一次 `npm install`
2. **Typora**（<https://typora.io>），按上面第一节配置
3. **Azure CLI**（<https://aka.ms/installazurecli>），装完跑 `az login`

第 3 步是为了让上传脚本在运行时现取部署令牌，**令牌不会落盘**。
如果暂时不想装 Azure CLI，也可以去 Azure 门户对应的 Static Web App → 管理部署令牌，
把令牌设成环境变量 `SWA_TOKEN`，脚本会优先用它。
但这相当于把长期凭据存在本机，不如装 az。

## 五、常见问题

**图片在 Typora 里能看见，构建后 404？**
检查正文里的路径是不是相对路径（`my-post.assets/pic.png`），
而不是绝对路径（`/Users/...` 或 `C:\...`）。Typora 勾了"优先使用相对路径"就不会出这个问题。

**改了文章但线上没变？**
`node scripts/upload.mjs` 是「检查 + 构建 + 上传」，全部跑完才会变；中途失败会打印诊断。

**Astro 报 `heroImage` 找不到？**
frontmatter 里的路径要以 `./` 开头，且相对于这个 md 文件本身，
比如 `./my-post.assets/cover.jpg`。`npm run new` 生成的就是这个形式。

（仓库里那几篇 Astro 模板自带的示例文章用的是 `../../assets/...`，
两种写法 Astro 都认，但你自己写的文章一律用 `./` 那种。示例文章迟早要删掉。）

**文章不想发但想先存着？**
frontmatter 写 `draft: true`，或者干脆放在内容目录的 `posts/` 外面。
刻意不做 `draft: true` 之类的机制：这个站本质是本地文章的线上镜像，
草稿阶段完全在本地进行，没必要让线上仓库承担草稿状态。
