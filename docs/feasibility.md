# Cloud Browser — feasibility assessment

Research date: **2026-10-24**. Requirements: [project-intent.md](project-intent.md). This report evaluates the agreed public, read-only, personal-account product; it does not authorize implementation or changes to its scope.

**Evidence labels:** **Verified** means supported by the cited current primary documentation, not tested against a live account. **Inference** is an architectural or policy interpretation. **Recommendation** is a proposed implementation/product choice. No provider registrations, user credentials, live OAuth flows, or authenticated downloads were used for this assessment. Companion [browser-download-feasibility.md](browser-download-feasibility.md) covers static hosting and ZIP/mobile research in more detail and separately identifies its synthetic experiment.

## 1. Executive conclusion

**The static architecture is technically feasible, but public Google launch and mobile ZIP reliability are gates, not solved implementation details.** No documented requirement forces an app-controlled backend for the agreed interactive browsing/download flows. A backend would materially change privacy and Google review considerations.

| Requirement | Assessment | Important qualification |
| --- | --- | --- |
| Public personal OneDrive, read-only full hierarchy | Supported by documented SPA authentication and Graph APIs | Use delegated `Files.Read`, not write or application permissions. |
| Public personal Google Drive, read-only full hierarchy | Technically supported, with a significant launch-review dependency | `drive.readonly` is **restricted**; public availability requires scope verification unless an applicable exemption exists. This public product is not a personal-use app merely because its users have personal accounts. |
| Multiple accounts per provider | Supported building blocks; app must implement account isolation | Microsoft exposes an account cache; Google GIS returns individual tokens, not a comparable persistent multi-account token cache. |
| Remember connections | Feasible as remembered identities plus provider-dependent authorization | Google browser token flow supplies **no refresh token**; Microsoft SPA refresh tokens have a non-sliding 24-hour lifetime. Reconnect must be normal UX. |
| Docs/Sheets/Slides → Office formats | Documented exports | `files.export` limits each exported response to **10 MB**. This is not a 10 MB ZIP limit and is not an app-defined cap. |
| One ZIP, browser-only, mobile, warning without hard cap | Plausible at expected small scale | Streaming ZIP construction does not guarantee streaming to disk or survivability under mobile suspension/memory pressure. Real-device testing remains required. |
| GitHub Pages | Supported static host | Fix the exact origin/base path, generate actual callback files, and resolve Google's domain-verification requirements before registration. |

Sources for this summary are detailed below: [Microsoft SPA protocol][M1], [Graph listing][M6], [Google scopes][G1], [GIS token model][G2], [token lifetimes][M4], [Google exports][G8], [SvelteKit static deployment][H1].

### Highest-priority decisions

**Confirmed after review:** The user accepts explicit Google reconnect on return/reload or token expiry and omission of oversized standard Google exports with a clear report. A larger-export alternative is not required for v1. These decisions are recorded in [project-intent.md](project-intent.md).

1. **Keep full-drive Google scope for now**, and seek approval for the exact browser-only architecture. Do not assume that restricted scope automatically means a paid annual security assessment, or that static hosting automatically exempts the app from all review.
2. **Implement the accepted explicit Google “Reconnect” behavior** on return/token expiry when implementation begins. If automatic unattended renewal becomes mandatory later, reopen the backend/privacy decision rather than trying to persist a nonexistent GIS refresh token.
3. **Choose the exact production URL before registration.** The user has confirmed GitHub Pages with a custom domain and no existing Microsoft or Google registrations. A dedicated custom subdomain provides useful origin isolation; the actual domain and registration owners still need to be supplied.
4. **Prototype two-account auth and real API downloads before a full UI**, then test mobile archive creation/saving. Passing documentation review is not equivalent to passing the acceptance scenarios.

## 2. Microsoft personal OneDrive

### 2.1 Registration and SPA authentication

**Verified:** Microsoft supports authorization-code flow with PKCE for SPAs. A browser redirect URI must be registered as type **Single-page application / `spa`**, which enables the appropriate token-endpoint CORS behavior. PKCE is required for SPA code flow; a public client must not send a client secret. Microsoft recommends using its authentication library rather than manually implementing the protocol. [M1]

**Verified:** The registration quickstart lists **Personal accounts only** among supported account types. The MSAL authority `https://login.microsoftonline.com/consumers/` targets personal Microsoft accounts. There is a documentation inconsistency: the more general MSAL configuration article still says personal-only requires a mixed organizational/personal registration plus `consumers`, whereas the registration quickstart explicitly offers personal-only. [M2, M3]

