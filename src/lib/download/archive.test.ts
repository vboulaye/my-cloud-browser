import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import { downloadAsZip, safeArchiveSegment } from './archive';
import type { OneDriveClient } from '../onedrive/client';
import type { DriveItem } from '../onedrive/types';

describe('archive helpers', () => {
	it('normalizes unsafe path segments', () => {
		expect(safeArchiveSegment('../folder\\file\u0000')).toBe('.._folder_file_');
		expect(safeArchiveSegment('..')).toBe('_');
		expect(safeArchiveSegment(' name. ')).toBe('name');
		expect(safeArchiveSegment('CON.txt')).toBe('_CON.txt');
		expect(safeArchiveSegment('a:b?.txt')).toBe('a_b_.txt');
	});

	it('preserves nested structure and includes an omission report for failed files', async () => {
		const folder: DriveItem = { id: 'folder', name: 'photos', folder: { childCount: 2 } };
		const good: DriveItem = { id: 'ok', name: 'good.txt', size: 4 };
		const bad: DriveItem = { id: 'bad', name: 'unavailable.txt', size: 20 };
		const client = {
			listChildren: async (id: string | null) => id === 'folder' ? [good, bad] : [],
			fetchFile: async (item: DriveItem) => {
				if (item.id === 'bad') throw new Error('Simulated file failure');
				return new Response('data');
			}
		} as unknown as OneDriveClient;
		const controller = new AbortController();
		const result = await downloadAsZip([folder], client, {
			signal: controller.signal,
			onProgress: () => {}
		});

		expect(result.blob).toBeInstanceOf(Blob);
		expect(result.filesWritten).toBe(1);
		expect(result.failures).toHaveLength(1);
		const reader = new ZipReader(new BlobReader(result.blob!));
		const entries = await reader.getEntries();
		expect(entries.map((entry) => entry.filename)).toEqual([
			'photos/',
			'photos/good.txt',
			'DOWNLOAD-REPORT.txt'
		]);
		expect('getData' in entries[1]).toBe(true);
		expect('getData' in entries[2]).toBe(true);
		if (!('getData' in entries[1]) || !('getData' in entries[2])) throw new Error('Expected file entries in ZIP');
		const data = await entries[1].getData(new TextWriter());
		const report = await entries[2].getData(new TextWriter());
		expect(data).toBe('data');
		expect(report).toContain('photos/unavailable.txt: Simulated file failure');
		await reader.close();
	});

	it('writes directly to a supplied stream without returning a complete Blob', async () => {
		const chunks: Uint8Array[] = [];
		const output = new WritableStream<Uint8Array>({ write(chunk) { chunks.push(chunk); } });
		const client = {
			listChildren: async () => [],
			fetchFile: async () => new Response('direct stream')
		} as unknown as OneDriveClient;
		const result = await downloadAsZip([{ id: 'one', name: 'one.txt', size: 13 }], client, {
			signal: new AbortController().signal,
			output,
			onProgress: () => {}
		});

		expect(result.blob).toBeUndefined();
		const zipBlob = new Blob(chunks.map((chunk) => new Uint8Array(chunk).buffer as ArrayBuffer));
		const reader = new ZipReader(new BlobReader(zipBlob));
		const entries = await reader.getEntries();
		expect(entries.map((entry) => entry.filename)).toEqual(['one.txt']);
		await reader.close();
	});

	it('salvages successful entries after a response stream fails mid-file', async () => {
		let sentChunk = false;
		const failingStream = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (!sentChunk) {
					sentChunk = true;
					controller.enqueue(new TextEncoder().encode('partial'));
				}
				else {
					controller.error(new Error('simulated mid-file failure'));
				}
			}
		});
		const client = {
			listChildren: async () => [],
			fetchFile: async (item: DriveItem) => item.id === 'broken'
				? new Response(failingStream)
				: new Response('complete')
		} as unknown as OneDriveClient;
		const result = await downloadAsZip([
			{ id: 'good', name: 'good.txt' },
			{ id: 'broken', name: 'broken.txt' }
		], client, { signal: new AbortController().signal, onProgress: () => {} });

		const reader = new ZipReader(new BlobReader(result.blob!));
		const entries = await reader.getEntries();
		expect(entries.map((entry) => entry.filename)).toEqual(['good.txt', 'DOWNLOAD-REPORT.txt']);
		expect(result.failures[0].path).toBe('broken.txt');
		await reader.close();
	});

	it('aborts direct output and exposes failures when every file is unavailable', async () => {
		let abortReason: unknown;
		const output = new WritableStream<Uint8Array>({
			abort(reason) { abortReason = reason; }
		});
		const client = {
			listChildren: async () => [],
			fetchFile: async () => { throw new Error('Access was revoked'); }
		} as unknown as OneDriveClient;

		await expect(downloadAsZip([{ id: 'lost', name: 'lost.txt' }], client, {
			signal: new AbortController().signal,
			output,
			onProgress: () => {}
		})).rejects.toMatchObject({ name: 'ArchiveNoFilesError', failures: [{ path: 'lost.txt' }] });
		expect(abortReason).toBeInstanceOf(Error);
	});
});
