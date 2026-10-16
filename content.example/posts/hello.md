---
title: '第一篇'
description: '这是示例文章，用来让构建有内容可跑。写自己的第一篇时删掉它。'
pubDate: '2026-01-01'
category: 'thoughts'
---

这是一篇示例文章，作用只有两个：让 `npm run dev` 有东西可渲染，以及演示 frontmatter 怎么写。

## 新建文章

```bash
npm run new
```

会问标题、slug、简介、分类、封面图，然后在内容目录的 `posts/` 下建好 `<slug>.md` 与同名的 `<slug>.assets/` 目录，并自动用 Typora 打开。图片直接往正文里粘，会自动落进那个目录。

## frontmatter

```yaml
---
title: '标题'                                  # 必填
description: '一句话简介'                       # 主页 block 里标题下面那行
pubDate: '2026-01-01'                         # 必填，决定排序
category: 'thoughts'                          # 对应 site.json categories 的 id；不写就只在「全部」里
heroImage: './my-post.assets/cover.jpg'       # 可选，block 左侧的图；相对这篇 md，以 ./ 开头
updatedDate: '2026-01-05'                     # 可选
draft: true                                   # 可选，草稿不进构建
---
```