**Recommendation:** Select **Personal accounts only** where available and use `consumers`. Confirm the effective sign-in audience with a real personal account in the registration spike. Do not copy a workforce-only SPA tutorial's single-tenant defaults or promise work/school support. Creating/owning the registration requires suitable access to an Entra tenant; this is an operator setup task, not something each end user should do. [M2]

**Verified:** `@azure/msal-browser` is the Microsoft-supported framework-independent browser package, implements code flow with PKCE, and supports operation without a backend. It does not support the old implicit flow. There is no need to adopt React or Angular to use it from Svelte. [M0]

**Current-version trap:** MSAL Browser **v5** introduces a redirect bridge page. Microsoft's current bridge guide requires that page to broadcast the auth response, avoid ordinary auth guards/API initialization, match the registered redirect URI exactly, and **not** be served with a `Cross-Origin-Opener-Policy` header. Its Vite example is a plain Vite multi-page setup, not a drop-in SvelteKit configuration. [M9]

**Recommendation:** Pin the SDK version selected for the prototype and use that version's callback instructions. For v5, produce a real, independently reachable bridge page under the deployment base path; verify its bundling with SvelteKit. Do not rely on an SPA 404 fallback or blindly copy an older `handleRedirectPromise`/blank-page recipe into v5.

### 2.2 Minimum permissions

**Verified:** Both listing drive children and downloading file content name delegated **`Files.Read`** as least privileged for personal Microsoft accounts. The permissions reference explicitly states that personal-account `Files.Read` also grants access to files shared with the signed-in user, and that admin consent is not required for this delegated permission. [M6, M7, M8]

**Recommendation:** Request Graph **`Files.Read`** for v1. Do not request `Files.Read.All`, `Files.ReadWrite`, `Sites.Read.All`, application permissions, or a legacy OneDrive scope without a demonstrated endpoint requirement. Identity/session scopes are a separate concern: `openid` supports identity tokens and `offline_access` enables refresh-token issuance; use MSAL's supported behavior rather than manipulating refresh tokens. Do not retain the template's `User.Read` just out of habit: request it only if an actual profile endpoint needs it. Account labels can initially use MSAL's returned account information. [M1, M5, M8]

`Files.Read` does not remove item-specific access restrictions or guarantee every shared/linked object behaves like an owned folder. Those remain traversal/error-policy cases, not a reason to preemptively ask for write access.

### 2.3 Multiple accounts and persistence

**Verified:** MSAL exposes `getAllAccounts()`, account filtering, an active account, and account-specific token acquisition. Multiple cached accounts result from interactive requests in which users select different accounts. `prompt: "select_account"` can request the chooser; cached account ordering is not stable and local account state does not prove a valid server session. [M5]

**Recommendation:** Add each account through an explicit action with an account chooser; identify it using returned provider account identifiers, not an array position. Always pass the intended `account` into token requests, even if the UI also maintains an active account. Key listings, breadcrumbs, selections, errors, and jobs by provider and account. Bind a download job to its originating account rather than consulting mutable global selection during execution. Serialize interactive authentication to prevent competing popups/callbacks.

**Verified:** MSAL's default cache is `sessionStorage`; `localStorage` and memory storage are options. Current caching documentation says that, starting in v4, local-storage auth artifacts are encrypted with a key whose base material is in a session cookie, except for “Keep me signed in” behavior. It explicitly says local-storage auth artifacts normally **do not survive browser closure unless the user selected Keep me signed in**. Encryption is not protection against same-origin XSS. [M10]

**Recommendation:** Do not equate `cacheLocation: localStorage` with indefinite login. Let MSAL manage its own cache. Store a small separate remembered-connection record only if needed to show a disconnected identity after credential loss; disclose that it is personal data and delete it on disconnect. Test KMSI accepted/declined, browser restart, private browsing, cleared storage, and multiple tabs with the chosen release.

### 2.4 Renewal and disconnect

**Verified:** Microsoft's SPA refresh-token lifetime is **24 hours**, non-sliding: refreshing produces a replacement with the remaining original lifetime, not another fresh 24 hours. After expiry, another authorization-code flow is necessary. `acquireTokenSilent` can use cached access tokens, refresh tokens, then an iframe authorization attempt. Third-party-cookie restrictions can prevent the last step, requiring a top-level navigation or popup; a provider session may make that interaction passwordless, but silent renewal is never guaranteed. [M1, M4]

