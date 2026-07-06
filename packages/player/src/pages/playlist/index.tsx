import {
	ArrowLeftIcon,
	Pencil1Icon,
	PlayIcon,
	PlusIcon,
	ReloadIcon,
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
	Dialog,
	SegmentedControl,
	Select,
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

const METING_API_PRESETS = [
	{
		value: "meting",
		label: "meting.sdcom.top",
		url: "https://meting.sdcom.top/api",
	},
	{
		value: "meting-backup",
		label: "meting-backup.sdcom.top",
		url: "https://meting-backup.sdcom.top/api",
	},
	{
		value: "api-meting",
		label: "api.meting.icu",
		url: "https://api.meting.icu/api",
	},
] as const;

function normalizeApiUrl(input: string): string {
	let url = input.trim();
	if (!url) return METING_API_PRESETS[0].url;
	if (!url.startsWith("http://") && !url.startsWith("https://")) {
		url = `https://${url}`;
	}
	try {
		const parsed = new URL(url);
		if (parsed.pathname === "/" || parsed.pathname === "") {
			parsed.pathname = "/api";
		}
		return parsed.toString().replace(/\/$/, "");
	} catch {
		return url;
	}
}

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

	const [addMetingDialogOpen, setAddMetingDialogOpen] = useState(false);
	const [metingServer, setMetingServer] = useState("netease");
	const [metingMusicId, setMetingMusicId] = useState("");
	const [apiSource, setApiSource] = useState("meting");
	const [customApiUrl, setCustomApiUrl] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const cannotCreateMetingMusic = useMemo(() => {
		return (
			metingMusicId.trim().length === 0 || metingServer.trim().length === 0
		);
	}, [metingMusicId, metingServer]);

	const onAddMetingMusic = useCallback(async () => {
		if (cannotCreateMetingMusic) return;

		const toastId = toast.loading(
			t("page.playlist.addMeting.loading", "正在获取并解析 Meting 歌曲..."),
		);
		setIsSubmitting(true);

		try {
			const preset = METING_API_PRESETS.find((p) => p.value === apiSource);
			const resolvedApiUrl = preset
				? preset.url
				: normalizeApiUrl(customApiUrl);

			const separator = resolvedApiUrl.includes("?") ? "&" : "?";
			const metingApiUrl = `${resolvedApiUrl}${separator}server=${metingServer}&type=song&id=${metingMusicId.trim()}`;
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
				new TextEncoder().encode(songData.url),
			);
			const hashArray = Array.from(new Uint8Array(musicUrlHash));
			const hashHex = hashArray
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
			const songId = `url-${hashHex.substring(0, 16)}`;

			const emptyBlob = new Blob([], { type: "audio/mpeg" });
			const coverBlob = new Blob([], { type: "image/png" });

			const now = Date.now();
			const song: Song = {
				id: songId,
				filePath: songData.url,
				songName: songData.title || "Unknown Title",
				songArtists: songData.author || "Unknown Artist",
				songAlbum: "Unknown Album",
				cover: coverBlob,
				coverUrl: songData.pic, // 使用在线 URL 懒加载封面
				file: emptyBlob,
				duration: 0,
				lyricFormat: songData.lrc ? "lrc" : "",
				lyric: songData.lrc || "",
				addTime: now,
				accessTime: now,
			};

			// 将音频的远程 URL 存入 tempAudioStore，以便在播放时使用
			const { tempAudioStore } = await import("../../states/tempAudioStore.ts");
			tempAudioStore.set(songId, songData.url);

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
				render: `添加失败，请尝试切换其他 Meting API 地址重试: ${error instanceof Error ? error.message : String(error)}`,
				type: "error",
				isLoading: false,
				autoClose: 3000,
			});
		}
	}, [playlist, param.id, t]);

	const isMetingPlaylist = !!(
		playlist?.metingServer && playlist?.metingPlaylistId
	);

	const onRefreshPlaylist = useCallback(async () => {
		if (isMetingPlaylist) {
			// Meting 歌单刷新逻辑
			const toastId = toast.loading("正在刷新 Meting 歌单...");
			try {
				const baseUrl =
					playlist.metingApiUrl?.trim() || "https://api.meting.icu/api";
				const separator = baseUrl.includes("?") ? "&" : "?";
				const metingApiUrl = `${baseUrl}${separator}server=${playlist.metingServer}&type=playlist&id=${playlist.metingPlaylistId}`;
				const response = await fetch(metingApiUrl);
				if (!response.ok) {
					throw new Error(`请求失败: ${response.status}`);
				}
				const data = await response.json();
				if (!data || !Array.isArray(data) || data.length === 0) {
					throw new Error("歌单数据为空或不存在");
				}

				const { tempAudioStore } = await import("../../states/tempAudioStore.ts");

				const validSongs: Song[] = [];
				const songIds: string[] = [];
				const now = Date.now();

				for (const songData of data) {
					if (!songData.url) continue;

					const musicUrlHash = await crypto.subtle.digest(
						"SHA-256",
						new TextEncoder().encode(songData.url),
					);
					const hashArray = Array.from(new Uint8Array(musicUrlHash));
					const hashHex = hashArray
						.map((b) => b.toString(16).padStart(2, "0"))
						.join("");
					const songId = `url-${hashHex.substring(0, 16)}`;

					tempAudioStore.set(songId, songData.url);

					const existing = await db.songs.get(songId);
					if (!existing) {
						const emptyBlob = new Blob([], { type: "audio/mpeg" });
						const coverBlob = new Blob([], { type: "image/png" });
						validSongs.push({
							id: songId,
							filePath: songData.url,
							songName: songData.title || "Unknown Title",
							songArtists: songData.author || "Unknown Artist",
							songAlbum: "Unknown Album",
							cover: coverBlob,
							coverUrl: songData.pic,
							file: emptyBlob,
							duration: 0,
							lyricFormat: songData.lrc ? "lrc" : "",
							lyric: songData.lrc || "",
							addTime: now,
							accessTime: now,
						});
					} else {
						await db.songs.update(songId, {
							filePath: songData.url,
							coverUrl: songData.pic,
							accessTime: now,
						});
					}
					songIds.push(songId);
				}

				if (validSongs.length > 0) {
					await db.songs.bulkPut(validSongs);
				}

				await db.playlists.update(Number(param.id), (obj) => {
					obj.songIds = songIds;
					obj.updateTime = Date.now();
				});

				toast.update(toastId, {
					render: `刷新成功，共 ${songIds.length} 首歌曲${validSongs.length > 0 ? `（新增 ${validSongs.length} 首）` : ""}`,
					type: "success",
					isLoading: false,
					autoClose: 2000,
				});
			} catch (error) {
				console.error("刷新 Meting 歌单失败", error);
				toast.update(toastId, {
					render: `刷新失败: ${error instanceof Error ? error.message : String(error)}`,
					type: "error",
					isLoading: false,
					autoClose: 3000,
				});
			}
		} else {
			// 普通歌单的刷新逻辑，其实本地歌单不需要重新请求网络接口，
			// 但是为了让用户有反馈，我们更新一下 updateTime 或重新检查一遍存在的歌曲（清理无效本地文件）
			// 这里作为简单的本地刷新动作：
			const toastId = toast.loading("正在刷新歌单...");
			try {
				if (!playlist?.songIds) {
					throw new Error("歌单数据为空");
				}
				
				// 例如：验证本地歌曲是否还存在等操作，这里只是一个示例逻辑
				// 我们可以简单地更新时间戳
				await db.playlists.update(Number(param.id), (obj) => {
					obj.updateTime = Date.now();
				});

				toast.update(toastId, {
					render: "刷新成功",
					type: "success",
					isLoading: false,
					autoClose: 1000,
				});
			} catch (error) {
				console.error("刷新歌单失败", error);
				toast.update(toastId, {
					render: `刷新失败: ${error instanceof Error ? error.message : String(error)}`,
					type: "error",
					isLoading: false,
					autoClose: 3000,
				});
			}
		}
	}, [playlist, param.id, isMetingPlaylist]);

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
									<Button
										variant="soft"
										onClick={() => setAddMetingDialogOpen(true)}
									>
										<PlusIcon />
										<Trans i18nKey="page.playlist.addLocalMusic.label">
									添加 Meting 歌曲
								</Trans>
							</Button>
									<Button variant="soft" onClick={onRefreshPlaylist}>
										<ReloadIcon />
										刷新歌单
									</Button>
								</Flex>
							</motion.div>
						</Flex>
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
								<IconButton
									variant="soft"
									onClick={() => setAddMetingDialogOpen(true)}
								>
									<PlusIcon />
								</IconButton>
								<IconButton variant="soft" onClick={onRefreshPlaylist}>
									<ReloadIcon />
								</IconButton>
							</Flex>
						</motion.div>
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

			<Dialog.Root
				open={addMetingDialogOpen}
				onOpenChange={setAddMetingDialogOpen}
			>
				<Dialog.Content maxWidth="450px">
					<Dialog.Title>
						<Trans i18nKey="page.playlist.addLocalMusic.label">
							添加 Meting 歌曲
						</Trans>
					</Dialog.Title>

					<Flex gap="3" direction="column">
						<Text>
							<Trans i18nKey="newPlaylist.dialog.title">
								平台 (server)
							</Trans>
						</Text>
						<SegmentedControl.Root
							value={metingServer}
							onValueChange={setMetingServer}
						>
							<SegmentedControl.Item value="netease">
								Netease
							</SegmentedControl.Item>
							<SegmentedControl.Item value="tencent">
								Tencent
							</SegmentedControl.Item>
							<SegmentedControl.Item value="kugou">Kugou</SegmentedControl.Item>
							<SegmentedControl.Item value="bilibili">
								Bilibili
							</SegmentedControl.Item>
						</SegmentedControl.Root>

						<Text mt="2">
							<Trans i18nKey="page.playlist.addLocalMusic.label">歌曲 ID</Trans>
						</Text>
						<TextField.Root
							placeholder={t(
								"page.playlist.addLocalMusic.label",
								"例如: 3349444601",
							)}
							value={metingMusicId}
							onChange={(e) => setMetingMusicId(e.currentTarget.value)}
							autoFocus
						/>

						<Text mt="2">
							<Trans i18nKey="newPlaylist.dialog.title">Meting API 地址</Trans>
						</Text>
						<Select.Root value={apiSource} onValueChange={setApiSource}>
							<Select.Trigger />
							<Select.Content>
								{METING_API_PRESETS.map((preset) => (
									<Select.Item key={preset.value} value={preset.value}>
										{preset.label}
									</Select.Item>
								))}
								<Select.Item value="custom">自定义</Select.Item>
							</Select.Content>
						</Select.Root>
						{apiSource === "custom" && (
							<TextField.Root
								placeholder="api.meting.icu (自动补全)"
								value={customApiUrl}
								onChange={(e) => setCustomApiUrl(e.currentTarget.value)}
							/>
						)}
					</Flex>

					<Flex gap="3" mt="4" justify="end">
						<Dialog.Close>
							<Button type="button" variant="soft" color="gray">
								<Trans i18nKey="common.dialog.cancel">取消</Trans>
							</Button>
						</Dialog.Close>
						<Button
							type="submit"
							disabled={cannotCreateMetingMusic || isSubmitting}
							onClick={onAddMetingMusic}
						>
							{isSubmitting ? (
								<Trans i18nKey="page.playlist.addMetingMusic.submitting">提交中...</Trans>
							) : (
								<Trans i18nKey="common.dialog.confirm">添加</Trans>
							)}
						</Button>
					</Flex>
				</Dialog.Content>
			</Dialog.Root>
		</PageContainer>
	);
};

Component.displayName = "PlaylistPage";

export default Component;
