import { resolve } from '$app/paths';
import type { AccountInfo, AuthenticationResult, PublicClientApplication } from '@azure/msal-browser';
import type { DriveAccount } from './types';

const SCOPES = ['Files.Read'];

export interface OneDriveAuth {
	accounts(): DriveAccount[];
	login(): Promise<void>;
	connectAnother(): Promise<void>;
	getToken(accountId: string): Promise<string>;
	removeAccount(accountId: string): Promise<void>;
}

function toDriveAccount(account: AccountInfo): DriveAccount {
	return {
		homeAccountId: account.homeAccountId,
		localAccountId: account.localAccountId,
		username: account.username,
		name: account.name
	};
}

export async function createOneDriveAuth(
	onResult: (accounts: DriveAccount[], activeAccountId?: string) => void
): Promise<OneDriveAuth> {
	const clientId = import.meta.env.PUBLIC_MICROSOFT_CLIENT_ID?.trim();
	if (!clientId) throw new Error('Microsoft sign-in is not configured yet. Add PUBLIC_MICROSOFT_CLIENT_ID to the build environment.');

	const { PublicClientApplication, BrowserCacheLocation, InteractionRequiredAuthError } =
		await import('@azure/msal-browser');
	const redirectUri =
		import.meta.env.PUBLIC_MICROSOFT_REDIRECT_URI?.trim() ||
		`${window.location.origin}${resolve('/')}`;
	const instance: PublicClientApplication = new PublicClientApplication({
		auth: {
			clientId,
			authority: 'https://login.microsoftonline.com/consumers/',
			redirectUri
		},
		cache: {
			cacheLocation: BrowserCacheLocation.LocalStorage
		}
	});

	await instance.initialize();
	let redirectResult: AuthenticationResult | null = null;
	try {
		redirectResult = await instance.handleRedirectPromise();
	} catch {
		// A failed sign-in must not prevent the app from showing cached connections.
	}
	if (redirectResult?.account) instance.setActiveAccount(redirectResult.account);

	const listAccounts = () => instance.getAllAccounts().map(toDriveAccount);
	const notify = (active?: AccountInfo | null) => {
		const accounts = listAccounts();
		const activeId = active?.homeAccountId ?? instance.getActiveAccount()?.homeAccountId;
		onResult(accounts, activeId);
	};
	notify(redirectResult?.account);

	return {
		accounts: listAccounts,
		async login() {
			await instance.loginRedirect({
				scopes: SCOPES,
				prompt: 'select_account',
				redirectUri
			});
		},
		async connectAnother() {
			await instance.loginRedirect({
				scopes: SCOPES,
				prompt: 'select_account',
				redirectUri
			});
		},
		async getToken(accountId: string) {
			const account = instance.getAllAccounts().find((candidate) => candidate.homeAccountId === accountId);
			if (!account) throw new Error('This Microsoft account is no longer connected. Reconnect it to continue.');
			try {
				const result = await instance.acquireTokenSilent({ account, scopes: SCOPES });
				return result.accessToken;
			} catch (error) {
				if (error instanceof InteractionRequiredAuthError) {
					throw new Error('Microsoft needs you to reconnect this account. Select Reconnect to continue.');
				}
				throw error;
			}
		},
		async removeAccount(accountId: string) {
			const account = instance.getAllAccounts().find((candidate) => candidate.homeAccountId === accountId);
			if (account) await instance.clearCache({ account });
			const active = instance.getActiveAccount();
			if (active?.homeAccountId === accountId) instance.setActiveAccount(null);
			notify();
		}
	};
}