**Recommendation:** Acquire a token immediately before provider operations, retry an expired-token request through the SDK, and present reconnect when interaction is required. Never trigger an unsolicited popup deep inside a long ZIP task. Pause the task and ask for a user click; preserve its original account binding.

**Verified:** MSAL documents local-only logout by returning `false` from `onRedirectNavigate` after cache clearing; full logout also visits the provider logout endpoint. Logout requests can target a particular account. Local logout deliberately leaves the provider session alive. [M11]

**Recommendation:** Make **Disconnect this account** local-only by default, clearing that account's credentials and all app state for it through supported SDK APIs. Treat provider-wide sign-out or consent revocation as distinct actions/help links, not implied effects of disconnect. Test that disconnecting account A does not erase account B.

## 3. Google Drive: authorization and public-launch policy

### 3.1 Browser token model versus a backend

**Verified:** GIS `google.accounts.oauth2.initTokenClient` is Google's supported browser token model. It returns an access token in a JavaScript callback and supports REST/CORS calls to Google APIs. The guide describes this as based on the implicit grant, but it is the GIS dialog/callback model, not a recommendation to place raw access tokens in application URL fragments. Only dialog UX is supported by this token model. [G2]

**Verified:** Google's authorization-model comparison explicitly says **no refresh token** is issued in the browser token model; its documented authorization-code model requires a backend endpoint and refresh-token storage. Access tokens are short-lived, with `expires_in` in the response. To replace an expired browser token, the token-model guide calls for `requestAccessToken()` from a **user-driven event**. Prior consent persists per user/client ID, but persisted consent is not a persisted access token or automatic renewal service. [G2, G3, G4]

**Recommendation:** Keep Google access tokens in memory. Persist remembered account labels/provider identity hints only, with disclosure and local deletion. On reload, show remembered connections as needing authorization until a user obtains a fresh token. During long jobs, pause for reconnect on expiry. Do not promise silent sign-in at page load, unattended background access, or an MSAL-style refresh-token cache. `prompt: ''` can avoid unnecessary consent/chooser screens for an already authorized account; it does not manufacture a refresh token or remove popup/user-gesture constraints. [G2, G4]

**Inference:** The requirement's qualified “remember connections where provider-supported” is compatible with this UX. A requirement to restore Google authorization automatically across arbitrary visits would **not** be met by the proposed static GIS flow. A backend code flow would be an explicit architectural change, with secure token storage, operational obligations, and a fresh assessment of restricted-data handling. [G3, G5]

### 3.2 Multiple Google accounts and reliable identity

**Verified:** GIS token configuration supports `prompt: 'select_account'` (the documented default), a `login_hint` accepting an email or ID-token `sub`, and request-specific overrides. Its `TokenResponse` contains token, expiry and scopes, but does **not** document an email, stable user ID, or ID token. Authentication and API authorization are separate GIS concerns. [G3, G4]

**Verified:** Drive `about` exposes the authenticated `user`, and the Drive `User` resource exposes `permissionId`, `displayName`, and, where available, `emailAddress`. `about` also exposes supported `exportFormats`; `about.get` accepts `drive.readonly` and requires a `fields` parameter. [G12, G13, G23]

**Recommendation:** Obtain the actual Drive user after every successful authorization, using `about.get(fields=user,exportFormats)` with the granted Drive scope. Use the returned Drive identity to deduplicate and bind tokens, and display the available name/email. Do not assign a token to the account the user *intended* to reconnect merely because that account supplied the `login_hint`; confirm the returned identity. Hints are UX inputs, not credentials. No additional Google profile scope is necessary solely to label a Drive connection if this response suffices; verify the response in the auth spike.

Maintain separate token/expiry records for each connected Google account in memory. Returning to the page may require one explicit authorization interaction per account as it is used. Do not use undocumented Google session indices or scrape account chooser state.

**Verified:** `google.accounts.oauth2.revoke(validAccessToken, callback)` revokes **all scopes granted to this app for that user**; it is not merely local disconnection and requires a valid access token. [G2, G4]

**Recommendation:** Distinguish **Disconnect locally** from **Revoke Google access**. Local disconnect removes identity hints, tokens and cached metadata; optionally offer revocation with clear consequences. Revocation should not be confused with signing out of Google globally.

### 3.3 Full hierarchy requires the restricted read scope

**Verified:** Google classifies `https://www.googleapis.com/auth/drive.readonly` (“View and download all your Drive files”) as **Restricted**. `drive.metadata.readonly` is also restricted and is insufficient for file-content downloads. `files.export` accepts `drive.readonly`; separate Docs, Sheets and Slides API permissions are not needed just to export through Drive. [G1, G8, G9]

