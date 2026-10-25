import type { DriveItem } from './types';

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const GRAPH_ORIGIN = 'https://graph.microsoft.com';
export const CHILDREN_CACHE_TTL_MS = 60_000;
const MAX_CACHED_FOLDERS = 100;

interface CachedListing {
	items: DriveItem[];
	expiresAt: number;
}

export interface ListChildrenOptions {
	forceRefresh?: boolean;
}

export type AccessTokenProvider = () => Promise<string>;

export class OneDriveError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'OneDriveError';
	}
}

export class OneDriveClient {
	private readonly listingCache = new Map<string, CachedListing>();
	private readonly inFlightListings = new Map<string, Promise<DriveItem[]>>();

	constructor(
		private readonly getAccessToken: AccessTokenProvider,
		private readonly fetcher: typeof fetch = fetch
	) {}

	async listChildren(
		folderId: string | null,
		signal?: AbortSignal,
		options: ListChildrenOptions = {}
	): Promise<DriveItem[]> {
		const cacheKey = folderId === null ? 'root:' : `folder:${folderId}`;
		const canCache = signal === undefined;
		if (canCache && options.forceRefresh) this.listingCache.delete(cacheKey);

		if (canCache && !options.forceRefresh) {
			const cached = this.listingCache.get(cacheKey);
			if (cached && cached.expiresAt > Date.now()) {
				this.listingCache.delete(cacheKey);
				this.listingCache.set(cacheKey, cached);
				return cloneItems(cached.items);
			}
			if (cached) this.listingCache.delete(cacheKey);

			const inFlight = this.inFlightListings.get(cacheKey);
			if (inFlight) return cloneItems(await inFlight);
		}

		const request = this.fetchChildren(folderId, signal);
		if (canCache) this.inFlightListings.set(cacheKey, request);
		try {
			const items = await request;
			if (canCache && this.inFlightListings.get(cacheKey) === request) {
				this.listingCache.set(cacheKey, {
					items: cloneItems(items),
					expiresAt: Date.now() + CHILDREN_CACHE_TTL_MS
				});
				this.inFlightListings.delete(cacheKey);
				this.trimListingCache();
			}
			return cloneItems(items);
		} catch (error) {
			if (canCache && this.inFlightListings.get(cacheKey) === request) {
				this.inFlightListings.delete(cacheKey);
			}
			throw error;
		}
	}

	clearChildrenCache(folderId?: string | null): void {
		if (folderId === undefined) {
			this.listingCache.clear();
			return;
		}
		this.listingCache.delete(folderId === null ? 'root:' : `folder:${folderId}`);
	}

	private async fetchChildren(folderId: string | null, signal?: AbortSignal): Promise<DriveItem[]> {
		const initialUrl = folderId
			? `${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(folderId)}/children`
			: `${GRAPH_ROOT}/me/drive/root/children`;
		const query = new URLSearchParams({
			'$top': '200',
			'$select': [
				'id',
				'name',
				'size',
				'file',
				'folder',
				'package',
				'lastModifiedDateTime',
				'webUrl'
			].join(',')
		});
		// Personal OneDrive supports expanding thumbnails with its child listing API.
		// Recursive download traversal passes a signal and does not need preview metadata.
		if (!signal) query.set('$expand', 'thumbnails');
		let next: string | undefined = `${initialUrl}?${query}`;
		const results: DriveItem[] = [];

		while (next) {
			if (signal?.aborted) throw signal.reason ?? new DOMException('Operation cancelled', 'AbortError');
			const pageUrl = new URL(next);
			if (pageUrl.origin !== GRAPH_ORIGIN || !pageUrl.pathname.startsWith('/v1.0/')) {
				throw new OneDriveError('Microsoft returned an unexpected page URL.');
			}

			const response = await this.fetchGraph(pageUrl.toString(), signal);
			const payload = (await response.json()) as {
				value?: DriveItem[];
				'@odata.nextLink'?: string;
			};
			results.push(...(payload.value ?? []));
			next = payload['@odata.nextLink'];
		}

		return results;
	}

	private trimListingCache(): void {
		const now = Date.now();
		for (const [key, cached] of this.listingCache) {
			if (cached.expiresAt <= now) this.listingCache.delete(key);
		}
		while (this.listingCache.size > MAX_CACHED_FOLDERS) {
			const oldestKey = this.listingCache.keys().next().value;
			if (oldestKey === undefined) break;
			this.listingCache.delete(oldestKey);
		}
	}

	async downloadUrl(item: DriveItem, signal?: AbortSignal): Promise<string> {
		const query = new URLSearchParams({ '$select': '@microsoft.graph.downloadUrl' });
		const response = await this.fetchGraph(
			`${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(item.id)}?${query}`,
			signal
		);
		const metadata = (await response.json()) as DriveItem;
		const url = metadata['@microsoft.graph.downloadUrl'];

		if (!url || new URL(url).protocol !== 'https:') {
			throw new OneDriveError(`Microsoft did not provide a usable download URL for “${item.name}”.`);
		}
		return url;
	}

	async fetchFile(item: DriveItem, signal?: AbortSignal): Promise<Response> {
		const url = await this.downloadUrl(item, signal);
		// This preauthenticated URL is short-lived. Never attach the Graph bearer token to it.
		const response = await this.fetcher(url, { signal });
		if (!response.ok || !response.body) {
			throw new OneDriveError(`Could not download “${item.name}” (HTTP ${response.status}).`, response.status);
		}
		return response;
	}

	private async fetchGraph(url: string, signal?: AbortSignal): Promise<Response> {
		const token = await this.getAccessToken();
		const response = await this.fetcher(url, {
			headers: { Authorization: `Bearer ${token}` },
			signal
		});
		if (!response.ok) {
			const message =
				response.status === 401 || response.status === 403
					? 'Microsoft did not authorize this request. Reconnect the account and try again.'
					: `Microsoft Graph returned HTTP ${response.status}.`;
			throw new OneDriveError(message, response.status);
		}
		return response;
	}
}

function cloneItems(items: DriveItem[]): DriveItem[] {
	return items.map((item) => ({
		...item,
		...(item.file ? { file: { ...item.file } } : {}),
		...(item.folder ? { folder: { ...item.folder } } : {}),
		...(item.package ? { package: { ...item.package } } : {})
	}));
}
