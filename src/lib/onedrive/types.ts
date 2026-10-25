export interface DriveItem {
	id: string;
	name: string;
	size?: number;
	file?: { mimeType?: string };
	folder?: { childCount?: number };
	package?: { type?: string };
	lastModifiedDateTime?: string;
	webUrl?: string;
	thumbnails?: DriveThumbnailSet[];
	'@microsoft.graph.downloadUrl'?: string;
}

export interface DriveThumbnail {
	url?: string;
	width?: number;
	height?: number;
}

export interface DriveThumbnailSet {
	small?: DriveThumbnail;
	medium?: DriveThumbnail;
	large?: DriveThumbnail;
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
