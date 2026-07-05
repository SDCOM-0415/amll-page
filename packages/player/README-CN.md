# AMLL Player

[English](/packages/player/README.md) / 简体中文

一个独立的歌词页面播放器，可以通过本地音乐文件/ WebSocket Server 获取音频播放信息。

功能/特性列表：

- 与任何实现 AMLL WS 协议的客户端通信，同步播放进度，并获取相应的歌词进行播放显示
- 支持读取本地音频文件进行播放，或加载本地歌词文件
- 支持加载各种歌词格式
- 性能高，不会出现因为软件的问题导致影响歌词展示的情况
- 预计支持播放状态转移协议：[SMTC (Windows)](https://learn.microsoft.com/zh-cn/uwp/api/windows.media.systemmediatransportcontrols?view=winrt-26100) / [MPRIS (Linux/XDG)](https://www.freedesktop.org/wiki/Specifications/mpris-spec/) / [MPNowPlayingInfoCenter (macOS)](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter)

## Meting API 集成

AMLL Player 现在支持通过 `Meting-Api` 加载和播放第三方音乐平台歌曲。在应用启动后，你可以通过 URL 参数直接请求音频、歌词以及封面：

```text
http://localhost:5173/?server=netease&type=song&id=35847388&api=http://127.0.0.1:3000/api
```

参数说明：
- `server`: 音乐平台名称（例如 `netease`, `tencent` 等）
- `type`: 获取资源的类型（例如 `song`）
- `id`: 目标歌曲的 ID
- `api`: Meting-Api 服务端的完整 URL（注意处理 CORS 跨域问题）

## 安装与使用

由于该播放器仍在开发中，目前你可以通过源码进行构建和开发：

### 1. 安装依赖包 (推荐使用 pnpm 并在国内配置镜像源)
```bash
npx pnpm install --registry=https://registry.npmmirror.com/
```

### 2. 构建依赖库
因为这是一个 Monorepo 项目，需要预先构建相关的依赖组件：
```bash
npx pnpm run build:libs
```

### 3. 启动开发服务器
可以通过以下命令启动本地的 Vite 开发服务器：
```bash
cd packages/player
npx pnpm run dev
```

## 为什么有这个东西？

类似于外挂字幕一类的软件，这个歌词播放器可以将歌词放在一个独立于插件环境之外的地方播放。这带来了很多好处：可以利用浏览器生态实现更好的跨平台性，以及能够引入更多先进的技术来提高歌词效果的上限。

## 贡献

如果你想在修改代码的同时立即看到在桌面端上运行的效果，你可以将打包命令由原本的 `vite build` 更改为 `vite build --watch` ，Tauri 那边热重载会立刻呈现效果。
