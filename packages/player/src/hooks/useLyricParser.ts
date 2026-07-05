import type { LyricLine as CoreLyricLine } from "@applemusic-like-lyrics/core";
import {
	type LyricLine,
	parseEslrc,
	parseLrc,
	parseLys,
	parseQrc,
	parseYrc,
} from "@applemusic-like-lyrics/lyric";
import chalk from "chalk";
import { useMemo } from "react";
import { parseTTML } from "../utils/parseTTML";

const LYRIC_LOG_TAG = chalk.bgHex("#FF4444").hex("#FFFFFF")(" LYRIC ");

type TransLine = {
	[K in keyof CoreLyricLine]: CoreLyricLine[K] extends string ? K : never;
}[keyof CoreLyricLine];

function pairLyric(line: LyricLine, lines: CoreLyricLine[], key: TransLine) {
	if (
		line.words
			.map((v) => v.word)
			.join("")
			.trim().length === 0
	)
		return;
	interface PairedLine {
		startTime: number;
		lineText: string;
		origIndex: number;
		original: CoreLyricLine;
	}
	const processed: PairedLine[] = lines.map((v, i) => ({
		startTime: Math.min(v.startTime, ...v.words.map((v) => v.startTime)),
		origIndex: i,
		lineText: v.words
			.map((v) => v.word)
			.join("")
			.trim(),
		original: v,
	}));
	let nearestLine: PairedLine | undefined;
	for (const coreLine of processed) {
		if (coreLine.lineText.length > 0) {
			if (coreLine.startTime === line.words[0].startTime) {
				nearestLine = coreLine;
				break;
			}
			if (
				nearestLine &&
				Math.abs(nearestLine.startTime - line.words[0].startTime) >
					Math.abs(coreLine.startTime - line.words[0].startTime)
			) {
				nearestLine = coreLine;
			} else if (nearestLine === undefined) {
				nearestLine = coreLine;
			}
		}
	}
	if (nearestLine) {
		const joined = line.words.map((w) => w.word).join("");
		if (nearestLine.original[key].length > 0)
			nearestLine.original[key] += joined;
		else nearestLine.original[key] = joined;
	}
}

interface LyricParserResult {
	lyricLines: LyricLine[];
	hasLyrics: boolean;
}

export const useLyricParser = (
	lyricStr?: string,
	format?: string,
	translatedLrc?: string,
	romanLrc?: string,
): LyricParserResult => {
	return useMemo(() => {
		if (!lyricStr || !format) {
			return { lyricLines: [], hasLyrics: false };
		}

		try {
			let parsedLyricLines: LyricLine[] = [];
			let actualFormat = format;
			let processLyricStr = lyricStr;

			// 如果是meting添加进来的空格式或者其他情况，我们尝试做一些简单的补救转换(fallback)
			// 其实meting默认将lrc格式传进来。如果在播放时依然解析失败或者格式不支持，我们可以尝试转换
			// 这里通过异常捕获来 fallback 转换格式，或者直接在这个时机处理不支持的格式

			try {
				switch (actualFormat) {
					case "lrc": {
						parsedLyricLines = parseLrc(processLyricStr);
						console.log(LYRIC_LOG_TAG, "解析出 LyRiC 歌词", parsedLyricLines);
						break;
					}
					case "eslrc": {
						parsedLyricLines = parseEslrc(processLyricStr);
						console.log(LYRIC_LOG_TAG, "解析出 ESLyRiC 歌词", parsedLyricLines);
						break;
					}
					case "yrc": {
						parsedLyricLines = parseYrc(processLyricStr);
						console.log(LYRIC_LOG_TAG, "解析出 YRC 歌词", parsedLyricLines);
						break;
					}
					case "qrc": {
						parsedLyricLines = parseQrc(processLyricStr);
						console.log(LYRIC_LOG_TAG, "解析出 QRC 歌词", parsedLyricLines);
						break;
					}
					case "lys": {
						parsedLyricLines = parseLys(processLyricStr);
						console.log(
							LYRIC_LOG_TAG,
							"解析出 Lyricify Syllable 歌词",
							parsedLyricLines,
						);
						break;
					}
					case "ttml": {
						parsedLyricLines = parseTTML(processLyricStr).lines;
						console.log(LYRIC_LOG_TAG, "解析出 TTML 歌词", parsedLyricLines);
						break;
					}
					default: {
						throw new Error(`Unsupported lyric format: ${actualFormat}`);
					}
				}
			} catch (formatErr) {
				console.warn(LYRIC_LOG_TAG, `按格式 ${actualFormat} 解析失败，尝试转换为标准 LRC`, formatErr);
				// 如果是未知的或无法解析的格式，尝试暴力清理文本并转换成标准的 lrc 格式，去除特殊标签等
				// 这里实现一个简单的后备策略：尝试从不可解析文本中提取带时间戳的行
				const fallbackLines = processLyricStr.split('\n');
				const lrcRegex = /\[\d{2,}:\d{2,}(?:\.\d+)?\]/;
				const cleanedLrcStr = fallbackLines.filter(line => lrcRegex.test(line)).join('\n');
				
				if (cleanedLrcStr) {
					parsedLyricLines = parseLrc(cleanedLrcStr);
					console.log(LYRIC_LOG_TAG, "已回退到清理后的 LRC 解析", parsedLyricLines);
				} else {
					// 实在无法提取时间戳的，作为无时间戳歌词展示或者丢弃
					console.warn(LYRIC_LOG_TAG, "无法从歌词中提取时间戳，解析失败");
					return { lyricLines: [], hasLyrics: false };
				}
			}

			const compatibleLyricLines: CoreLyricLine[] = parsedLyricLines.map(
				(line) => ({
					...line,
					words: line.words.map((word) => ({
						...word,
						obscene: false,
					})),
				}),
			);

			if (translatedLrc) {
				try {
					const translatedLyricLines = parseLrc(translatedLrc);
					for (const line of translatedLyricLines) {
						pairLyric(
							{
								...line,
								words: line.words.map((word) => ({
									...word,
									obscene: false,
								})),
							},
							compatibleLyricLines,
							"translatedLyric",
						);
					}
					console.log(LYRIC_LOG_TAG, "已匹配翻译歌词");
				} catch (err) {
					console.warn(LYRIC_LOG_TAG, "解析翻译歌词时出现错误", err);
				}
			}

			if (romanLrc) {
				try {
					const romanLyricLines = parseLrc(romanLrc);
					for (const line of romanLyricLines) {
						pairLyric(
							{
								...line,
								words: line.words.map((word) => ({
									...word,
									obscene: false,
								})),
							},
							compatibleLyricLines,
							"romanLyric",
						);
					}
					console.log(LYRIC_LOG_TAG, "已匹配音译歌词");
				} catch (err) {
					console.warn(LYRIC_LOG_TAG, "解析音译歌词时出现错误", err);
				}
			}

			const processedLines: CoreLyricLine[] = compatibleLyricLines;
			return {
				lyricLines: processedLines,
				hasLyrics: processedLines.length > 0,
			};
		} catch (e) {
			console.warn("解析歌词时出现错误", e);
			return { lyricLines: [], hasLyrics: false };
		}
	}, [lyricStr, format, translatedLrc, romanLrc]);
};