**Verified:** `drive.file` is **Non-sensitive**, but grants per-file access to app-created files or files the user opens/shares with the app through Picker or a comparable supported interaction. It also permits creating/modifying those files; it is not a restricted-scope-free version of “read all existing Drive contents.” Google's description that it works with all REST resources does not expand the accessible set of files. [G1]

**Inference:** `drive.readonly` is the minimum practical scope matching this project's arbitrary existing root hierarchy plus recursive downloads. A Picker-only `drive.file` product cannot be presented as equivalent. A chosen folder is not documented in the cited scope guide as automatically granting arbitrary recursive descendants; do not make that promise without separate evidence/testing. Combining `drive.file` with `drive.metadata.readonly` would still introduce a restricted scope, would still not grant blanket content access, and would increase the write authority on app-authorized files.

**Recommendation:** Prepare a scope justification tied to the actual UI: root browsing, unrestricted traversal of accessible My Drive children, recursive user-requested ZIP download, and read-only content export. Explain exactly why a per-file picker does not satisfy these requirements. Do not request the write-capable `drive` scope for future functionality.

### 3.4 Verification and security assessment are different gates

**Verified — scope review:** Public apps requesting restricted scopes must complete restricted-scope verification unless they qualify for an exception. Google requires an appropriate permitted application type, minimum-scope justification, accurate consent configuration, a public descriptive homepage, privacy policy, verified authorized domains, and a demonstration video covering the consent and scope-dependent features. Personal-use, testing, internal-organization and service-owned-data exemptions are not descriptions of this intended public consumer app. [G5, G6, G7]

**Verified — permitted-use boundary:** Drive's permitted types include productivity/educational applications interacting with Drive data through their UI, backup/sync applications, and reporting/security applications. Policy specifically prohibits using multiple accounts to bypass Drive limitations or abuse policies. Multiple legitimate personal connections are not themselves described as prohibited. [G1, G14]

**Inference:** A user-directed multi-provider file browser has a reasonable **productivity UI** justification; approval is not established by this report. Do not describe v1 as automatic backup if it only performs manual downloads, and do not position future transfers as a way around storage limits.

**Verified — server-data assessment trigger:** Google's current restricted-scope developer guide states: “**If you store or transmit restricted scope data on servers, then you need to complete a security assessment**.” Its security-assessment section applies to apps with the ability to access restricted data “**from or through a third-party server**.” The Drive scopes guide repeats the server-storage/transmission condition. [G5, G1]

**Exact browser-only exception implication:** That condition distinguishes a client that receives API data directly on the user's device, processes it locally, and writes a user-requested local ZIP from an app that sends files, metadata or credentials through an operator/backend/proxy. Merely serving static JavaScript from GitHub Pages does not mean the hosting service receives the Drive API responses. **Inference:** the intended strictly local/browser-only data path is a strong basis for being outside the documented server-data security-assessment trigger. It is **not** an exemption from restricted-scope classification, scope verification, Limited Use, secure-data handling, or Google deciding how the actual app is reviewed.

**Important evidence limitation:** The currently retrieved official Help Center verification/security-assessment pages use broader language saying restricted-scope apps undergo annual assessment, without spelling out a browser/local-device exception. The current developer guide is more specific about server access. The older widely linked `answer/9110914` now redirects to the new Help Center landing page; it cannot be cited as current evidence for an exact old “local storage only” FAQ sentence. Therefore this report does **not** claim that Google has preapproved this app's exemption, nor conclude that a paid assessment is definitely required. [G5, G15, G16]

**Recommendation:** Submit the actual data-flow description and ask the verification team to confirm assessment applicability. Include a diagram: **Google authorization → browser; Google Drive API → browser memory/temporary local storage → user's ZIP; GitHub Pages → static assets only**. Inventory not just file contents but account details, metadata, OAuth tokens, error reports, third-party scripts, service-worker bridges and any diagnostics. Avoid proxies, analytics, remote crash reports, hosted download relays, and token exchanges that change this description. Document local storage/temporary data deletion. If a later backend can access restricted data or tokens, revisit the determination before adding it. Broader security obligations still apply, including relevant Workspace requirements for secure transit and credentials at rest. [G14]

If Google requires an assessment after reviewing the app, determine the assigned process/tier and actual costs with Google/approved assessors; do not budget using unsourced blanket price estimates. Review timing is also not a guaranteed delivery date. [G5, G16]

### 3.5 Testing is not a production-access strategy

