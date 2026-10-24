declare global {
	namespace App {}
	interface ImportMetaEnv {
		readonly PUBLIC_MICROSOFT_CLIENT_ID?: string;
		readonly PUBLIC_MICROSOFT_REDIRECT_URI?: string;
	}
}

declare global {
	interface Window {
		showSaveFilePicker?: (options?: {
			suggestedName?: string;
			types?: Array<{ description?: string; accept: Record<string, string[]> }>;
		}) => Promise<FileSystemFileHandle>;
	}
}

export {};
