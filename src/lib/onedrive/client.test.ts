import { describe, expect, it, vi } from 'vitest';
import { CHILDREN_CACHE_TTL_MS, OneDriveClient } from './client';

describe('OneDriveClient', () => {
	it('reuses a recent folder listing instead of requesting the same Graph children again', async () => {
		const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({
			value: [{
				id: 'folder-1',
				name: 'Folder',
				folder: { childCount: 1 },
				thumbnails: [{ small: { url: 'https://thumbnail.example.test/small.jpg' } }]
			}]
		})));
		const client = new OneDriveClient(async () => 'test-token', fetcher);

		const first = await client.listChildren(null);
		const second = await client.listChildren(null);

		expect(first).toEqual(second);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('$expand')).toBe('thumbnails');
		expect(first[0].thumbnails?.[0].small?.url).toBe('https://thumbnail.example.test/small.jpg');
		first[0].name = 'Changed by caller';
		expect((await client.listChildren(null))[0].name).toBe('Folder');
	});

	it('expires listings and lets the caller force a fresh listing', async () => {
		let version = 0;
		const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({
			value: [{ id: 'folder-1', name: `Folder ${++version}`, folder: { childCount: 1 } }]
		})));
		const client = new OneDriveClient(async () => 'test-token', fetcher);

		try {
			vi.useFakeTimers();
			const first = await client.listChildren(null);
			const cached = await client.listChildren(null);
			const refreshed = await client.listChildren(null, undefined, { forceRefresh: true });
			expect(first[0].name).toBe('Folder 1');
			expect(cached[0].name).toBe('Folder 1');
			expect(refreshed[0].name).toBe('Folder 2');
			await vi.advanceTimersByTimeAsync(CHILDREN_CACHE_TTL_MS + 1);
			const expired = await client.listChildren(null);
			expect(expired[0].name).toBe('Folder 3');
			expect(fetcher).toHaveBeenCalledTimes(3);
		} finally {
			vi.useRealTimers();
		}
	});

	it('bypasses the browsing cache for signal-bound recursive download listings', async () => {
		const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ value: [] })));
		const client = new OneDriveClient(async () => 'test-token', fetcher);

		await client.listChildren(null);
		await client.listChildren(null, new AbortController().signal);

		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('loads every Graph children page and keeps the bearer token on Graph requests only', async () => {
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				value: [{ id: 'folder-1', name: 'Folder', folder: { childCount: 1 } }],
				'@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=next'
			})))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				value: [{ id: 'file-2', name: 'report.txt', size: 12 }]
			})))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				'@microsoft.graph.downloadUrl': 'https://download.example.test/file?signature=fresh'
			})))
			.mockResolvedValueOnce(new Response('file body'));
		const client = new OneDriveClient(async () => 'test-token', fetcher);

		const items = await client.listChildren(null);
		const fileResponse = await client.fetchFile({
			id: 'file-2',
			name: 'report.txt',
			'@microsoft.graph.downloadUrl': 'https://download.example.test/file?signature=stale'
		});

		expect(items.map((item) => item.id)).toEqual(['folder-1', 'file-2']);
		expect(fetcher).toHaveBeenCalledTimes(4);
		expect(fetcher.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer test-token' });
		expect(fetcher.mock.calls[1][1]?.headers).toEqual({ Authorization: 'Bearer test-token' });
		expect(fetcher.mock.calls[2][1]?.headers).toEqual({ Authorization: 'Bearer test-token' });
		expect(fetcher.mock.calls[3][0]).toContain('signature=fresh');
		expect(fetcher.mock.calls[3][1]?.headers).toBeUndefined();
		expect(await fileResponse.text()).toBe('file body');
	});

	it('rejects pagination links outside Microsoft Graph before sending a token', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
			value: [],
			'@odata.nextLink': 'https://attacker.example.test/collect'
		})));
		const client = new OneDriveClient(async () => 'test-token', fetcher);

		await expect(client.listChildren(null)).rejects.toThrow('unexpected page URL');
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('does not send a request after cancellation', async () => {
		const fetcher = vi.fn<typeof fetch>();
		const client = new OneDriveClient(async () => 'test-token', fetcher);
		const controller = new AbortController();
		controller.abort();

		await expect(client.listChildren(null, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
		expect(fetcher).not.toHaveBeenCalled();
	});
});
