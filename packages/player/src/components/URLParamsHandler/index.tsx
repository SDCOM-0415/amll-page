import {
	AudioQualityType,
	isLyricPageOpenedAtom,
	musicArtistsAtom,
	musicCoverAtom,
	musicIdAtom,
	musicNameAtom,
	musicPlayingAtom,
	musicQualityAtom,
} from "@applemusic-like-lyrics/react-full";
import { useSetAtom, useStore } from "jotai";
import type { IAudioMetadata } from "music-metadata";
import { type FC, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { db, type Song } from "../../dexie.ts";
import {
	currentMusicIndexAtom,
	currentMusicQueueAtom,
	metingApiUrlAtom,
} from "../../states/appAtoms.ts";
import { audioPlayer } from "../../utils/ffmpeg-engine/FFmpegAudioPlayer";
import { extractMusicMetadata } from "../../utils/music-file.ts";
import { mapMetadataToQuality } from "../../utils/quality.ts";
import {
	hasMetingParams,
	hasURLParams,
	loadFileFromURL,
	parseURLParams,
} from "../../utils/url-params.ts";

/**
 * 根据URL或内容检测歌词格式
 */
function detectLyricFormat(url: string, content: string): string {
	// 根据URL扩展名判断
	const urlLower = url.toLowerCase();
	if (urlLower.endsWith(".ttml")) {
		return "ttml";
	}
	if (urlLower.endsWith(".lrc")) {
		return "lrc";
	}
	if (urlLower.endsWith(".yrc")) {
		return "yrc";
	}
	if (urlLower.endsWith(".qrc")) {
		return "qrc";
	}
	if (urlLower.endsWith(".lys")) {
		return "lys";
	}

	// 根据内容判断
	const contentTrimmed = content.trim();
	if (contentTrimmed.startsWith("<?xml") || contentTrimmed.includes("<tt")) {
		return "ttml";
	}
	if (contentTrimmed.includes("[") && contentTrimmed.includes("]")) {
		// 可能是LRC格式
		return "lrc";
	}

	// 默认返回lrc
	return "lrc";
}

/**
 * URL参数处理器组件
 * 处理URL参数，创建/更新歌曲，并打开歌词页面
 */
export const URLParamsHandler: FC = () => {
	const store = useStore();
	const setLyricPageOpened = useSetAtom(isLyricPageOpenedAtom);
	const processedRef = useRef(false);

	useEffect(() => {
		// 只处理一次
		if (processedRef.current) return;
		if (!hasURLParams() && !hasMetingParams()) return;

		processedRef.current = true;

		const handleURLParams = async () => {
			try {
				const params = parseURLParams();

				let musicUrl = params.music;
				let lyricUrl = params.lyric;
				let coverUrl = params.cover;
				let songName = params.title || "Unknown Title";
				let songArtists = params.artist || "Unknown Artist";

				// 如果是Meting-Api的参数
				if (params.server && params.type && params.id) {
					try {
						toast.info("正在从Meting API获取歌曲信息...");
						const savedMetingApi = store.get(metingApiUrlAtom);
						const targetApi = params.api || savedMetingApi;
						const metingApiUrl = `${targetApi}?server=${params.server}&type=${params.type}&id=${params.id}`;
						const response = await fetch(metingApiUrl);
						if (response.ok) {
							const data = await response.json();
							if (data && data.length > 0) {
								const songData = data[0];
								musicUrl = songData.url;
								lyricUrl = songData.lrc;
								coverUrl = songData.pic;
								songName = songData.title || songName;
								songArtists = songData.author || songArtists;
							} else {
								throw new Error("Meting API 返回数据为空");
							}
						} else {
							throw new Error(`Meting API 请求失败: ${response.status}`);
						}
					} catch (e) {
						console.error("Meting API获取失败", e);
						toast.error("Meting API获取失败");
						return;
					}
				}

				// 必须有音乐链接
				if (!musicUrl) {
					console.warn("URL参数中缺少music参数或无法从Meting获取");
					return;
				}

				// 生成歌曲ID（基于音乐URL的hash）
				const musicUrlHash = await crypto.subtle.digest(
					"SHA-256",
					new TextEncoder().encode(musicUrl),
				);
				const hashArray = Array.from(new Uint8Array(musicUrlHash));
				const hashHex = hashArray
					.map((b) => b.toString(16).padStart(2, "0"))
					.join("");
				const songId = `url-${hashHex.substring(0, 16)}`;

				// 加载音乐文件
				toast.info("正在加载音乐文件...");
				const musicBlob = await loadFileFromURL(musicUrl);

				// 加载封面文件（如果有）
				let coverBlob = new Blob([], { type: "image/png" });

				// 加载歌词文件（如果有）
				let lyricContent = "";
				let lyricFormat = "none";
				if (lyricUrl) {
					try {
						const lyricBlob = await loadFileFromURL(lyricUrl);
						lyricContent = await lyricBlob.text();
						lyricFormat = detectLyricFormat(lyricUrl, lyricContent);
					} catch (e) {
						console.warn("加载歌词失败", e);
					}
				}

				// 提取音乐元数据
				let songAlbum = "Unknown Album";
				let finalCover = coverBlob;
				let finalDuration = 0;
				let extractedLyric = "";
				let audioMetadata: IAudioMetadata | undefined;

				try {
					const extractedMetadata = await extractMusicMetadata(musicBlob);

					if (!params.title && !params.server && extractedMetadata.title) {
						songName = extractedMetadata.title;
					}
					if (!params.artist && !params.server && extractedMetadata.artist) {
						songArtists = extractedMetadata.artist;
					}
					if (extractedMetadata.album) {
						songAlbum = extractedMetadata.album;
					}
					if (finalCover.size === 0 && extractedMetadata.cover.size > 0) {
						finalCover = extractedMetadata.cover;
					}
					if (extractedMetadata.duration) {
						finalDuration = extractedMetadata.duration;
					}
					extractedLyric = extractedMetadata.lyric;
					audioMetadata = extractedMetadata.metadata;
				} catch (e) {
					console.warn("提取音乐元数据失败", e);
				}

				// 如果URL参数中有歌词，使用URL参数中的歌词
				if (lyricUrl && lyricContent) {
					// 使用从URL加载的歌词
				} else if (extractedLyric) {
					// 使用从音乐文件提取的歌词
					lyricContent = extractedLyric;
					lyricFormat = "lrc";
				}

				// 创建或更新歌曲
				const now = Date.now();
				const song: Song = {
					id: songId,
					filePath: musicUrl,
					songName,
					songArtists,
					songAlbum,
					cover: finalCover,
					coverUrl: coverUrl, // 懒加载封面 URL
					file: musicBlob,
					duration: finalDuration,
					lyricFormat,
					lyric: lyricContent,
					translatedLrc: "",
					romanLrc: "",
					addTime: now,
					accessTime: now,
				};

				await db.songs.put(song);

				// 设置播放器状态
				if (audioMetadata) {
					try {
						const qualityState = mapMetadataToQuality(audioMetadata);
						store.set(musicQualityAtom, qualityState);
					} catch (e) {
						console.warn("解析音频质量失败", e);
						store.set(musicQualityAtom, {
							type: AudioQualityType.None,
							codec: "Unknown",
							channels: 2,
							sampleRate: 44100,
							sampleFormat: "16-bit",
						});
					}
				} else {
					store.set(musicQualityAtom, {
						type: AudioQualityType.None,
						codec: "Unknown",
						channels: 2,
						sampleRate: 44100,
						sampleFormat: "16-bit",
					});
				}
				store.set(musicNameAtom, songName);
				store.set(
					musicArtistsAtom,
					songArtists.split(",").map((v) => ({ name: v.trim(), id: v.trim() })),
				);
				if (coverUrl) {
					store.set(musicCoverAtom, coverUrl);
				} else {
					store.set(musicCoverAtom, URL.createObjectURL(finalCover));
				}
				store.set(musicIdAtom, songId);

				// 设置播放队列
				store.set(currentMusicQueueAtom, [songId]);
				store.set(currentMusicIndexAtom, 0);

				// 加载并播放音乐
				const file = new File(
					[musicBlob],
					musicUrl.split("/").pop() || "music",
					{
						type: musicBlob.type || "audio/mpeg",
					},
				);
				await audioPlayer.load(file);
				await audioPlayer.play();
				store.set(musicPlayingAtom, true);

				// 打开歌词页面
				setLyricPageOpened(true);

				toast.success("音乐加载成功！");

				// 清除URL参数（可选）
				// window.history.replaceState({}, "", window.location.pathname);
			} catch (error) {
				console.error("处理URL参数失败", error);
				toast.error(
					`加载失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		};

		handleURLParams();
	}, [store, setLyricPageOpened]);

	return null;
};