**Verified:** Unverified sensitive/restricted-scope apps face an unverified-app warning and a 100-new-user cap; the FAQ says the cap applies over the lifetime of the project and cannot be reset. Testing status limits availability to declared testers. These modes are suitable for a prototype, not an indefinitely open public service. [G5, G7, G17]

**Recommendation:** Use separate development and production Cloud projects as Google recommends. Do not interpret “In Production” as equivalent to verified scope approval. If verification proves impractical, obtain a product decision among:

- Continue seeking approval for the current browser-only, full-drive product.
- Explicitly reduce Google to user-picked files with `drive.file`, changing both read-only permission expectations and hierarchy/recursive-folder acceptance criteria.
- Defer public Google support and launch OneDrive first, changing the v1 requirement.
- Reopen deployment/backend architecture only for a demonstrated benefit; a backend **does not remove restricted-scope verification** and can add an assessment obligation.

None of those reductions is authorized by the existing intent.

## 4. Browsing, downloads and exports

### 4.1 Hierarchy and completeness

**Verified:** Graph exposes `/me/drive/root/children` and per-item `children`, with `@odata.nextLink` when additional pages exist (default listing page size documented as 200). Both folders and package facets can have children. [M6]

**Verified:** Drive `files.list` supports parent queries and pagination through `nextPageToken`; it returns trashed files by default unless excluded and exposes `incompleteSearch`. The folder guide defines `root` as an alias for the root folder's file ID; the search guide documents `'FOLDER_ID' in parents and trashed = false` for direct children, and explicitly says recursive descendants require client-side traversal rather than a single recursive query. [G10, G18, G22]

**Recommendation:** Use explicit child listing, `trashed = false`, `spaces=drive`, and appropriate user/My Drive corpus; follow all continuation tokens/links. Request the fields needed for pagination and type/capability handling, not only `files(...)`. Treat `incompleteSearch` or a failed later page as incomplete enumeration, not an empty or successful folder download. Defer a dedicated shared-with-me view as intended.

Shortcuts, remote/shared items and OneDrive packages require an explicit policy. Recommend showing them distinctly, following only supported targets with cycle detection and account-bound credentials, and reporting omissions. A recursive download is not an atomic snapshot: items may move/change or permissions may disappear during enumeration. This is a design constraint, not a reason to silently drop files.

### 4.2 OneDrive browser downloads: avoid the redirect trap

**Verified:** Graph `/content` returns a `302` to a preauthenticated download URL. Microsoft's JavaScript-specific guidance says not to use authenticated `/content` directly because the redirect interacts badly with CORS preflight. Instead, retrieve `@microsoft.graph.downloadUrl` from item metadata and fetch **that URL directly without the Authorization header**. The URL may expire within minutes and should be used immediately. Range requests apply to the actual download URL, and a server can ignore a range and return the full file. [M7]

**Recommendation:** Fetch fresh item download URLs near execution, not when initially listing a large hierarchy. Do not attach a Graph bearer token to an arbitrary content/CDN hostname. Treat these preauthenticated URLs as credentials: do not persist or log them, place them in error reports, or expose them to analytics. On expiration, refresh metadata with the original account and retry within a bounded policy. Verify CORS-readable bytes from the actual production origin on representative personal-account files before choosing the ZIP pipeline.

### 4.3 Google binary downloads and native exports

**Verified:** Binary files use Drive `files.get?alt=media`. Native Docs/Sheets/Slides use `files.export` with an output MIME type; `capabilities.canDownload` should be checked first. Metadata read-only scope cannot download content. API exports do not support partial byte-range downloads. [G8]

**Verified:** Google's token guide explicitly supports browser REST/CORS and says Google APIs support CORS by default, with bearer headers triggering a preflight. This is a documented basis for fetching Drive API media/export bytes, not proof that every alternate UI download URL is readable by `fetch`. [G2]

| Native type | Export MIME type | ZIP extension |
| --- | --- | --- |
| Google Docs | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `.docx` |
| Google Sheets | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `.xlsx` |
| Google Slides | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | `.pptx` |

These formats are explicitly listed in Google's export-format table. `about.exportFormats` can check supported exports for the user. Native document metadata size is not a reliable prediction of its converted Office byte length. Unsupported native types must be reported, not silently converted into arbitrary extensions. [G11, G12]

**Verified:** `files.export` is limited to **10 MB of exported content per file**. The limit is not a total archive limit, not a source-document storage-size test, and not something streaming/chunking that endpoint removes. [G8, G9]

