import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { OneDriveClient } from '../onedrive/client';
import type { DriveItem } from '../onedrive/types';

export interface DownloadFailure {
	path: string;
	message: string;
}

export interface DownloadProgress {
	phase: 'discovering' | 'downloading' | 'finalizing';
	filesDone: number;
	filesTotal: number;
	bytesDone: number;
	bytesTotal: number;
	unknownSizeCount: number;
	currentPath?: string;
}

export interface ArchiveOptions {
	signal: AbortSignal;
	output?: WritableStream<Uint8Array>;
	onProgress: (progress: DownloadProgress) => void;
}

export interface ArchiveResult {
	blob?: Blob;
	filesWritten: number;
	bytesWritten: number;
	failures: DownloadFailure[];
	partialEntryWarning: boolean;
}

export class ArchiveNoFilesError extends Error {
	constructor(readonly failures: DownloadFailure[]) {
		super('No files could be added to the archive. Check the report and reconnect if needed.');
		this.name = 'ArchiveNoFilesError';
	}
}

interface ArchiveEntry {
	item: DriveItem;
	path: string;
	directory: boolean;
}

export function safeArchiveSegment(input: string): string {
	let cleaned = input
		.replace(/[\\/<>:"|?*\u0000-\u001f\u007f]/g, '_')
		.replace(/[. ]+$/g, '')
		.trim();
	if (!cleaned || cleaned === '.' || cleaned === '..') return '_';
	if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(cleaned)) cleaned = `_${cleaned}`;
	return cleaned;
}

function uniqueArchivePath(path: string, used: Set<string>): string {
	if (!used.has(path)) {
		used.add(path);
		return path;
	}
	const slash = path.lastIndexOf('/');
	const directory = slash >= 0 ? path.slice(0, slash + 1) : '';
	const filename = slash >= 0 ? path.slice(slash + 1) : path;
	const dot = filename.lastIndexOf('.');
	const stem = dot > 0 ? filename.slice(0, dot) : filename;
	const extension = dot > 0 ? filename.slice(dot) : '';
	let index = 2;
	let candidate = `${directory}${stem} (${index})${extension}`;
	while (used.has(candidate)) candidate = `${directory}${stem} (${++index})${extension}`;
	used.add(candidate);
	return candidate;
}

async function discoverEntries(
	selected: DriveItem[],
	client: OneDriveClient,
	signal: AbortSignal,
	onProgress: ArchiveOptions['onProgress']
): Promise<{ entries: ArchiveEntry[]; failures: DownloadFailure[] }> {
	const entries: ArchiveEntry[] = [];
	const failures: DownloadFailure[] = [];
	const used = new Set<string>();
	const visitedFolders = new Set<string>();
	let visited = 0;

	const walk = async (item: DriveItem, requestedPath: string): Promise<void> => {
		if (signal.aborted) throw signal.reason ?? new DOMException('Operation cancelled', 'AbortError');
		const path = uniqueArchivePath(requestedPath, used);
		if (item.folder || item.package) {
			entries.push({ item, path, directory: true });
			if (visitedFolders.has(item.id)) {
				failures.push({ path, message: 'Folder cycle detected; this location was not traversed again.' });
				return;
			}
			visitedFolders.add(item.id);
			try {
				const children = await client.listChildren(item.id, signal);
				for (const child of children) {
					await walk(child, `${path}/${safeArchiveSegment(child.name)}`);
					visited += 1;
					if (visited % 25 === 0) {
						onProgress({ phase: 'discovering', filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0, unknownSizeCount: 0, currentPath: path });
					}
				}
			} catch (error) {
				if (signal.aborted) throw error;
				failures.push({ path, message: errorMessage(error) });
			}
		}
		else {
			entries.push({ item, path, directory: false });
		}
	};

	for (const item of selected) await walk(item, safeArchiveSegment(item.name));
	return { entries, failures };
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return 'The item could not be processed.';
}

function reportText(failures: DownloadFailure[], partialEntryWarning: boolean): string {
	const lines = [
		'Cloud Browser download report',
		'',
		`Items omitted or incomplete: ${failures.length + (partialEntryWarning ? 1 : 0)}`,
		...failures.map(({ path, message }) => `- ${path}: ${message.replace(/[\r\n]/g, ' ')}`)
	];
	if (partialEntryWarning) {
		lines.push('- One or more archive entries may be incomplete; inspect the listed omissions before using this ZIP.');
	}
	return `${lines.join('\n')}\n`;
}

export async function downloadAsZip(
	selected: DriveItem[],
	client: OneDriveClient,
	options: ArchiveOptions
): Promise<ArchiveResult> {
	const { entries, failures } = await discoverEntries(selected, client, options.signal, options.onProgress);
	const files = entries.filter((entry) => !entry.directory);
	const bytesTotal = files.reduce((sum, entry) => sum + (entry.item.size ?? 0), 0);
	const unknownSizeCount = files.filter((entry) => entry.item.size === undefined).length;
	const blobWriter = options.output ? undefined : new BlobWriter('application/zip');
	const zipWriter = new ZipWriter(options.output ?? blobWriter!, {
		level: 0,
		keepOrder: true,
		bufferedWrite: true
	});
	let filesDone = 0;
	let bytesDone = 0;
	let filesWritten = 0;
	let partialEntryWarning = false;

	try {
		for (const entry of entries) {
			if (options.signal.aborted) throw options.signal.reason ?? new DOMException('Operation cancelled', 'AbortError');
			if (entry.directory) {
				await zipWriter.add(`${entry.path}/`, null, { directory: true });
				continue;
			}

			options.onProgress({
				phase: 'downloading',
				filesDone,
				filesTotal: files.length,
				bytesDone,
				bytesTotal,
				unknownSizeCount,
				currentPath: entry.path
			});
			try {
				const response = await client.fetchFile(entry.item, options.signal);
				if (!response.body) throw new Error('The download did not include a file body.');
				await zipWriter.add(entry.path, response.body, {
					bufferedWrite: true,
					signal: options.signal
				});
				filesWritten += 1;
				bytesDone += entry.item.size ?? Number(response.headers.get('content-length') ?? 0);
			} catch (error) {
				if (options.signal.aborted) throw error;
				partialEntryWarning ||= Boolean(zipWriter.hasCorruptedEntries);
				failures.push({ path: entry.path, message: errorMessage(error) });
			}
			filesDone += 1;
		}

		if (filesWritten === 0 && files.length > 0) {
			throw new ArchiveNoFilesError(failures);
		}

		if (failures.length > 0 || partialEntryWarning) {
			const used = new Set(entries.map((entry) => entry.path));
			const reportPath = uniqueArchivePath('DOWNLOAD-REPORT.txt', used);
			await zipWriter.add(reportPath, new TextReader(reportText(failures, partialEntryWarning)));
		}

		options.onProgress({
			phase: 'finalizing',
			filesDone,
			filesTotal: files.length,
			bytesDone,
			bytesTotal,
			unknownSizeCount
		});
		await zipWriter.close();
		const blob = blobWriter ? await blobWriter.getData() : undefined;
		return { blob, filesWritten, bytesWritten: bytesDone, failures, partialEntryWarning };
	} catch (error) {
		if (options.signal.aborted || options.output) {
			try {
				await options.output?.abort(options.signal.reason ?? error);
			} catch {
				// The browser may already have closed the output stream.
			}
		}
		throw error;
	}
}
