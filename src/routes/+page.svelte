<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { DownloadProgress } from '../lib/download/archive';
	import ItemThumbnail from '../lib/components/ItemThumbnail.svelte';
	import { formatBytes, formatDate } from '../lib/format';
	import { OneDriveClient } from '../lib/onedrive/client';
	import type { OneDriveAuth } from '../lib/onedrive/auth';
	import type { Breadcrumb, DriveAccount, DriveItem } from '../lib/onedrive/types';

	type AuthState = 'loading' | 'ready' | 'unconfigured' | 'error';
	type JobState = 'idle' | 'running' | 'ready' | 'done' | 'error' | 'cancelled';

	let authState = $state<AuthState>('loading');
	let authError = $state('');
	let auth: OneDriveAuth | undefined;
	const driveClients = new Map<string, OneDriveClient>();
	let accounts = $state<DriveAccount[]>([]);
	let activeAccountId = $state('');
	let items = $state<DriveItem[]>([]);
	let folderStack = $state<Breadcrumb[]>([{ id: '', name: 'My files' }]);
	let selectedIds = $state<string[]>([]);
	let isListing = $state(false);
	let viewMode = $state<'list' | 'grid'>('list');
	let listingError = $state('');
	let jobState = $state<JobState>('idle');
	let jobProgress = $state<DownloadProgress | undefined>();
	let jobMessage = $state('');
	let jobFailures = $state<string[]>([]);
	let readyDownloadUrl = $state('');
	let readyDownloadName = $state('');
	let activeJobController: AbortController | undefined;

	const selectedItems = $derived(items.filter((item) => selectedIds.includes(item.id)));
	const allSelected = $derived(items.length > 0 && selectedIds.length === items.length);
	const sortedItems = $derived([...items].sort((a, b) => {
		if (a.folder && !b.folder) return -1;
		if (!a.folder && b.folder) return 1;
		return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
	}));
	const fixtureAccount: DriveAccount = {
		homeAccountId: 'dev-fixture-account',
		localAccountId: 'dev-fixture-account',
		username: 'fixture@example.test',
		name: 'Drive UI fixture'
	};
	const fixtureItems: Record<string, DriveItem[]> = {
		root: [
			{
				id: 'fixture-documents',
				name: 'Documents',
				folder: { childCount: 4 },
				thumbnails: [{
					small: { url: 'https://thumbnail.example.test/documents-small.png' },
					medium: { url: 'https://thumbnail.example.test/documents-medium.png' }
				}]
			},
			{ id: 'fixture-budget', name: 'Budget.xlsx', size: 24_000, file: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } }
		],
		'fixture-documents': [
			{ id: 'fixture-notes', name: 'Invoices and notes', folder: { childCount: 1 } },
			{ id: 'fixture-readme', name: 'Readme.pdf', size: 8_000, file: { mimeType: 'application/pdf' } }
		]
	};

	function isDriveListFixture(): boolean {
		return import.meta.env.DEV && new URLSearchParams(window.location.search).get('fixture') === 'drive-list';
	}

	onMount(() => {
		let cancelled = false;
		if (isDriveListFixture()) {
			accounts = [fixtureAccount];
			activeAccountId = fixtureAccount.homeAccountId;
			authState = 'ready';
			void loadFolder(null, [{ id: '', name: 'My files' }]);
			return () => {
				cancelled = true;
				activeJobController?.abort();
			};
		}
		void import('../lib/onedrive/auth')
			.then(({ createOneDriveAuth }) => createOneDriveAuth((found, activeId) => {
				if (cancelled) return;
				accounts = found;
				if (activeId && found.some((account) => account.homeAccountId === activeId)) {
					activeAccountId = activeId;
				}
				else if (!found.some((account) => account.homeAccountId === activeAccountId)) {
					activeAccountId = found[0]?.homeAccountId ?? '';
				}
			}))
			.then((instance) => {
				if (cancelled) return;
				auth = instance;
				authState = 'ready';
				if (activeAccountId) void loadFolder(null, [{ id: '', name: 'My files' }]);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				const message = error instanceof Error ? error.message : 'Microsoft sign-in could not be initialized.';
				authError = message;
				authState = message.includes('PUBLIC_MICROSOFT_CLIENT_ID') ? 'unconfigured' : 'error';
			});
		return () => {
			cancelled = true;
			activeJobController?.abort();
			if (readyDownloadUrl) URL.revokeObjectURL(readyDownloadUrl);
		};
	});

	function getDriveClient(accountId = activeAccountId): OneDriveClient {
		if (isDriveListFixture()) {
			return {
				listChildren: async (folderId: string | null) => fixtureItems[folderId ?? 'root'] ?? []
			} as unknown as OneDriveClient;
		}
		if (!auth) throw new Error('Microsoft sign-in is still starting.');
		let client = driveClients.get(accountId);
		if (!client) {
			client = new OneDriveClient(() => auth!.getToken(accountId));
			driveClients.set(accountId, client);
		}
		return client;
	}

	async function loadFolder(folderId: string | null, nextStack = folderStack, forceRefresh = false): Promise<void> {
		if (!activeAccountId) return;
		isListing = true;
		listingError = '';
		selectedIds = [];
		try {
			items = await getDriveClient().listChildren(folderId, undefined, { forceRefresh });
			folderStack = nextStack;
		} catch (error) {
			listingError = error instanceof Error ? error.message : 'The folder could not be loaded.';
			items = [];
		} finally {
			isListing = false;
		}
	}

	function changeAccount(event: Event): void {
		const id = (event.currentTarget as HTMLSelectElement).value;
		activeAccountId = id;
		folderStack = [{ id: '', name: 'My files' }];
		items = [];
		selectedIds = [];
		if (id) void loadFolder(null, [{ id: '', name: 'My files' }]);
	}

	function openFolder(item: DriveItem): void {
		if (!item.folder && !item.package) return;
		void loadFolder(item.id, [...folderStack, { id: item.id, name: item.name }]);
	}

	function navigateTo(index: number): void {
		const nextStack = folderStack.slice(0, index + 1);
		const folderId = nextStack.at(-1)?.id || null;
		void loadFolder(folderId, nextStack);
	}

	function refreshCurrentFolder(): void {
		const current = folderStack.at(-1);
		if (current) void loadFolder(current.id || null, [...folderStack], true);
	}

	function toggleSelected(itemId: string): void {
		selectedIds = selectedIds.includes(itemId)
			? selectedIds.filter((id) => id !== itemId)
			: [...selectedIds, itemId];
	}

	function toggleAll(): void {
		selectedIds = allSelected ? [] : items.map((item) => item.id);
	}

	async function connect(): Promise<void> {
		try {
			await auth?.login();
		} catch (error) {
			authError = error instanceof Error ? error.message : 'Microsoft sign-in did not start.';
		}
	}

	async function reconnect(): Promise<void> {
		await connect();
	}

	async function disconnectCurrent(): Promise<void> {
		if (!auth || !activeAccountId) return;
		driveClients.delete(activeAccountId);
		await auth.removeAccount(activeAccountId);
		accounts = auth.accounts();
		activeAccountId = accounts[0]?.homeAccountId ?? '';
		folderStack = [{ id: '', name: 'My files' }];
		items = [];
		selectedIds = [];
		listingError = '';
		if (activeAccountId) void loadFolder(null, [{ id: '', name: 'My files' }]);
	}

	function makeDownloadName(itemsToDownload: DriveItem[], folderName: string): string {
		const raw = itemsToDownload.length === 1 ? itemsToDownload[0].name : `${folderName}-download`;
		const safe = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/[. ]+$/g, '').trim() || 'files';
		return `${safe}.zip`;
	}

	async function download(itemsToDownload: DriveItem[]): Promise<void> {
		if (!itemsToDownload.length || !activeAccountId || jobState === 'running') return;
		clearReadyDownload();
		const jobAccountId = activeAccountId;
		const archiveName = makeDownloadName(itemsToDownload, folderStack.at(-1)?.name ?? 'files');
		const controller = new AbortController();
		activeJobController = controller;
		jobState = 'running';
		jobMessage = '';
		jobFailures = [];
		jobProgress = { phase: 'discovering', filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0, unknownSizeCount: 0 };

		let output: WritableStream<Uint8Array> | undefined;
		try {
			if (typeof window.showSaveFilePicker === 'function') {
				const handle = await window.showSaveFilePicker({
					suggestedName: archiveName,
					types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }]
				});
				output = await handle.createWritable();
			}
			// Keep the archive implementation and ZIP library out of the initial browser bundle.
			const { downloadAsZip } = await import('../lib/download/archive');
			const result = await downloadAsZip(itemsToDownload, getDriveClient(jobAccountId), {
				signal: controller.signal,
				output,
				onProgress(progress) {
					jobProgress = progress;
				}
			});

			jobFailures = result.failures.map((failure) => `${failure.path}: ${failure.message}`);
			if (result.blob) {
				readyDownloadUrl = URL.createObjectURL(result.blob);
				readyDownloadName = archiveName;
				jobState = 'ready';
				jobMessage = result.failures.length > 0
					? `${result.filesWritten} file${result.filesWritten === 1 ? '' : 's'} added. Some items were omitted; see DOWNLOAD-REPORT.txt in the ZIP.`
					: `${result.filesWritten} file${result.filesWritten === 1 ? '' : 's'} added (${formatBytes(result.bytesWritten)}).`;
			}
			else {
				jobState = 'done';
				jobMessage = result.failures.length > 0
					? `${result.filesWritten} file${result.filesWritten === 1 ? '' : 's'} added. Some items were omitted; see DOWNLOAD-REPORT.txt in the ZIP.`
					: `${result.filesWritten} file${result.filesWritten === 1 ? '' : 's'} saved (${formatBytes(result.bytesWritten)}).`;
			}
		} catch (error) {
			if (controller.signal.aborted) {
				jobState = 'cancelled';
				jobMessage = 'Download cancelled. Any temporary output was discarded where the browser allowed.';
			}
			else if (error instanceof DOMException && error.name === 'AbortError') {
				jobState = 'idle';
				jobMessage = '';
			}
			else {
				jobState = 'error';
				jobMessage = error instanceof Error ? error.message : 'The ZIP could not be created.';
				if (error instanceof Error && error.name === 'ArchiveNoFilesError' && 'failures' in error) {
					const failures = (error as Error & { failures: Array<{ path: string; message: string }> }).failures;
					jobFailures = failures.map((failure) => `${failure.path}: ${failure.message}`);
				}
				if (jobMessage.includes('Reconnect this account')) authError = jobMessage;
			}
		} finally {
			activeJobController = undefined;
		}
	}

	function clearReadyDownload(): void {
		if (readyDownloadUrl) URL.revokeObjectURL(readyDownloadUrl);
		readyDownloadUrl = '';
		readyDownloadName = '';
	}

	function completeBlobDownload(): void {
		const url = readyDownloadUrl;
		if (!url) return;
		window.setTimeout(() => {
			URL.revokeObjectURL(url);
			if (readyDownloadUrl === url) {
				readyDownloadUrl = '';
				readyDownloadName = '';
				jobState = 'done';
			}
		}, 60_000);
	}

	function cancelDownload(): void {
		activeJobController?.abort(new DOMException('Cancelled by user', 'AbortError'));
	}

	function isFolder(item: DriveItem): boolean {
		return Boolean(item.folder || item.package);
	}

	function downloadWarning(progress: DownloadProgress | undefined): string {
		if (!progress) return 'Keep this page open. The browser may pause or stop downloads if the page is closed or suspended.';
		const notes: string[] = [];
		if (progress.bytesTotal > 100 * 1024 * 1024) {
			notes.push(`Known size is about ${formatBytes(progress.bytesTotal)}.`);
		}
		if (progress.unknownSizeCount > 0) {
			notes.push(`Size is unknown for ${progress.unknownSizeCount} file(s).`);
		}
		if (progress.filesTotal > 500) {
			notes.push(`This job includes ${progress.filesTotal} files.`);
		}
		notes.push('Keep this page open. The browser may pause or stop downloads if the page is closed or suspended.');
		return notes.join(' ');
	}

	function itemType(item: DriveItem): string {
		if (item.folder) return 'Folder';
		if (item.package) return item.package.type ?? 'Package';
		return item.file?.mimeType?.split('/').at(-1)?.replace(/^vnd\./, '') ?? 'File';
	}

	function publicHome(href: '/' | '/docs/' | '/docs/onedrive-setup/'): string {
		if (href === '/') return resolve('/');
		if (href === '/docs/') return resolve('/docs');
		return resolve('/docs/onedrive-setup');
	}