**Newer API caveat:** Current Drive documentation also supports exporting Workspace content via `files.download` long-running operations, returning a `downloadUri`. It documents redirects for Docs/Sheets download links and caller-bound polling. The cited pages do **not** establish a universal unlimited-size export guarantee or browser-CORS behavior of every final redirect/download URL. [G8, G19]

**Recommendation:** Start with the documented media/export API path and transparently report `files.export` size failures. Evaluate `files.download` separately as a potential larger-export path before claiming the 10 MB limit applies to *all* Google export mechanisms or promising a workaround. Test final bytes, format, CORS/redirect behavior and account binding. Google UI `webContentLink` and `exportLinks` are documented for navigation/clickable downloads, not as guaranteed CORS-readable inputs to an in-browser ZIP; a manual link fallback is not equivalent to including the file in the promised single ZIP. Do not replace documented APIs with scraped `docs.google.com` download URLs. [G8, G19]

### 4.4 Errors, quota, cancellation and mobile

**Recommendation:** Distinguish individual file omissions (permission loss, unsupported export, size restriction, missing target), account-wide reconnect, transient throttling and fatal archive/output failure. Retry transient provider failures with bounded backoff; do not repeatedly retry permanent failures or an expired credential. Keep a visible omissions summary and safely named report in partial archives where finalization succeeds. Never mark a truncated traversal or corrupt archive as complete success.

See the [companion ZIP/mobile assessment](browser-download-feasibility.md) for library-specific evidence, recovery/buffering tradeoffs, save-picker support and test design. **Verified:** Chrome's file-system guide supports piping a response stream into a writable file handle and requires a user gesture to obtain that handle; it warns against waiting until after lengthy processing to call the save picker. Browser compatibility is not uniform. [H3]

**Recommendation:** Preserve the warning-only policy: warn on aggregate known bytes, item count, unknown export sizes and mobile/background risks, but do not add an arbitrary app cap. Use bounded concurrency and feature-detected output paths, with a Blob/save fallback where direct file writing is unavailable. Neither a stream-capable ZIP library nor a backend can guarantee arbitrary downloads on a suspended/terminated mobile page. Pause/reconnect/cancel must be deliberate states; do not promise resumability or ZIP salvage after fatal memory/process loss.

## 5. GitHub Pages, origins and public configuration

**Verified:** GitHub Pages serves static HTML/CSS/JavaScript; project sites normally use `https://<owner>.github.io/<repository>/`. SvelteKit's static adapter explicitly documents GitHub Pages, repository `paths.base`, and a `404.html` fallback. Pages supports owned custom domains. [H1, H2, H4]

**Recommendation:** Prerender the public homepage, privacy/help pages and real callback/bridge pages. Initialize providers and load user data in the browser, never during prerender/build. For v1, keep folder navigation in client state or query parameters on an existing page, rather than creating a server path for each remote folder. Do not use the URL fragment as an ad hoc folder router where it could interfere with the selected Microsoft SDK's callback processing. A fallback can help optional deep links, but OAuth redirects should land on an actual generated page with a successful response.

### Configuration inventory

| Setting | Required shape / recommendation |
| --- | --- |
| Canonical deployment | One stable HTTPS origin and base path; include repository subpath where applicable. Avoid changing domains mid-verification. |
| Microsoft registration | Personal-account audience; SPA platform; delegated `Files.Read`; exact SDK-compatible callback/bridge URL such as `https://cloud.example.com/auth/microsoft/` **only if that exact file/route is built and configured**. The hostname is illustrative, not the user's supplied domain. Register development URLs separately. |
| Microsoft client | Public client ID, `consumers` authority, exact registered redirect URI, chosen supported cache behavior. No secret. |
| Google project | Enable Drive API; external audience for consumer users; declare `drive.readonly`; accurate branding/contact details and authorized domains; production verification distinct from testing. |
| Google OAuth client | Web application client ID; Authorized JavaScript origin is the chosen custom HTTPS origin **without a path**. If a separate `github.io` deployment is ever authorized, its origin also excludes `/<repo>`. GIS token callback is JavaScript/dialog-based, not an app redirect endpoint; do not invent a required Google token callback path. |
| Any future Google code flow | Register its exact redirect URL and provide the documented backend; not part of this static proposal. |
| Homepage/privacy | Public, descriptive and same-domain privacy link matching consent configuration. Display access/storage/disconnect explanations before consent. |

Google's setup/reference documents distinguish an origin (scheme/hostname, and development port) from a full redirect URI; Microsoft requires registered redirect matching and correct SPA type. [G4, G20, G21, M1, M9]

