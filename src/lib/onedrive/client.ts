import type { DriveItem } from './types';

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const GRAPH_ORIGIN = 'https://graph.microsoft.com';

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
	constructor(
		private readonly getAccessToken: AccessTokenProvider,
		private readonly fetcher: typeof fetch = fetch
	) {}

	async listChildren(folderId: string | null, signal?: AbortSignal): Promise<DriveItem[]> {
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
				'webUrl',
				'@microsoft.graph.downloadUrl'
			].join(',')
		});
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

	async downloadUrl(item: DriveItem, signal?: AbortSignal): Promise<string> {
		let url = item['@microsoft.graph.downloadUrl'];
		if (!url) {
			const query = new URLSearchParams({ '$select': '@microsoft.graph.downloadUrl' });
			const response = await this.fetchGraph(
				`${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(item.id)}?${query}`,
				signal
			);
			const metadata = (await response.json()) as DriveItem;
			url = metadata['@microsoft.graph.downloadUrl'];
		}

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
