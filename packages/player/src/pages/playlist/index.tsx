import {
	ArrowLeftIcon,
	Pencil1Icon,
	PlayIcon,
	PlusIcon,
} from "@radix-ui/react-icons";
import {
	Box,
	Button,
	ContextMenu,
	Flex,
	Heading,
	IconButton,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, useMotionTemplate, useScroll } from "framer-motion";
import { useAtomValue, useSetAtom } from "jotai";
import md5 from "md5";
import { type FC, useCallback, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { ViewportList } from "react-viewport-list";
import { PageContainer } from "../../components/PageContainer/index.tsx";
import { PlaylistCover } from "../../components/PlaylistCover/index.tsx";
import { PlaylistSongCard } from "../../components/PlaylistSongCard/index.tsx";
import { db, type Song } from "../../dexie.ts";
import {
	currentMusicQueueAtom,
	onRequestPlaySongByIndexAtom,
} from "../../states/appAtoms.ts";
import { extractMusicMetadata } from "../../utils/music-file.ts";
import styles from "./index.module.css";

export type Loadable<Value> =
	| {
			state: "loading";
	  }
	| {
			state: "hasError";
			error: unknown;
	  }
	| {
			state: "hasData";
			data: Awaited<Value>;
	  };

const EditablePlaylistName: FC<{
	playlistName: string;
	onPlaylistNameChange: (newName: string) => void;
}> = ({ playlistName, onPlaylistNameChange }) => {
	const [editing, setEditing] = useState(false);
	const [newName, setNewName] = useState(playlistName);

	return (
		<Heading className={styles.title}>
			{!editing && playlistName}
			{!editing && (
				<IconButton
					ml="2"
					style={{
						verticalAlign: "middle",
					}}
					size="1"
					variant="ghost"
					onClick={() => {
						setNewName(playlistName);
						setEditing(true);
					}}
				>
					<Pencil1Icon />
				</IconButton>
			)}
			{editing && (
				<TextField.Root
					value={newName}
					autoFocus
					onChange={(e) => setNewName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							if (newName !== playlistName) onPlaylistNameChange(newName);
							setEditing(false);
						}
					}}
					onBlur={() => {
						if (newName !== playlistName) onPlaylistNameChange(newName);
						setEditing(false);
					}}
				/>
			)}
		</Heading>
	);
};

// 我们编译的 FFmpeg 所支持的文件格式
const SUPPORTED_AUDIO_EXTENSIONS = [
	".mp3",
	".flac",
	".wav",
	".aac",
	".m4a",
	".ogg",
	".opus",
	".wma",
	".ape",
	".wv",
	".alac",
	".aiff",
	".aif",
	".dsf",
	".dff",
	".mpc",
	".tak",
	".tta",
	".ac3",
	".dts",
	".thd",
	".truehd",
	".mka",
	".mkv",
	".mp4",
	".m4v",
	".mov",
	".webm",
	".asf",
	".amr",
	".au",
	".ra",
	".rm",
	".3gp",
].join(",");