### Domain verification and origin isolation

**Verified:** Google's branding guide requires verification of authorized domains through Search Console and asks for the **top private domain** (registrable component on a public suffix), covering homepage, privacy, origins and redirect domains. [G6]

**Evidence gap:** The actual custom domain and a real verification submission have not been examined. If a default `owner.github.io` deployment is considered later, its precise Console/Search Console treatment and accepted ownership proof would need separate validation. Do not conclude that users must own `github.io`, that Pages is incompatible with Google OAuth, or that serving `/repo/` proves domain ownership.

**Recommendation:** Prefer a dedicated owned subdomain such as `cloud.example.com` hosted on Pages; otherwise validate the exact GitHub hostname's accepted ownership-verification method early. A custom domain does not require an app backend. It also creates a useful security boundary: repository paths under one `owner.github.io` host share an origin, and browser storage is origin-scoped rather than repository-path-scoped. Isolate this credential-bearing app from unrelated same-origin scripts/sites. Do not treat key prefixes or paths as XSS isolation.

Pages' static hosting cannot execute a token exchange/proxy or make a client secret private. Do not assume SvelteKit server hooks can set runtime OAuth/security headers on Pages. Audit the deployed response headers and callback behavior; notably, MSAL v5's bridge must not have COOP. The exact CSP and response-header configuration remains an implementation/deployment check, not a resolved result of this research. [H2, M9]

**Verified:** GitHub states that Pages logs and stores visitor IP addresses for security regardless of GitHub sign-in. Therefore “no app-controlled telemetry” is a defensible claim; “no third party observes or logs anything” is not. Provider SDK/network behavior also needs accurate disclosure. [H2]

## 6. Blocking gates and evidence still needed

| Gate | What is established | What must be demonstrated before commitment |
| --- | --- | --- |
| Google public scope approval | Restricted scope, permitted-type and verification rules | Google accepts the exact productivity/full-drive use case and scope justification. Confirm browser-only assessment treatment with data-flow evidence. |
| Production domain/configuration | Pages and static OAuth are supported patterns | Exact URL, authorized-domain ownership, real callback files and successful production-origin auth. |
| Two-account isolation | SDK/API building blocks exist | Two personal accounts per provider, repeated add/switch/reconnect, duplicate detection and disconnect A without disturbing B. |
| Persistence expectations | Provider limits documented | Refresh/browser restart/24-hour boundary, third-party-cookie blocking, consent revocation, KMSI and storage loss in target browsers. |
| Download/export byte access | Documented direct API patterns | Actual production-origin CORS reads, OneDrive URL expiry, Google Office exports and >10 MB export failures; separately validate any LRO alternative. |
| Hierarchy completeness | Child APIs and pagination exist | Large paginated folders, denied subtrees, shortcuts/remote items, unsupported types and changed/deleted items without silent omission. |
| Mobile ZIP completion | Plausible strategy; no universal capacity guarantee | Real current iOS Safari and Android browser tests, output saving, cancellation, resource failures and background interruption. |

These are research/prototype gates, not reasons to ask for user passwords, deploy a backend unilaterally, silently weaken Google scope, or impose an app-defined hard cap.

### User/operator decisions needed

- Exact custom domain and production repository/site URL; custom-domain hosting is confirmed.
- Who owns the new Microsoft/Google registrations and support/privacy/contact material; neither registration exists yet.
- Willingness to pursue restricted-scope review and, **if Google actually requires one for this architecture**, the assigned assessment process.
- Exact target browser/device versions and acceptable behavior on mobile suspension.
- Shortcut/shared-folder/package traversal policy and how outside-root/unsupported targets are reported.
- Download job/account-switch policy, one-job-at-a-time default, warning thresholds, safe collision naming and report format, as already left open in the intent.

Resolved product decisions: explicit Google reconnect is acceptable, and oversized `files.export` failures may be reported as omissions in v1. Validated long-running-operation support is not a launch requirement.

## 7. Recommended next sequence

1. Resolve the URL/domain and registration ownership, without yet registering broader permissions.
2. Build a small browser-only feasibility spike under the real base path: MSAL version-appropriate callback/bridge, GIS token flow, two accounts per provider, account confirmation and local disconnect.
3. Validate read scope, hierarchy pagination, OneDrive direct download URL and Google media/export bytes from the deployed origin. Capture only sanitized results, never credentials/download URLs/user files.
4. Prepare Google review materials: actual UI demonstration, minimum-scope justification, permitted-type justification, privacy/Limited Use disclosures and browser-only data-flow inventory. Obtain a determination on security-assessment applicability rather than assuming either answer.
5. Exercise ZIP output and interruption cases on the agreed devices using the companion assessment's test matrix. Tune warnings/concurrency from measurements, not invented “safe” limits.
6. Only then finalize implementation scope and initial-load budget. Any scope/backend reduction must explicitly update [project-intent.md](project-intent.md) through a new decision.

