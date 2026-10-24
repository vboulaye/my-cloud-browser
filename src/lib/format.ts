export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function formatDate(value?: string): string {
	if (!value) return '—';
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? '—'
		: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