</script>

<svelte:head>
	<title>Cloud Browser — OneDrive</title>
	<meta
		name="description"
		content="Browse your personal OneDrive and download selected files or folders as a ZIP. Files are processed in your browser."
	/>
</svelte:head>

<div class="app-shell">
	<header class="topbar">
		<a class="brand" href={publicHome('/')} aria-label="Cloud Browser home">
			<span class="brand-mark" aria-hidden="true">C</span>
			<span>cloud<span class="brand-light">browser</span></span>
		</a>
		<div class="provider-pill"><span class="provider-dot"></span> OneDrive</div>
		<a class="help-link" href={publicHome('/docs/')}>About &amp; privacy</a>
	</header>

	<main>
		{#if authState === 'loading'}
			<section class="welcome-card loading-card" aria-live="polite">
				<div class="spinner" aria-hidden="true"></div>
				<h1>Preparing your cloud browser</h1>
				<p>Checking for a Microsoft connection in this browser…</p>
			</section>
		{:else if authState === 'unconfigured'}
			<section class="welcome-card setup-card">
				<div class="eyebrow">FIRST-TIME SETUP</div>
				<h1>Connect your OneDrive</h1>
				<p>
					This static app needs a Microsoft public-client registration before sign-in can start.
					The registration uses delegated read access; the app never receives your password.
				</p>
				<a class="primary-button" href={publicHome('/docs/onedrive-setup/')}>Open setup instructions <span aria-hidden="true">→</span></a>
				<p class="quiet-note">No client secret belongs in this app. A client ID is public configuration.</p>
			</section>
		{:else if authState === 'error'}
			<section class="welcome-card setup-card" role="alert">
				<div class="eyebrow">SIGN-IN SETUP</div>
				<h1>OneDrive is not ready</h1>
				<p>{authError}</p>
				<a class="secondary-button" href={publicHome('/docs/onedrive-setup/')}>Review setup instructions</a>
			</section>
		{:else if accounts.length === 0}
			<section class="welcome-card setup-card">
				<div class="hero-icon" aria-hidden="true">↗</div>
				<div class="eyebrow">YOUR PRIVATE CLOUD, IN ONE PLACE</div>
				<h1>Browse OneDrive.<br /><span>Bring files home.</span></h1>
				<p>
					Sign in with your personal Microsoft account to browse folders and download files. Your files
					are fetched and packaged locally in this browser.
				</p>
				{#if authError}
					<div class="notice notice-error" role="alert">{authError}</div>
				{/if}
				<button class="primary-button" onclick={connect}>Connect OneDrive <span aria-hidden="true">→</span></button>
				<p class="quiet-note">Read-only access · No app backend · Disconnect any time</p>
			</section>
		{:else}
			<section class="browser-layout" aria-label="OneDrive file browser">
				<aside class="sidebar">
					<div class="sidebar-heading">CLOUD STORAGE</div>
					<div class="provider-item active"><span class="drive-icon">▣</span><span>OneDrive</span><span class="active-dot"></span></div>
					<div class="sidebar-divider"></div>
					<div class="sidebar-heading account-heading">CONNECTED ACCOUNT</div>
					{#if accounts.length > 0}
						<label class="sr-only" for="account-select">Choose a Microsoft account</label>
						<select id="account-select" class="account-select" value={activeAccountId} disabled={jobState === 'running'} onchange={changeAccount}>
							{#each accounts as account (account.homeAccountId)}
								<option value={account.homeAccountId}>{account.name || account.username}</option>
							{/each}
						</select>
						<p class="account-email">{accounts.find((account) => account.homeAccountId === activeAccountId)?.username}</p>
					{/if}
					<button class="sidebar-action" disabled={jobState === 'running'} onclick={connect}><span aria-hidden="true">＋</span> Add another account</button>
					<button class="sidebar-action disconnect" disabled={jobState === 'running'} onclick={disconnectCurrent}><span aria-hidden="true">↪</span> Disconnect account</button>
					<div class="sidebar-bottom">
						<div class="read-only-badge"><span aria-hidden="true">◉</span> Read-only access</div>
						<p>Cloud Browser never stores a copy of your files on a server.</p>
						<a href={publicHome('/docs/')}>Privacy &amp; how it works</a>
					</div>
				</aside>

				<div class="file-panel">
					<div class="panel-title-row">
						<div>
							<div class="eyebrow">YOUR FILES</div>
							<h1>OneDrive</h1>
						</div>
						<div class="title-actions">
							<button class="refresh-button" disabled={isListing || jobState === 'running'} onclick={refreshCurrentFolder} title="Fetch this folder from OneDrive again">↻ <span>Refresh</span></button>
							<div class="view-toggle" role="group" aria-label="File display mode">
								<button class:view-active={viewMode === 'list'} class="view-button" aria-pressed={viewMode === 'list'} onclick={() => (viewMode = 'list')}>List</button>
								<button class:view-active={viewMode === 'grid'} class="view-button" aria-pressed={viewMode === 'grid'} onclick={() => (viewMode = 'grid')}>Grid</button>
							</div>
							<div class="account-avatar" aria-hidden="true">{(accounts.find((account) => account.homeAccountId === activeAccountId)?.name || 'M').slice(0, 1).toUpperCase()}</div>
						</div>
					</div>

					<nav class="breadcrumbs" aria-label="Folder breadcrumbs">
						{#each folderStack as crumb, index (crumb.id)}
							{#if index > 0}<span class="crumb-separator" aria-hidden="true">/</span>{/if}
							{#if index === folderStack.length - 1}
								<span aria-current="location">{crumb.name}</span>
							{:else}
							<button class="crumb-button" onclick={() => navigateTo(index)}>{crumb.name}</button>
							{/if}
						{/each}
					</nav>

					{#if authError}
						<div class="notice notice-error account-notice" role="alert">
							<span>{authError}</span>
							<button class="text-button" onclick={reconnect}>Reconnect</button>
						</div>
					{/if}

					{#if selectedItems.length > 0}
						<div class="selection-bar">
							<span>{selectedItems.length} selected</span>
							<button class="download-button" disabled={jobState === 'running'} onclick={() => download(selectedItems)}>
								<span aria-hidden="true">↓</span> Download ZIP
							</button>
							<button class="clear-button" onclick={() => (selectedIds = [])}>Clear</button>
						</div>
					{/if}

					{#if jobState === 'running'}
						<div class="job-card" aria-live="polite">
							<div class="job-topline"><strong>{jobProgress?.phase === 'discovering' ? 'Preparing folder' : jobProgress?.phase === 'finalizing' ? 'Finishing ZIP' : 'Building your ZIP'}</strong><button class="cancel-button" onclick={cancelDownload}>Cancel</button></div>
							{#if jobProgress?.phase === 'downloading' && jobProgress.filesTotal > 0}
								<div class="progress-track"><div class="progress-fill" style={`width: ${Math.min(100, Math.round((jobProgress.filesDone / jobProgress.filesTotal) * 100))}%`}></div></div>
								<p>{jobProgress.filesDone} of {jobProgress.filesTotal} files · {jobProgress.currentPath}</p>
							{:else}
								<p>{jobProgress?.phase === 'discovering' ? 'Finding files and folders…' : 'Writing ZIP directory…'}</p>
							{/if}
							<p class="job-warning">{downloadWarning(jobProgress)}</p>
						</div>
					{:else if jobMessage && jobState !== 'idle'}
						<div class:notice-error={jobState === 'error'} class="notice job-result" role={jobState === 'error' ? 'alert' : 'status'}>
							<div><span>{jobMessage}</span>
								{#if jobFailures.length > 0}
									<details class="failure-details">
										<summary>{jobFailures.length} failed item{jobFailures.length === 1 ? '' : 's'} — show details</summary>
										<ul>{#each jobFailures as failure}<li>{failure}</li>{/each}</ul>
									</details>
								{/if}
							</div>
							{#if jobState === 'ready' && readyDownloadUrl}
								<div class="save-ready"><a class="download-button" href={readyDownloadUrl} download={readyDownloadName} onclick={completeBlobDownload}>Save ZIP</a><span>On iPhone/iPad, use Share → Save to Files if the archive opens in a preview.</span></div>
							{/if}
							{#if jobState === 'cancelled'}<button class="text-button" onclick={() => (jobState = 'idle')}>Dismiss</button>{/if}
						</div>
					{/if}

					{#if listingError}
						<div class="empty-state" role="alert">
							<div class="empty-icon">!</div><h2>Could not load this folder</h2><p>{listingError}</p>
							{#if listingError.includes('Reconnect this account')}<button class="secondary-button" onclick={reconnect}>Reconnect account</button>{/if}
							{#if folderStack.length > 1}<button class="text-button" onclick={() => navigateTo(folderStack.length - 2)}>Go back</button>{/if}
						</div>
					{:else if isListing}
						<div class="empty-state"><div class="spinner" aria-hidden="true"></div><h2>Loading your files</h2><p>Fetching the folder contents from Microsoft…</p></div>
					{:else if items.length === 0}
						<div class="empty-state"><div class="empty-icon">⌂</div><h2>This folder is empty</h2><p>There are no files or folders to show here.</p></div>
					{:else if viewMode === 'list'}
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										<th class="check-cell"><input type="checkbox" aria-label="Select all visible items" checked={allSelected} onchange={toggleAll} /></th>
										<th><span class="column-heading">Name</span></th>
										<th class="type-column">Type</th>
										<th class="size-column">Size</th>
										<th class="modified-column">Modified</th>
									</tr>
								</thead>
								<tbody>
									{#each sortedItems as item (item.id)}
										<tr class:selected={selectedIds.includes(item.id)}>
											<td class="check-cell"><input type="checkbox" aria-label={`Select ${item.name}`} checked={selectedIds.includes(item.id)} onchange={() => toggleSelected(item.id)} /></td>
											<td class="name-cell">
												<ItemThumbnail {item} size="list" />
												{#if isFolder(item)}
													<button class="item-name folder-name" onclick={() => openFolder(item)}>{item.name}</button>
												{:else}
													<span class="item-name">{item.name}</span>
												{/if}
												{#if isFolder(item)}<span class="child-count">{item.folder?.childCount ?? ''}</span>{/if}
											</td>
											<td class="type-column muted">{itemType(item)}</td>
											<td class="size-column muted">{isFolder(item) ? '—' : formatBytes(item.size ?? Number.NaN)}</td>
											<td class="modified-column muted">{formatDate(item.lastModifiedDateTime)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<div class="grid-view">
							<div class="grid-toolbar">
								<label><input type="checkbox" aria-label="Select all visible items" checked={allSelected} onchange={toggleAll} /> Select all</label>
								<span>{items.length} item{items.length === 1 ? '' : 's'}</span>
							</div>
							<div class="file-grid">
								{#each sortedItems as item (item.id)}
									<article class:grid-selected={selectedIds.includes(item.id)} class="grid-card">
										<label class="grid-checkbox">
											<input type="checkbox" aria-label={`Select ${item.name}`} checked={selectedIds.includes(item.id)} onchange={() => toggleSelected(item.id)} />
										</label>
										{#if isFolder(item)}
											<button class="grid-open" onclick={() => openFolder(item)}>
												<span class="grid-media">
													<ItemThumbnail {item} size="grid" />
													<span class="grid-name">{item.name}</span>
												</span>
											</button>
										{:else}
											<button class="grid-file" aria-pressed={selectedIds.includes(item.id)} onclick={() => toggleSelected(item.id)}>
												<span class="grid-media">
													<ItemThumbnail {item} size="grid" />
													<span class="grid-name">{item.name}</span>
												</span>
											</button>
										{/if}
									</article>
								{/each}
							</div>
						</div>
					{/if}
					<div class="list-footer">{items.length} item{items.length === 1 ? '' : 's'} in this folder <span>Selection clears when you navigate.</span></div>
				</div>
			</section>
		{/if}
	</main>
	<footer><span>Files move directly from Microsoft to your browser.</span><span>Cloud Browser · Read-only v0.1</span></footer>
</div>

<style>
	:global(*) { box-sizing: border-box; }
	:global(body) { margin: 0; background: #f5f7fb; color: #1d2939; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; }
	:global(button), :global(select) { font: inherit; }
	:global(button:focus-visible), :global(a:focus-visible), :global(select:focus-visible), :global(input:focus-visible) { outline: 3px solid #8db8ff; outline-offset: 2px; }
	.app-shell { min-height: 100vh; display: flex; flex-direction: column; }
	.topbar { height: 68px; padding: 0 clamp(20px, 5vw, 76px); display: flex; align-items: center; gap: 32px; background: #fff; border-bottom: 1px solid #e9edf3; }
	.brand { display: inline-flex; align-items: center; gap: 10px; color: #172b4d; text-decoration: none; font-weight: 750; letter-spacing: -.5px; font-size: 17px; }
	.brand-mark { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: #175cd3; color: white; font-size: 16px; }
	.brand-light { color: #718096; font-weight: 500; }
	.provider-pill { display: flex; align-items: center; gap: 8px; border: 1px solid #e4e9f0; color: #475467; padding: 7px 11px; border-radius: 999px; font-size: 12px; }
	.provider-dot { width: 8px; height: 8px; border-radius: 50%; background: #0078d4; }
	.help-link { margin-left: auto; color: #667085; text-decoration: none; font-size: 13px; }
	.help-link:hover, .sidebar-bottom a:hover { color: #175cd3; }
	main { flex: 1; display: flex; flex-direction: column; }
	.welcome-card { margin: auto; width: min(540px, calc(100% - 32px)); padding: clamp(30px, 6vw, 58px); text-align: center; background: #fff; border: 1px solid #e8edf4; border-radius: 18px; box-shadow: 0 20px 50px #243b530d; }
	.loading-card { margin-top: min(17vh, 150px); }
	.loading-card h1, .setup-card h1 { font-size: clamp(26px, 4vw, 36px); letter-spacing: -1.1px; margin: 18px 0 12px; }
	.setup-card > p { max-width: 410px; margin: 0 auto 24px; color: #667085; line-height: 1.7; }
	.eyebrow { color: #667085; font-size: 10px; font-weight: 750; letter-spacing: 1.4px; }
	.hero-icon { width: 64px; height: 64px; margin: 0 auto 28px; border-radius: 19px; display: grid; place-items: center; background: #eaf2ff; color: #175cd3; font-size: 28px; }
	.setup-card h1 { color: #172b4d; }
	.setup-card h1 span { color: #175cd3; }
	.setup-card > p { max-width: 410px; margin: 0 auto 26px; color: #667085; line-height: 1.7; }
	.primary-button, .secondary-button, .download-button { border: 0; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 12px; border-radius: 9px; padding: 12px 17px; background: #175cd3; color: #fff; font-weight: 650; box-shadow: 0 3px 8px #175cd326; }
	.primary-button:hover, .download-button:hover { background: #1049af; }
	.quiet-note { margin: 22px 0 0 !important; font-size: 12px; color: #98a2b3 !important; }
	.secondary-button { color: #344054; background: #fff; border: 1px solid #d0d5dd; box-shadow: none; }
	.secondary-button:hover { background: #f9fafb; }
	.spinner { width: 24px; height: 24px; margin: auto; border: 3px solid #dce7f8; border-top-color: #175cd3; border-radius: 50%; animation: spin .8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.browser-layout { width: min(1380px, calc(100% - 64px)); min-height: 690px; margin: 36px auto; display: grid; grid-template-columns: 245px minmax(0, 1fr); background: #fff; border: 1px solid #e8edf4; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 32px #243b5308; }
	.sidebar { position: relative; padding: 27px 17px 20px; background: #fbfcfe; border-right: 1px solid #edf0f5; display: flex; flex-direction: column; }
	.sidebar-heading { padding: 0 9px; color: #98a2b3; font-size: 9px; font-weight: 750; letter-spacing: 1.1px; }
	.provider-item { height: 41px; display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 0 10px; border-radius: 7px; color: #344054; font-size: 13px; }
	.provider-item.active { background: #edf4ff; color: #175cd3; font-weight: 650; }
	.drive-icon { color: #0078d4; font-size: 18px; }
	.active-dot { width: 6px; height: 6px; margin-left: auto; background: #2e90fa; border-radius: 50%; }
	.sidebar-divider { height: 1px; margin: 21px 0; background: #eaecf0; }
	.account-heading { margin-bottom: 10px; }
	.account-select { width: 100%; min-width: 0; padding: 10px 27px 10px 10px; border: 1px solid #e4e7ec; border-radius: 7px; background: #fff; color: #344054; font-size: 12px; text-overflow: ellipsis; }
	.account-email { margin: 6px 10px 12px; color: #98a2b3; font-size: 11px; overflow-wrap: anywhere; }
	.sidebar-action { width: 100%; display: flex; gap: 9px; align-items: center; padding: 9px 10px; border: 0; background: transparent; color: #475467; text-align: left; font-size: 12px; cursor: pointer; border-radius: 6px; }
	.sidebar-action:hover { background: #f1f4f8; }
	.sidebar-action span { font-size: 17px; color: #667085; }
	.sidebar-action.disconnect { color: #667085; }
	.sidebar-bottom { margin-top: auto; padding: 15px 8px 0; }
	.read-only-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 8px; color: #027a48; background: #ecfdf3; border-radius: 5px; font-size: 10px; font-weight: 650; }
	.sidebar-bottom p { margin: 10px 0; color: #98a2b3; font-size: 11px; line-height: 1.55; }
	.sidebar-bottom a { color: #667085; text-decoration: none; font-size: 11px; }
	.file-panel { min-width: 0; padding: 30px clamp(20px, 4vw, 48px) 20px; }
	.panel-title-row { display: flex; align-items: center; justify-content: space-between; }
	.title-actions { display: flex; align-items: center; gap: 12px; }
	.refresh-button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid #e4e7ec; border-radius: 7px; background: #fff; color: #475467; font-size: 11px; cursor: pointer; }
	.refresh-button:hover:not(:disabled) { border-color: #b2ccff; color: #175cd3; background: #f8faff; }
	.refresh-button:disabled { cursor: wait; opacity: .6; }
	.view-toggle { display: inline-flex; padding: 2px; border: 1px solid #e4e7ec; border-radius: 8px; background: #f9fafb; }
	.view-button { padding: 6px 9px; border: 0; border-radius: 6px; background: transparent; color: #667085; font-size: 11px; cursor: pointer; }
	.view-button.view-active { background: #fff; color: #175cd3; box-shadow: 0 1px 3px #1018281a; font-weight: 650; }
	.panel-title-row h1 { margin: 5px 0 0; color: #172b4d; font-size: 25px; letter-spacing: -.6px; }
	.account-avatar { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: #e9f2ff; color: #175cd3; font-weight: 700; }
	.breadcrumbs { display: flex; align-items: center; gap: 9px; min-height: 47px; margin: 10px 0 14px; color: #344054; font-size: 12px; }
	.crumb-separator { color: #c0c7d2; }
	.crumb-button, .text-button { padding: 0; border: 0; background: none; color: #667085; cursor: pointer; }
	.crumb-button:hover, .text-button:hover { color: #175cd3; text-decoration: underline; }
	.notice { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 10px 0; padding: 12px 14px; border: 1px solid #b2ddff; border-radius: 8px; background: #eff8ff; color: #175cd3; font-size: 12px; line-height: 1.5; }
	.notice-error { border-color: #fecdca; background: #fff4f2; color: #b42318; }
	.account-notice { margin-bottom: 15px; }
	.text-button { color: #175cd3; white-space: nowrap; font-size: 12px; font-weight: 650; }
	.selection-bar { display: flex; align-items: center; gap: 15px; padding: 9px 12px; margin-bottom: 12px; border: 1px solid #d1e0ff; border-radius: 8px; background: #f5f8ff; color: #344054; font-size: 12px; }
	.download-button { margin-left: auto; padding: 8px 12px; border-radius: 6px; font-size: 11px; box-shadow: none; }
	.clear-button, .cancel-button { border: 0; padding: 5px; background: none; color: #667085; cursor: pointer; font-size: 11px; }
	.clear-button:hover, .cancel-button:hover { color: #175cd3; }
	.job-card { margin: 12px 0; padding: 14px; border: 1px solid #e4e7ec; border-radius: 8px; background: #fcfcfd; }
	.job-topline { display: flex; align-items: center; justify-content: space-between; color: #344054; font-size: 12px; }
	.job-card p { margin: 8px 0 0; color: #667085; font-size: 11px; overflow-wrap: anywhere; }
	.job-card .job-warning { color: #b54708; }
	.progress-track { height: 5px; margin-top: 12px; overflow: hidden; border-radius: 99px; background: #e4e7ec; }
	.progress-fill { height: 100%; border-radius: inherit; background: #2e90fa; transition: width .2s ease; }
	.job-result { margin-bottom: 14px; }
	.failure-details { margin-top: 8px; color: inherit; }
	.failure-details summary { cursor: pointer; font-size: 11px; font-weight: 650; }
	.failure-details ul { max-height: 180px; overflow: auto; margin: 7px 0 0; padding-left: 20px; }
	.failure-details li { margin: 3px 0; overflow-wrap: anywhere; }
	.save-ready { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
	.save-ready > span { color: #667085; font-size: 10px; }
	.table-wrap { width: 100%; overflow-x: auto; border: 1px solid #eaecf0; border-radius: 9px; }
	table { width: 100%; min-width: 580px; border-collapse: collapse; text-align: left; }
	thead { background: #f9fafb; }
	th { height: 41px; color: #667085; font-weight: 600; font-size: 10px; white-space: nowrap; }
	td { height: 52px; border-top: 1px solid #f0f2f5; color: #344054; font-size: 12px; }
	th, td { padding: 0 12px; }
	tr.selected td { background: #f5f8ff; }
	.check-cell { width: 42px; text-align: center; padding: 0 6px; }
	input[type="checkbox"] { width: 15px; height: 15px; accent-color: #175cd3; vertical-align: middle; cursor: pointer; }
	.name-cell { display: flex; align-items: center; gap: 10px; }
	.item-name { min-width: 0; overflow: hidden; color: #344054; text-overflow: ellipsis; white-space: nowrap; }
	button.item-name { padding: 0; border: 0; background: none; text-align: left; cursor: pointer; }
	button.item-name:hover { color: #175cd3; text-decoration: underline; }
	.child-count { color: #98a2b3; font-size: 10px; }
	.grid-view { width: 100%; }
	.grid-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 3px 2px 11px; color: #667085; font-size: 11px; }
	.grid-toolbar label { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; }
	.file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
	.grid-card { position: relative; min-width: 0; overflow: hidden; border: 1px solid #eaecf0; border-radius: 9px; background: #fff; transition: border-color .15s, background .15s; }
	.grid-card:hover { border-color: #b2ccff; }
	.grid-card.grid-selected { border-color: #84adff; background: #f5f8ff; }
	.grid-checkbox { position: absolute; z-index: 2; top: 8px; left: 8px; display: grid; width: 36px; height: 36px; place-items: center; border: 1px solid #e4e7ec; border-radius: 7px; background: #ffffffed; cursor: pointer; }
	.grid-checkbox input { width: 18px; height: 18px; margin: 0; }
	.grid-open, .grid-file { display: block; width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; }
	.grid-open { cursor: pointer; }
	.grid-media { position: relative; display: block; width: 100%; aspect-ratio: 4 / 3; overflow: hidden; background: #f2f4f7; }
	.grid-media :global(.thumbnail img) { transition: transform .18s ease; }
	.grid-open:hover .grid-media :global(.thumbnail img), .grid-file:hover .grid-media :global(.thumbnail img) { transform: scale(1.035); }
	.grid-name { position: absolute; right: 0; bottom: 0; left: 0; display: -webkit-box; max-height: 56px; overflow: hidden; padding: 15px 9px 7px; background: linear-gradient(transparent, #101828c9); color: #fff; font-size: 11px; font-weight: 600; line-height: 15px; line-clamp: 2; overflow-wrap: anywhere; text-overflow: ellipsis; text-shadow: 0 1px 2px #0008; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
	.type-column { width: 110px; }
	.size-column { width: 100px; white-space: nowrap; }
	.modified-column { width: 125px; white-space: nowrap; }
	.muted { color: #98a2b3; font-size: 11px; }
	.empty-state { min-height: 260px; padding: 45px 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
	.empty-state .spinner { margin-bottom: 20px; }
	.empty-icon { width: 43px; height: 43px; margin-bottom: 12px; display: grid; place-items: center; border-radius: 13px; color: #667085; background: #f2f4f7; font-size: 18px; font-weight: 700; }
	.empty-state h2 { margin: 4px 0 6px; color: #344054; font-size: 15px; }
	.empty-state p { max-width: 420px; margin: 0 0 14px; color: #98a2b3; font-size: 12px; line-height: 1.6; }
	.empty-state .text-button { margin-top: 12px; }
	.list-footer { display: flex; justify-content: space-between; padding: 12px 2px; color: #98a2b3; font-size: 10px; }
	footer { display: flex; justify-content: space-between; gap: 15px; padding: 16px clamp(20px, 5vw, 76px); color: #98a2b3; font-size: 10px; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	@media (max-width: 760px) {
		.topbar { height: 60px; gap: 14px; padding: 0 16px; }
		.brand { font-size: 15px; }
		.brand-mark { width: 27px; height: 27px; }
		.provider-pill { margin-left: auto; padding: 6px 9px; }
		.help-link { display: none; }
		.browser-layout { width: calc(100% - 20px); margin: 10px auto 20px; min-height: calc(100vh - 118px); grid-template-columns: 1fr; }
		.sidebar { padding: 12px; border-right: 0; border-bottom: 1px solid #edf0f5; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; }
		.sidebar-heading, .sidebar-divider, .sidebar-bottom, .sidebar-action.disconnect { display: none; }
		.provider-item { grid-column: 1; grid-row: 1; margin: 0; }
		.account-select { grid-column: 1; grid-row: 2; }
		.account-email { display: none; }
		.sidebar-action { grid-column: 2; grid-row: 2; width: auto; height: 38px; padding: 7px; white-space: nowrap; font-size: 10px; }
		.file-panel { padding: 21px 13px 12px; }
		.panel-title-row h1 { font-size: 22px; }
		.title-actions { gap: 6px; }
		.refresh-button { padding: 7px; }
		.view-button { padding: 6px 7px; }
		.breadcrumbs { overflow-x: auto; white-space: nowrap; }
		.selection-bar { gap: 8px; padding: 8px; }
		.download-button { gap: 6px; padding: 8px; }
		.file-grid { grid-template-columns: repeat(auto-fill, minmax(125px, 1fr)); gap: 9px; }
		.list-footer { display: block; line-height: 1.7; }
		.list-footer span { display: block; }
		footer { padding: 12px 14px; font-size: 9px; }
	}
</style>
