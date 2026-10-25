# Cloud Browser

A static SvelteKit app for browsing and downloading personal cloud-drive files. The first implementation pass targets personal OneDrive accounts; Google Drive remains planned but is not yet implemented.

## Development

```sh
npm install
cp .env.example .env
# Add PUBLIC_MICROSOFT_CLIENT_ID to .env (instructions below).
npm run dev
```

Without a client ID, the app displays setup guidance; automated tests and the static build do not require a Microsoft account.

## Set up the Microsoft client ID

The client ID comes from a Microsoft Entra **app registration**. This is a public-client registration for a browser app—not a password or secret from your OneDrive account.

1. Open the [Microsoft Entra admin center](https://entra.microsoft.com/) and create a new app registration.
2. Choose an account type that supports personal Microsoft accounts. Select **Personal Microsoft accounts only** if that option is available; otherwise choose the offered audience that includes personal Microsoft accounts.
3. In the registration's **Authentication** settings, add a **Single-page application (SPA)** platform and its redirect URI. The URI must exactly match where the app is running:
   - Local development: `http://localhost:5173/`
   - GitHub Pages with a custom domain: `https://your-domain.example/`
   - A GitHub Pages repository URL: `https://your-name.github.io/your-repository/`

   Register each environment's URI separately. Keep the trailing slash if it appears in the example. The deployed site must also be available over HTTPS.
4. In **API permissions**, add **Microsoft Graph → Delegated permissions → `Files.Read`**. Do not add application permissions or write permissions for this read-only version.
5. Copy the registration's **Application (client) ID**. Do not create a client secret.

### Local development

Put the ID in the ignored `.env` file created above:

```dotenv
PUBLIC_MICROSOFT_CLIENT_ID=your-application-client-id
```

For local development, MSAL uses `http://localhost:5173/` as the redirect URI by default. If the registered local URI differs, configure the exact registered URI too:

```dotenv
PUBLIC_MICROSOFT_REDIRECT_URI=http://localhost:5173/
```

Restart the dev server after changing `.env`. These values are embedded in the browser build. A client ID is public configuration, but **never put a client secret, password, or access token in `.env` or the app**.

### GitHub Pages deployment

The included Pages workflow reads the client ID from a GitHub Actions **repository variable**:

1. Open the GitHub repository's **Settings → Secrets and variables → Actions → Variables**.
2. Add a variable named `PUBLIC_MICROSOFT_CLIENT_ID` with the Application (client) ID.
3. If the deployed redirect URI is not the site's root plus its Pages base path, add `PUBLIC_MICROSOFT_REDIRECT_URI` with the exact registered URI. Otherwise the app constructs it from the deployed site origin and base path.
4. Push to `main` or manually run the **Deploy static site to GitHub Pages** workflow to rebuild and deploy.

These are public build-time values, so use **Variables**, not a client secret. Configure the custom domain in GitHub Pages before registering that final redirect URI in Entra. If the ID or URI changes, redeploy the site so the browser bundle receives the updated configuration.

For the shorter in-app checklist, see [OneDrive setup](src/routes/docs/onedrive-setup/+page.svelte). Permission and product decisions are recorded in [project intent](docs/project-intent.md).

## Commands

- `npm run check` — Svelte and TypeScript checks
- `npm test` — unit tests for Graph requests and ZIP failure handling
- `npm run test:browser` — browser smoke test for folder names and navigation (requires Google Chrome; set `CHROME_BIN` if it is elsewhere)
- `npm run build` — prerender to the static `build/` directory

`BASE_PATH` can be supplied at build time for a GitHub Pages project site. For a root custom domain, leave it unset. Public configuration is compiled into the browser bundle; never add a client secret.

## Current scope

- Microsoft delegated `Files.Read` only
- Multiple personal Microsoft accounts, account switching, and local disconnect
- Folder browsing, pagination, current-folder selection, recursive ZIP download
- Direct-to-disk output where the browser supports it, Blob download fallback otherwise
- Partial ZIPs with an omission report for failed items

Google Drive, uploads, writes, folder search, shared-drive support, and guaranteed background downloads are not implemented.
