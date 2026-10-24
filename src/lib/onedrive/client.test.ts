import { describe, expect, it, vi } from 'vitest';
import { OneDriveClient } from './client';

describe('OneDriveClient', () => {
	it('loads every Graph children page and keeps the bearer token on Graph requests only', async () => {
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				value: [{ id: 'folder-1', name: 'Folder', folder: { childCount: 1 } }],
				'@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=next'
			})))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				value: [{ id: 'file-2', name: 'report.txt', size: 12 }]
			})))
			.mockResolvedValueOnce(new Response('file body'));
		const client = new OneDriveClient(async () => 'test-token', fetcher);

		const items = await client.listChildren(null);
		const fileResponse = await client.fetchFile({
			id: 'file-2',
			name: 'report.txt',
			'@microsoft.graph.downloadUrl': 'https://download.example.test/file?signature=secret'
		});

		expect(items.map((item) => item.id)).toEqual(['folder-1', 'file-2']);
		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(fetcher.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer test-token' });
		expect(fetcher.mock.calls[1][1]?.headers).toEqual({ Authorization: 'Bearer test-token' });
		expect(fetcher.mock.calls[2][1]?.headers).toBeUndefined();
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
