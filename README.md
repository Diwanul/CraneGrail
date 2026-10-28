# CraneGrail

一个游戏 UI 风格的个人博客框架：对话框式的封面幻灯片、横向章节环和纵向文章列组成的主页、在主页里就地展开的阅读页。
所有框线都是脚本按元素尺寸实时生成的手写笔画。纯静态站点，基于 [Astro](https://astro.build)。

**代码与内容完全分离。** 仓库里只有框架和一份能跑通的示例内容（`content.example/`）；
你的文章、图片、字体和配置放在独立的 `content/` 目录里，它不进版本控制。

## 特性

- **封面**：背景幻灯片 + 对话框，台词逐字出现；每个浏览器会话洗一次牌决定播放顺序。
- **主页**：底部是首尾相接的章节环，上面是当前章节的文章列；键盘、滚轮、触屏都能操作。
- **阅读**：文章在主页里就地展开，左边的标示线兼作目录——每一节按实际长度等比例挂在线上，
  一个滑动框标出这一屏读到哪里。直接打开或刷新文章地址也是同一个外壳。
- **About**：就是 `posts/about.md` 这篇普通文章，主页头像是它的额外入口；可选 `layout: about` 版式：banner 上的头像和名字飞下来放大成卷首，称号、座右铭、图标链接依次淡入。
- **折叠块**：`:::fold[标题] … :::`，展开 / 收起带动画。
- **中 / 英双语**：界面文字、分类名、封面台词都可以写两版，访客随时切换。
- **字体**：中西文字体分别配置、自动混排；构建时按全站实际用到的字裁成小 woff2。
- **搜索**：标题、简介、分类名的本地搜索，结果作为一个临时章节滑进环里。
- **安全**：严格 CSP（`script-src` 不含 `unsafe-inline`），哈希在构建后从真实产物里算出。
- 系统开启「减少动态效果」时所有动画跳过。

## 开始

需要 Node.js 22.12 以上。

```bash
git clone https://github.com/Diwanul/CraneGrail.git && cd CraneGrail
cp -r content.example content       # 复制一份示例内容，之后改成你自己的
cd site && npm install && cd ..
node scripts/preview.mjs            # http://127.0.0.1:4321，改内容自动刷新
```

没有 `content/` 也能跑：会自动用 `content.example/` 并打印一行提示。
内容目录放在别处也行：`CONTENT_DIR=/path/to/my-content node scripts/preview.mjs`。

## 目录

```
.
├── content.example/      示例内容，复制成 content/ 再改
│   ├── site.json           站点的全部可定制项
│   ├── posts/              文章（.md + 同名 .assets/ 图片目录）；about.md 也是头像的入口
│   └── assets/             头像、封面图、分类图标、字体
├── content/              你的内容（gitignore）
├── site/                 Astro 项目
│   ├── scripts/            读内容、裁字体、新建文章、图片瘦身、生成 CSP
│   ├── src/scripts/        交互：home/（封面、章节环、文章列、框线）、reader.ts（阅读页）、ink.ts（笔画）
│   └── WRITING.md          写文章的流程
├── scripts/
│   ├── preview.mjs         本地预览
│   └── upload.mjs          检查 + 构建 + 上传
└── CONTENT.md            site.json 每个字段的说明与默认值
```

## 内容目录

- **`site.json`**：名字、分类、置顶、链接、邮箱、封面幻灯片、字体与字号、各种尺寸、动画速度。
  可选项不填就当作没有（没有封面就直接进主页），必需项不填用内置默认值。每个字段见 [`CONTENT.md`](CONTENT.md)。
- **`posts/`**：文章。每篇只有一个普通分类，即 frontmatter 的 `category`，对应 `site.json` 里分类的 `id`；
  置顶、最新、搜索、其他是特殊分类。正文里的 `#` / `##` / `###` 会挂到阅读页的目录上。
- **`assets/`**：`site.json` 引用的图片和字体都放这里。图片构建时转成 webp。

字体通常是商业授权，所以只放在你自己的 `content/` 里，不随仓库分发；没有字体时回退到系统衬线体。

## 操作

| | 键盘 | 鼠标 / 触屏 |
|---|---|---|
| 封面 → 主页 | Enter / ↓ / 空格 | 点对话框；滚轮向下；上滑 |
| 切换幻灯片 | ← → | 鼠标移到屏幕左右边缘，点出现的箭头；左右滑 |
| 切换章节 | ← → | 点章节；在章节行上滚动；左右滑 |
| 选文章 | ↑ ↓ | 点一下选中；滚轮（滚多少格走多少篇）；上下滑 |
| 打开文章 | Enter | 再点一下已选中的 |
| 读完回主页 | Esc / 浏览器后退 | 点 banner 中间的头像 |
| 跳到某一节 | | 点标示线左边的小节名 |
| 搜索 | /，输入后 Enter | 左上角放大镜 |
| 中 / 英 | | 右上角语言图标 |
| 关于 | | 主页上点 banner 中间的头像 |
| 回封面 | Esc | |

刷新、浏览器后退、从文章页返回都直接回到原来的章节和选中项，不重放封面。

## 命令

在 `site/` 下：

```bash
npm run new       # 新建文章：建骨架 + 图片目录，并用 Typora 打开
npm run check     # 类型与 frontmatter 检查
npm run build     # 读内容 + 构建 + 生成 CSP
npm run tidy      # 源图体检（加 -- --write 才真的压缩）
```

在仓库根：

```bash
node scripts/preview.mjs            # 开发预览
node scripts/preview.mjs --dist     # 完整构建后预览产物（与线上一致，含 CSP）
node scripts/upload.mjs --dry-run   # 只检查和构建，不上传
node scripts/upload.mjs             # 检查 + 构建 + 上传
```

## 部署

产物是纯静态文件（`site/dist/`），可以放在任何静态托管上。
`upload.mjs` 内置了 Azure Static Web Apps 的上传：目标写在 `site.json` 的 `upload` 里，
部署令牌运行时从 `az` 现取（或读环境变量 `SWA_TOKEN`），不落盘。

CSP 写在 `dist/staticwebapp.config.json` 里。Astro 会把小脚本自动内联，所以哈希必须在构建之后计算：
**用 `npm run build`，别单独跑 `astro build` 就去部署。** 换别的托管时，把这份配置里的响应头搬过去即可。

## 许可证

代码以 [MIT](LICENSE) 许可证发布。`content.example/` 里的示例文章仅作演示。
