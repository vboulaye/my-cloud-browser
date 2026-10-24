# Cloud Browser

A static SvelteKit app for browsing and downloading personal cloud-drive files. The first implementation pass targets personal OneDrive accounts; Google Drive remains planned but is not yet implemented.

## Development

```sh
npm install
cp .env.example .env
# Set PUBLIC_MICROSOFT_CLIENT_ID after creating a Microsoft Entra SPA registration.
npm run dev
```

See [the OneDrive setup page](src/routes/docs/onedrive-setup/+page.svelte) and [project intent](docs/project-intent.md) for scope and permissions. Without a client ID, the app displays setup guidance; automated tests and the static build do not require an account.

## Commands

- `npm run check` — Svelte and TypeScript checks
- `npm test` — unit tests for Graph requests and ZIP failure handling
- `npm run build` — prerender to the static `build/` directory

`BASE_PATH` can be supplied at build time for a GitHub Pages project site. For a root custom domain, leave it unset. Public configuration is compiled into the browser bundle; never add a client secret.

## Current scope

- Microsoft delegated `Files.Read` only
- Multiple personal Microsoft accounts, account switching, and local disconnect
- Folder browsing, pagination, current-folder selection, recursive ZIP download
- Direct-to-disk output where the browser supports it, Blob download fallback otherwise
- Partial ZIPs with an omission report for failed items

Google Drive, uploads, writes, folder search, shared-drive support, and guaranteed background downloads are not implemented.