export const Component: FC = () => {
	const param = useParams();
	const playlist = useLiveQuery(() => db.playlists.get(Number(param.id)));
	const { t } = useTranslation();
	const playlistViewRef = useRef<HTMLDivElement>(null);
	const playlistViewScroll = useScroll({
		container: playlistViewRef,
	});
	const playlistCoverSize = useMotionTemplate`clamp(6em,calc(12em - ${playlistViewScroll.scrollY}px),12em)`;
	const playlistInfoGapSize = useMotionTemplate`clamp(var(--space-1), calc(var(--space-4) - ${playlistViewScroll.scrollY}px / 5), var(--space-4))`;

	const setQueue = useSetAtom(currentMusicQueueAtom);
	const playSongByIndex = useAtomValue(onRequestPlaySongByIndexAtom).onEmit;

	const onAddMetingMusic = useCallback(async () => {
		const server = prompt(t("page.playlist.addMeting.server", "请输入平台 (netease/tencent/kugou/bilibili)"), "netease");
		if (!server) return;
		const id = prompt(t("page.playlist.addMeting.id", "请输入歌曲 ID"));
		if (!id) return;

		const toastId = toast.loading(t("page.playlist.addMeting.loading", "正在获取并解析 Meting 歌曲..."));

		try {
			const metingApiUrl = `https://api.meting.icu/api?server=${server}&type=song&id=${id}`;
			const response = await fetch(metingApiUrl);
			if (!response.ok) {
				throw new Error(`请求失败: ${response.status}`);
			}
			const data = await response.json();
			if (!data || !Array.isArray(data) || data.length === 0) {
				throw new Error("歌曲数据为空");
			}

			const songData = data[0];
			if (!songData.url) throw new Error("无法获取歌曲音频地址");

			const musicUrlHash = await crypto.subtle.digest(
				"SHA-256",
				new TextEncoder().encode(songData.url)
			);
			const hashArray = Array.from(new Uint8Array(musicUrlHash));
			const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
			const songId = `url-${hashHex.substring(0, 16)}`;

			const now = Date.now();
			const song: Song = {
				id: songId,
				filePath: songData.url,
				songName: songData.title || "Unknown Title",
				songArtists: songData.author || "Unknown Artist",
				songAlbum: "Unknown Album",
				cover: new Blob([], { type: "image/png" }),
				file: new Blob([], { type: "audio/mpeg" }),
				duration: 0,
				lyricFormat: "lrc",
				lyric: songData.lrc || "",
				addTime: now,
				accessTime: now,
			};

			await db.songs.put(song);
			
			if (!playlist?.songIds.includes(songId)) {
				await db.playlists.update(Number(param.id), (obj) => {
					obj.songIds.unshift(songId);
				});
			}

			toast.update(toastId, {
				render: t("page.playlist.addMeting.success", "Meting 歌曲添加成功"),
				type: "success",
				isLoading: false,
				autoClose: 2000,
			});
		} catch (error) {
			console.error("添加 Meting 歌曲失败", error);
			toast.update(toastId, {
				render: `添加失败: ${error instanceof Error ? error.message : String(error)}`,
				type: "error",
				isLoading: false,
				autoClose: 3000,
			});
		}
	}, [playlist, param.id, t]);

	const onAddLocalMusics = useCallback(async () => {
		const input = document.createElement("input");
		input.type = "file";
		input.multiple = true;
		input.accept = SUPPORTED_AUDIO_EXTENSIONS;
		input.onchange = async () => {
			const files = Array.from(input.files || []);
			if (files.length === 0) return;

			const id = toast.loading(
				t(
					"page.playlist.addLocalMusic.toast.parsingMusicMetadata",
					"正在解析音乐元数据以添加歌曲 ({current, plural, other {#}} / {total, plural, other {#}})",
					{
						current: 0,
						total: files.length,
					},
				),
			);

			let current = 0;
			let success = 0;
			let errored = 0;

			const transformed = await Promise.all(
				files.map(async (file): Promise<Song | null> => {
					try {
						const extracted = await extractMusicMetadata(file);

						const pathMd5 = md5(file.name + file.size);

						success += 1;
						const now = Date.now();
						return {
							id: pathMd5,
							filePath: file.name,
							songName: extracted.title || file.name,
							songArtists: extracted.artist,
							songAlbum: extracted.album,
							lyricFormat: extracted.lyric ? "lrc" : "",
							lyric: extracted.lyric,
							cover: extracted.cover,
							file: file,
							duration: extracted.duration,
							addTime: now,
							accessTime: now,
						};
					} catch (err) {
						errored += 1;
						console.warn("解析歌曲元数据以添加歌曲失败", file.name, err);
						return null;
					} finally {
						current += 1;
						toast.update(id, {
							render: t(
								"page.playlist.addLocalMusic.toast.parsingMusicMetadata",
								"正在解析音乐元数据以添加歌曲 ({current, plural, other {#}} / {total, plural, other {#}})",
								{
									current: current,
									total: files.length,
								},
							),
							progress: current / files.length,
						});
					}
				}),
			);

			const validSongs = transformed.filter((v): v is Song => v !== null);

			await db.songs.bulkPut(validSongs);
			const shouldAddIds = validSongs
				.map((v) => v.id)
				.filter((v) => !playlist?.songIds.includes(v))
				.reverse();
			await db.playlists.update(Number(param.id), (obj) => {
				obj.songIds.unshift(...shouldAddIds);
			});
			toast.done(id);
			if (errored > 0 && success > 0) {
				toast.warn(
					t(
						"page.playlist.addLocalMusic.toast.partiallyFailed",
						"已添加 {succeed, plural, other {#}} 首歌曲，其中 {errored, plural, other {#}} 首歌曲添加失败",
						{
							succeed: success,
							errored,
						},
					),
				);
			} else if (success === 0) {
				toast.error(
					t(
						"page.playlist.addLocalMusic.toast.allFailed",
						"{errored, plural, other {#}} 首歌曲添加失败",
						{
							errored,
						},
					),
				);
			} else {
				toast.success(
					t(
						"page.playlist.addLocalMusic.toast.success",
						"已全部添加 {count, plural, other {#}} 首歌曲",
						{
							count: success,
						},
					),
				);
			}
		};
		input.click();
	}, [playlist, param.id, t]);

	const onPlayList = useCallback(
		async (songIndex = 0) => {
			if (playlist === undefined) return;
			const songId = playlist.songIds[songIndex];
			if (!songId) return;
			setQueue(playlist.songIds);

			playSongByIndex(songIndex);
		},
		[playlist, setQueue, playSongByIndex],
	);

	const onDeleteSong = useCallback(
		async (songId: string) => {
			if (playlist === undefined) return;
			await db.playlists.update(Number(param.id), (obj) => {
				obj.songIds = obj.songIds.filter((v) => v !== songId);
			});
		},
		[playlist, param.id],
	);

	const onPlaylistDefault = useCallback(onPlayList.bind(null, 0), [onPlayList]);
	const onPlaylistShuffle = useMemo(
		() => () => {
			/* TODO */
		},
		[],
	);

	return (
		<PageContainer>
			<Flex direction="column" height="100%">
				<Flex gap="4" direction="column" flexGrow="0" pb="4" mt="5">
					<Flex align="end" pt="4">
						<Button variant="soft" onClick={() => history.back()}>
							<ArrowLeftIcon />
							<Trans i18nKey="common.page.back">返回</Trans>
						</Button>
					</Flex>
					<Flex align="end" gap="3">
						<motion.div
							style={{
								width: playlistCoverSize,
							}}
						>
							<ContextMenu.Root>
								<ContextMenu.Trigger>
									<PlaylistCover
										playlistId={Number(param.id)}
										style={{
											width: "100%",
										}}
									/>
								</ContextMenu.Trigger>
								<ContextMenu.Content>
									<ContextMenu.Item
										onClick={() => {
											db.playlists.update(Number(param.id), (obj) => {
												obj.playlistCover = undefined;
											});
										}}
									>
										<Trans i18nKey="page.playlist.cover.changeCoverToAuto">
											更换成自动封面
										</Trans>
									</ContextMenu.Item>
									<ContextMenu.Item
										onClick={() => {
											const inputEl = document.createElement("input");
											inputEl.type = "file";
											inputEl.accept = "image/*";
											inputEl.addEventListener(
												"change",
												() => {
													const file = inputEl.files?.[0];
													if (!file) return;
													db.playlists.update(Number(param.id), (obj) => {
														obj.playlistCover = file;
													});
												},
												{
													once: true,
												},
											);
											inputEl.click();
										}}
									>
										<Trans i18nKey="page.playlist.cover.uploadCoverImage">
											上传封面图片
										</Trans>
									</ContextMenu.Item>
								</ContextMenu.Content>
							</ContextMenu.Root>
						</motion.div>
						<Flex
							direction="column"
							display={{
								initial: "none",
								sm: "flex",
							}}
							gap={playlistInfoGapSize.get()}
							asChild
						>
							<motion.div
								style={{
									gap: playlistInfoGapSize,
								}}
							>
								<EditablePlaylistName
									playlistName={playlist?.name || ""}
									onPlaylistNameChange={(newName) =>
										db.playlists.update(Number(param.id), (obj) => {
											obj.name = newName;
										})
									}
								/>
								<Text>
									{t(
										"page.playlist.totalMusicLabel",
										"{count, plural, other {#}} 首歌曲",
										{
											count: playlist?.songIds?.length || 0,
										},
									)}
								</Text>
								<Flex gap="2">
									<Button onClick={() => onPlaylistDefault()}>
										<PlayIcon />
										<Trans i18nKey="page.playlist.playAll">播放全部</Trans>
									</Button>
									<Button variant="soft" onClick={onPlaylistShuffle}>
										<Trans i18nKey="page.playlist.shufflePlayAll">
											随机播放
										</Trans>
									</Button>
									<Button variant="soft" onClick={onAddLocalMusics}>
										<PlusIcon />
										<Trans i18nKey="page.playlist.addLocalMusic.label">
											添加本地歌曲
										</Trans>
									</Button>
									<Button variant="soft" onClick={onAddMetingMusic}>
										<PlusIcon />
										<Trans i18nKey="page.playlist.addMetingMusic.label">
											添加 Meting 歌曲
										</Trans>
									</Button>
								</Flex>
							</motion.div>
						</Flex>
						<Flex
							direction="column"
							display={{
								xs: "flex",
								sm: "none",
							}}
							asChild
						>
							<motion.div
								style={{
									gap: playlistInfoGapSize,
								}}
							>
								<EditablePlaylistName
									playlistName={playlist?.name || ""}
									onPlaylistNameChange={(newName) =>
										db.playlists.update(Number(param.id), (obj) => {
											obj.name = newName;
										})
									}
								/>
								<Text>
									{t(
										"page.playlist.totalMusicLabel",
										"{count, plural, other {#}} 首歌曲",
										{
											count: playlist?.songIds?.length || 0,
										},
									)}
								</Text>
								<Flex gap="2">
									<IconButton onClick={() => onPlaylistDefault()}>
										<PlayIcon />
									</IconButton>
									<IconButton variant="soft" onClick={onAddLocalMusics}>
										<PlusIcon />
									</IconButton>
									<IconButton variant="soft" onClick={onAddMetingMusic}>
										<PlusIcon />
									</IconButton>
								</Flex>
							</motion.div>
						</Flex>
					</Flex>
				</Flex>
				<Box
					flexGrow="1"
					overflowY="auto"
					minHeight="0"
					pb="4"
					ref={playlistViewRef}
				>
					{playlist?.songIds && (
						<ViewportList
							items={playlist.songIds}
							viewportRef={playlistViewRef}
						>
							{(songId, index) => (
								<PlaylistSongCard
									key={`playlist-song-card-${songId}`}
									songId={songId}
									songIndex={index}
									onPlayList={onPlayList}
									onDeleteSong={onDeleteSong}
								/>
							)}
						</ViewportList>
					)}
				</Box>
			</Flex>
		</PageContainer>
	);
};

Component.displayName = "PlaylistPage";

export default Component;