## Primary sources

All sources below are first-party provider/framework/browser documentation or the provider-owned SDK repository, read on the research date. Dynamic documentation can change; approval and device behavior must still be established for the actual app.

[M0]: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/README.md
[M1]: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
[M2]: https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
[M3]: https://learn.microsoft.com/en-us/entra/identity-platform/msal-client-application-configuration
[M4]: https://learn.microsoft.com/en-us/entra/msal/javascript/browser/token-lifetimes
[M5]: https://learn.microsoft.com/en-us/entra/msal/javascript/browser/accounts
[M6]: https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0
[M7]: https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0
[M8]: https://learn.microsoft.com/en-us/graph/permissions-reference#filesread
[M9]: https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge
[M10]: https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching
[M11]: https://learn.microsoft.com/en-us/entra/msal/javascript/browser/logout
[G1]: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
[G2]: https://developers.google.com/identity/oauth2/web/guides/use-token-model
[G3]: https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model
[G4]: https://developers.google.com/identity/oauth2/web/reference/js-reference
[G5]: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
[G6]: https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
[G7]: https://support.google.com/cloud/answer/13464323?hl=en
[G8]: https://developers.google.com/workspace/drive/api/guides/manage-downloads
[G9]: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export
[G10]: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list
[G11]: https://developers.google.com/workspace/drive/api/guides/ref-export-formats
[G12]: https://developers.google.com/workspace/drive/api/reference/rest/v3/about
[G13]: https://developers.google.com/workspace/drive/api/reference/rest/v3/User
[G14]: https://developers.google.com/workspace/workspace-api-user-data-developer-policy
[G15]: https://support.google.com/cloud/answer/13464321?hl=en
[G16]: https://support.google.com/cloud/answer/13465431?hl=en
[G17]: https://support.google.com/cloud/answer/13463817?hl=en
[G18]: https://developers.google.com/workspace/drive/api/guides/folder
[G19]: https://developers.google.com/workspace/drive/api/guides/long-running-operations
[G20]: https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid
[G21]: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
[G22]: https://developers.google.com/workspace/drive/api/guides/search-files
[G23]: https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get
[H1]: https://svelte.dev/docs/kit/adapter-static
[H2]: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
[H3]: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
[H4]: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages

- **Microsoft:** [M0 — MSAL Browser README][M0]; [M1 — SPA code/PKCE protocol][M1]; [M2 — Registration][M2]; [M3 — Client/audience configuration][M3]; [M4 — Token lifetimes][M4]; [M5 — Accounts][M5]; [M6 — List children][M6]; [M7 — Download content/CORS][M7]; [M8 — Files.Read permission][M8]; [M9 — v5 redirect bridge][M9]; [M10 — Cache/persistence][M10]; [M11 — Logout][M11].
- **Google authorization/policy:** [G1 — Drive scopes][G1]; [G2 — Browser token model][G2]; [G3 — Model comparison][G3]; [G4 — GIS JS reference][G4]; [G5 — Restricted-scope review][G5]; [G6 — Branding/domain verification][G6]; [G7 — Verification exceptions][G7]; [G14 — Workspace data/developer policy][G14]; [G15 — Verification requirements][G15]; [G16 — Security assessment][G16]; [G17 — Verification FAQ/user cap][G17]; [G20 — Authorization client setup][G20]; [G21 — Origin/client configuration][G21].
- **Google Drive APIs:** [G8 — Downloads and exports][G8]; [G9 — files.export/10 MB][G9]; [G10 — files.list][G10]; [G11 — Export MIME formats][G11]; [G12 — About/exportFormats/user][G12]; [G13 — Drive user identity][G13]; [G18 — Folder/root concepts][G18]; [G19 — Long-running downloads/exports][G19]; [G22 — Child queries/recursive traversal][G22]; [G23 — about.get scopes/fields][G23].
- **Hosting/browser:** [H1 — SvelteKit static/GitHub Pages][H1]; [H2 — GitHub Pages hosting/logging][H2]; [H3 — File System Access API][H3]; [H4 — Pages custom domains][H4].
