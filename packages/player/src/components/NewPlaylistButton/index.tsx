import { PlusIcon, Link2Icon } from "@radix-ui/react-icons";
import { Button, Dialog, Flex, Text, TextField, SegmentedControl, Box } from "@radix-ui/themes";
import { type FC, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { db, type Song } from "../../dexie.ts";
import { loadFileFromURL } from "../../utils/url-params.ts";

export const NewPlaylistButton: FC = () => {
	const [type, setType] = useState<"local" | "meting">("local");
	const [name, setName] = useState("");
	const [server, setServer] = useState("netease");
	const [playlistId, setPlaylistId] = useState("");
	const [apiUrl, setApiUrl] = useState("https://api.meting.icu/api");
	const [isSubmitting, setIsSubmitting] = useState(false);
	
	const { t } = useTranslation();

	const cannotCreate = useMemo(() => {
		if (type === "local") return name.trim().length === 0;
		return playlistId.trim().length === 0 || server.trim().length === 0;
	}, [type, name, playlistId, server]);

	const onAddPlaylist = async () => {
		if (cannotCreate) return;
		
		if (type === "local") {
			db.playlists.add({
				name,
				createTime: Date.now(),
				updateTime: Date.now(),
				playTime: 0,
				songIds: [],
			});
		} else {
			setIsSubmitting(true);
			const id = toast.loading(t("page.playlist.new.meting.loading", "正在获取歌单信息..."));
			try {
				const baseUrl = apiUrl.trim() || "https://api.meting.icu/api";
				const separator = baseUrl.includes("?") ? "&" : "?";
				const metingApiUrl = `${baseUrl}${separator}server=${server}&type=playlist&id=${playlistId.trim()}`;
				const response = await fetch(metingApiUrl);
				if (!response.ok) {
					throw new Error(`获取歌单失败: ${response.status}`);
				}
				const data = await response.json();
				if (!data || !Array.isArray(data) || data.length === 0) {
					throw new Error("歌单数据为空或不存在");
				}

				toast.update(id, { 
					render: t("page.playlist.new.meting.parsing", "正在解析并保存歌曲..."),
				});

				const validSongs: Song[] = [];
				const songIds: string[] = [];
				const now = Date.now();

				for (let i = 0; i < data.length; i++) {
					const songData = data[i];
					if (!songData.url) continue;

					const musicUrlHash = await crypto.subtle.digest(
						"SHA-256",
						new TextEncoder().encode(songData.url)
					);
					const hashArray = Array.from(new Uint8Array(musicUrlHash));
					const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
					const songId = `url-${hashHex.substring(0, 16)}`;

					// 使用空白Blob作为占位，因为实际播放时URLParamsHandler或者引擎应该支持URL
					const emptyBlob = new Blob([], { type: "audio/mpeg" });
					let coverBlob = new Blob([], { type: "image/png" });
					
					// 仅作基本信息的保存
					validSongs.push({
						id: songId,
						filePath: songData.url,
						songName: songData.title || "Unknown Title",
						songArtists: songData.author || "Unknown Artist",
						songAlbum: "Unknown Album",
						cover: coverBlob,
						file: emptyBlob,
						duration: 0, // Meting API doesn't always provide duration in list
						lyricFormat: "lrc",
						lyric: songData.lrc || "",
						addTime: now,
						accessTime: now,
					});
					songIds.push(songId);
					
					if (i % 20 === 0) {
						toast.update(id, { 
							render: t("page.playlist.new.meting.progress", "正在保存歌曲 ({current}/{total})", { current: i, total: data.length }) 
						});
					}
				}

				if (validSongs.length > 0) {
					await db.songs.bulkPut(validSongs);
				}

				await db.playlists.add({
					name: name.trim() || `Meting Playlist: ${playlistId}`,
					createTime: Date.now(),
					updateTime: Date.now(),
					playTime: 0,
					songIds,
				});
				
				toast.update(id, { render: t("page.playlist.new.meting.success", "添加成功"), type: "success", isLoading: false, autoClose: 2000 });
			} catch (error) {
				console.error("获取Meting歌单失败", error);
				toast.update(id, { render: `添加失败: ${error instanceof Error ? error.message : String(error)}`, type: "error", isLoading: false, autoClose: 3000 });
			} finally {
				setIsSubmitting(false);
			}
		}
	};

	return (
		<Dialog.Root>
			<Dialog.Trigger>
				<Button variant="soft">
					<PlusIcon />
					<Trans i18nKey="newPlaylist.buttonLabel">新建播放列表</Trans>
				</Button>
			</Dialog.Trigger>
			<Dialog.Content maxWidth="450px">
				<Dialog.Title>
					<Trans i18nKey="newPlaylist.dialog.title">新建歌单</Trans>
				</Dialog.Title>
				
				<Flex direction="column" mb="4">
					<SegmentedControl.Root value={type} onValueChange={(v: "local" | "meting") => setType(v)}>
						<SegmentedControl.Item value="local">
							<Trans i18nKey="newPlaylist.dialog.type.local">普通歌单</Trans>
						</SegmentedControl.Item>
						<SegmentedControl.Item value="meting">
							<Trans i18nKey="newPlaylist.dialog.type.meting">Meting API 导入</Trans>
						</SegmentedControl.Item>
					</SegmentedControl.Root>
				</Flex>

				<Flex gap="3" direction="column">
					{type === "local" ? (
						<>
							<Text>
								<Trans i18nKey="newPlaylist.dialog.name">歌单名称</Trans>
							</Text>
							<TextField.Root
								placeholder={t("newPlaylist.dialog.namePlaceholder", "歌单名称")}
								value={name}
								onChange={(e) => setName(e.currentTarget.value)}
								autoFocus
							/>
						</>
					) : (
						<>
							<Text>
								<Trans i18nKey="newPlaylist.dialog.metingServer">平台 (server)</Trans>
							</Text>
							<SegmentedControl.Root value={server} onValueChange={setServer}>
								<SegmentedControl.Item value="netease">Netease</SegmentedControl.Item>
								<SegmentedControl.Item value="tencent">Tencent</SegmentedControl.Item>
								<SegmentedControl.Item value="kugou">Kugou</SegmentedControl.Item>
								<SegmentedControl.Item value="bilibili">Bilibili</SegmentedControl.Item>
							</SegmentedControl.Root>

							<Text mt="2">
								<Trans i18nKey="newPlaylist.dialog.metingId">歌单 ID</Trans>
							</Text>
							<TextField.Root
								placeholder={t("newPlaylist.dialog.metingIdPlaceholder", "例如: 3778678")}
								value={playlistId}
								onChange={(e) => setPlaylistId(e.currentTarget.value)}
							/>
							
							<Text mt="2">
								<Trans i18nKey="newPlaylist.dialog.name">歌单名称</Trans>
								<Text size="1" color="gray" ml="2">(可选)</Text>
							</Text>
							<TextField.Root
								placeholder={t("newPlaylist.dialog.namePlaceholderOptional", "留空将使用默认名称")}
								value={name}
								onChange={(e) => setName(e.currentTarget.value)}
							/>

							<Text mt="2">
								<Trans i18nKey="newPlaylist.dialog.apiUrl">Meting API 地址</Trans>
							</Text>
							<TextField.Root
								placeholder="https://api.meting.icu/api"
								value={apiUrl}
								onChange={(e) => setApiUrl(e.currentTarget.value)}
							/>
						</>
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
						disabled={cannotCreate || isSubmitting}
						onClick={onAddPlaylist}
					>
						{isSubmitting ? (
							<Trans i18nKey="common.dialog.submitting">提交中...</Trans>
						) : (
							<Trans i18nKey="common.dialog.confirm">确认</Trans>
						)}
					</Button>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
