<script lang="ts">
	import type { DriveItem } from '../onedrive/types';

	let { item, size = 'list' }: { item: DriveItem; size?: 'list' | 'grid' } = $props();
	let failedUrl = $state('');

	function safeUrl(url?: string): string {
		if (!url) return '';
		try {
			return new URL(url).protocol === 'https:' ? url : '';
		} catch {
			return '';
		}
	}

	const thumbnailUrl = $derived(safeUrl(
		size === 'grid'
			? item.thumbnails?.[0]?.medium?.url ?? item.thumbnails?.[0]?.small?.url
			: item.thumbnails?.[0]?.small?.url ?? item.thumbnails?.[0]?.medium?.url
	));
	const isFolder = $derived(Boolean(item.folder || item.package));
</script>

<span class="thumbnail" class:thumbnail-list={size === 'list'} class:thumbnail-grid={size === 'grid'} class:folder-thumbnail={isFolder} aria-hidden="true">
	{#if thumbnailUrl && failedUrl !== thumbnailUrl}
		<img
			src={thumbnailUrl}
			alt=""
			loading="lazy"
			decoding="async"
			referrerpolicy="no-referrer"
			draggable="false"
			onerror={() => (failedUrl = thumbnailUrl)}
		/>
	{:else}
		<span class="fallback-icon">{isFolder ? '▰' : '▤'}</span>
	{/if}
</span>

<style>
	.thumbnail { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 6px; background: #f2f4f7; color: #667085; }
	.thumbnail-list { width: 32px; height: 28px; }
	.thumbnail-grid { width: 100%; aspect-ratio: 4 / 3; border-radius: 7px; }
	.folder-thumbnail { background: #eff6ff; color: #175cd3; }
	.thumbnail img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.fallback-icon { font-size: 13px; }
	.thumbnail-grid .fallback-icon { font-size: 30px; }
</style>
