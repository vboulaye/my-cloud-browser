export interface DriveItem {
	id: string;
	name: string;
	size?: number;
	file?: { mimeType?: string };
	folder?: { childCount?: number };
	package?: { type?: string };
	lastModifiedDateTime?: string;
	webUrl?: string;
	'@microsoft.graph.downloadUrl'?: string;
}

export interface DriveAccount {
	homeAccountId: string;
	localAccountId: string;
	username: string;
	name?: string;
}

export interface Breadcrumb {
	id: string;
	name: string;
}
