<div align=center>

![Apple Music-like Lyrics - A lyric page component library for Web](https://github.com/user-attachments/assets/ca6a98d4-28ea-4fb6-beec-7948f2ac87ec)

# Apple Music-like Lyrics

[English](./README.md) / 简体中文

一个基于 Web 技术制作的类 Apple Music 歌词显示组件库，同时支持[ DOM 原生](./packages/core/README.md)、[React ](./packages/react/README.md)和[ Vue ](./packages/react/README.md)绑定，[与各种平台兼容的外置播放器](./packages/player/README.md)也仍在制作当中。

这是你能在前端系里能见到的最像 iPad Apple Music 的播放页面了。

尽管这个项目的目标并非完全模仿，但是会更好地打磨一些细节，以优于现阶段最好的歌词播放器。

**—— AMLL 生态作品 ——**

[AMLL TTML DB 逐词歌词仓库](https://github.com/Steve-xmh/amll-ttml-db)
/
[AMLL TTML Tool 逐词歌词编辑器](https://github.com/Steve-xmh/amll-ttml-tool)

[引用了 AMLL 的项目汇总](https://github.com/Steve-xmh/applemusic-like-lyrics/discussions/397)

</div>

## AMLL 生态及源码结构

### 主要模块

-   [![AMLL-Core](https://img.shields.io/badge/Core-%233178c6?label=Apple%20Music-like%20Lyrics&labelColor=%23FB5C74)](./packages/core/README.md)：AMLL 核心组件库，以 DOM 原生方式编写，提供歌词显示组件和动态流体背景组件
-   [![AMLL-React](https://img.shields.io/badge/React-%23149eca?label=Apple%20Music-like%20Lyrics&labelColor=%23FB5C74)](./packages/react/README.md)：AMLL React 绑定，提供 React 组件形式的歌词显示组件和动态流体背景组件
-   [![AMLL-Vue](https://img.shields.io/badge/Vue-%2342d392?label=Apple%20Music-like%20Lyrics&labelColor=%23FB5C74)](./packages/vue/README.md)：AMLL Vue 绑定，提供 Vue 组件形式的歌词显示组件和动态流体背景组件
-   [![AMLL-Lyric](https://img.shields.io/badge/Lyric-%23FB8C84?label=Apple%20Music-like%20Lyrics&labelColor=%23FB5C74)](./packages/lyric/README.md)：AMLL 歌词解析模块，提供对 LyRiC, YRC, QRC, Lyricify Syllable 各种歌词格式的解析和序列化支持

### 外部工具

-   [AMLL Player](./packages/player/README.md)：AMLL 外置播放器，提供独立的外置歌词播放器，并通过独有的 WebSocket 协议与 AMLL 任意实现了协议的程序进行通信展示歌词。支持 `Meting-API` 参数配置，通过 URL 参数即可播放线上歌曲。
-   [AMLL TTML Tool](https://github.com/Steve-xmh/amll-ttml-tool)： AMLL TTML 编辑器，提供对 TTML 格式歌词的编辑支持，并使用 AMLL Core 进行实时预览
-   [AMLL TTML Database](https://github.com/Steve-xmh/amll-ttml-db)： AMLL TTML 数据库，提供 TTML 歌词存储仓库，以让各类歌词播放器可以使用由社区制作的 TTML 逐词歌词

## 浏览器兼容性提醒

本组件框架最低要求使用以下浏览器或更新版本：

-   Chromuim/Edge 91+
-   Firefox 100+
-   Safari 9.1+

完整呈现组件所有效果需要使用以下浏览器或更新版本：

-   Chromuim 120+
-   Firefox 100+
-   Safari 15.4+

参考链接：

-   [https://caniuse.com/mdn-css_properties_mask-image](https://caniuse.com/mdn-css_properties_mask-image)
-   [https://caniuse.com/mdn-css_properties_mix-blend-mode_plus-lighter](https://caniuse.com/mdn-css_properties_mix-blend-mode_plus-lighter)

## 性能配置参考

经过性能基准测试，五年内的主流 CPU 处理器均可以以 30FPS 正常带动歌词组件，但如果需要 60FPS 流畅运行，请确保 CPU 频率至少为 3.0Ghz 或以上。如果需要 144FPS 以上流畅运行，请确保 CPU 频率至少为 4.2Ghz 或以上。

GPU 性能在以下状况下能够以预期尺寸下满 60 帧运行：

-   `1080p (1920x1080)`: NVIDIA GTX 10 系列及以上
-   `2160p (3840x2160)`: NVIDIA RTX 2070 及以上

## 代码贡献

由于作者精力有限，已经无力处理大家使用过程中产生的问题，所以关闭了 Issues 板块，但是欢迎任何对代码有积极贡献的 Pull Request！

## AMLL Player 中 Meting API 集成

AMLL Player 现在支持通过 `Meting-Api` 服务，通过在启动页面的 URL 附加参数加载并播放第三方音乐平台的歌曲。 

使用方式（在启动后添加查询参数）：
```text
http://localhost:5173/?server=netease&type=song&id=35847388&api=http://127.0.0.1:3000/api
```

* `server`: 平台名称（例如：`netease`, `tencent`）
* `type`: 获取的资源类型（例如：`song`）
* `id`: 音乐平台的歌曲 ID
* `api`: 本地或远程 `Meting-Api` 服务的部署接口（需允许跨域访问）

## 开发/构建/打包流程

项目为 Monorepo，并使用了 `pnpm` 进行管理。请按照以下步骤搭建开发环境：

1. 安装所有依赖（如果你在国内，推荐使用 npmmirror 的源）：
```bash
npm install -g pnpm
pnpm install --registry=https://registry.npmmirror.com/
```

2. 构建公共依赖库：
```bash
pnpm run build:libs
```

3. 启动 `amll-player` 播放器的本地测试服务器：
```bash
cd packages/player
pnpm run dev
```

## 鸣谢

-   [woshizja/sound-processor](https://github.com/woshizja/sound-processor)
-   还有很多被 AMLL 使用的框架和库，非常感谢！

### 特别鸣谢

<div align="center">
<image src="https://resources.jetbrains.com/storage/products/company/brand/logos/jb_beam.svg"></image>
<div>
感谢 <a href=https://jb.gg/OpenSourceSupport>JetBrains</a> 系列开发工具为 AMLL 项目提供的大力支持
</div>
</div>
