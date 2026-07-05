 <img width="106" height="106" alt="logo" src="https://github.com/user-attachments/assets/d905bb3b-ad10-4e90-bb84-8f61d33ae5eb" />
 
# AMLL Player Web


##  使用说明

### 输入方式

1. **本地文件上传**
   - 音频文件
   - 歌词文件
   - 封面图片（可选）

2. **URL参数**
   ```
   ?music=音乐链接&lyric=歌词链接&cover=封面链接&title=歌曲名&artist=艺术家
   ```

## Meting API Integration in AMLL Player

AMLL Player now supports loading third-party music platform audio, lyrics, and covers via URL parameters from a `Meting-Api` server.

Usage (via query params on startup):
```text
http://localhost:5173/?server=netease&type=song&id=35847388&api=http://127.0.0.1:3000/api
```

* `server`: The music provider (e.g. `netease`, `tencent`)
* `type`: Resource type (e.g. `song`)
* `id`: The song ID
* `api`: Your Meting-Api deployment endpoint

### Build & Development Instructions

1. Install dependencies (we use `pnpm` workspace):
```bash
npm install -g pnpm
pnpm install
```
*(If you are in mainland China, use `pnpm install --registry=https://registry.npmmirror.com/`)*

2. Build the shared libraries:
```bash
pnpm run build:libs
```

3. Start the dev server for the player package:
```bash
cd packages/player
pnpm run dev
```

## 许可证

本项目采用AGPL许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 致谢

- [Steve-xmh/applemusic-like-lyrics](https://github.com/Steve-xmh/applemusic-like-lyrics)
- [apoint123/amll-page](https://github.com/apoint123/amll-page)

⭐ 如果这个项目对您有帮助，请给我一个星标！
