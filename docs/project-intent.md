# Cloud Browser — Project Intent

Status: requirements captured; OneDrive implementation in progress. Google Drive support is planned but not implemented.

This document records the product decisions from the initial requirements interview. See [the feasibility assessment](feasibility.md) for subsequent documentation research, constraints, and validation gates. Recommendations in that assessment do not change the confirmed requirements here without an explicit decision.

## 1. Purpose

Build a lightweight SvelteKit web app that lets anyone connect their own cloud accounts, browse folders, and download selected files or complete folders. Prefer an entirely static deployment on GitHub Pages.

OneDrive and Google Drive are both intended for the first release. Later releases should add uploads and file management, including transfers between accounts and providers.

The app is a client for each user's accounts, not a public portal into the operator's files.

## 2. Confirmed product decisions

| Area | Decision |
| --- | --- |
| Audience | Public app; users access their own accounts. |
| Framework | SvelteKit. |
| Deployment | GitHub Pages with a custom domain; static preferred, not an absolute prohibition on a future backend. |
| Provider registrations | Neither Microsoft nor Google has been registered for this project yet. |
| Initial providers | Personal OneDrive and personal Google Drive. |
| Accounts | Multiple connected accounts per provider. |
| Connection persistence | Remember connections across visits where provider-supported authentication allows it. |
| Google reconnect | An explicit reconnect action after returning to the app or authorization expiry is acceptable; continuous authorization is not required. |
| Initial permissions | Read-only; request write permissions only when write features arrive. |
| Browsing | Basic folder navigation; no search, full-content previews, sorting/filtering controls, or dedicated shared-with-me view required for v1. |
| File presentation | Offer list and grid views. List rows include compact provider thumbnails where available; grid cards emphasize thumbnails and names for touch-friendly selection. |
| Selection | Multiple files and folders in the current folder only; navigating to another folder clears selection. |
| Downloads | One ZIP per action for selected items or an entire folder, preserving directory structure. |
| Google-native documents | Export Docs, Sheets, and Slides to DOCX, XLSX, and PPTX respectively. |
| Oversized Google exports | In v1, an export exceeding the standard endpoint's 10 MB per-export limit may be omitted with a clear error report. A larger-export alternative is not a launch requirement. |
| Partial failures | Continue with available files and provide a clear omissions/error report. |
| Expected scale | Usually tens of files and less than approximately 100 MB per download. |
| Enforced size limits | Warn on large jobs, but do not impose an application-defined hard size or file-count cap. |
| Devices | Desktop and mobile. |
| Telemetry | No app-controlled telemetry, analytics, or remote file/token storage. |
| Google launch obstacle | Revisit Google scope if verification or public-access requirements prove impractical. Do not silently reduce access. |

## 3. First-release scope

### Accounts and authentication

- Connect more than one personal Microsoft account and more than one personal Google account.
- Clearly distinguish connected accounts and the currently selected account/provider.
- Switch accounts without mixing listings, selections, downloads, or credentials.
- Remember connections using supported provider mechanisms. Remembering an account is not a guarantee of continuous authorization or permanent background access.
- Handle expired sessions, revoked permissions, and denied consent with a clear reconnect path.
- Google connections may be remembered as identities that require an explicit reconnect after page reload/return or authorization expiry. This provider-specific behavior is accepted for v1.
- Provide a disconnect action that removes the app's locally held account state and credentials. Explain that disconnecting locally may not revoke provider consent or end provider-wide sign-in.
- Never ask users to give the app their Microsoft or Google password directly.

### Browsing and selection

- Show a connected account's normal drive hierarchy, starting at its root.
- Navigate into folders and back through breadcrumbs.
- Distinguish files and folders; show useful available metadata without making previews necessary.
- Offer list and grid presentations, with compact thumbnails when the provider supplies them and a clear icon fallback otherwise.
- Make the grid useful on touch screens: visible selection controls, readable filenames, and folders that remain straightforward to open.
- Support selecting multiple files and folders from the visible folder, including select-all and clear-selection actions.
- Display the selection count and make selection usable with touch and keyboard input.
- Clear selection when changing folder or account. Cross-folder and cross-account baskets are not part of v1.
- Load all listing pages when needed; do not silently omit items because the provider paginates results.
- Provide explicit loading, empty, disconnected, and error states.

### Downloads

- Download multiple selected items as one ZIP.
- Download an entire folder recursively without requiring selection of its children one by one.
- Include selected subfolders recursively and preserve relative directory structure.
- Export Google Docs as DOCX, Sheets as XLSX, and Slides as PPTX where the provider supports that export.
- Clearly report unsupported Google-native types or failed exports rather than silently omitting them.
- An oversized Google-native export that fails the standard `files.export` endpoint's 10 MB per-export limit may be omitted with a clear report. Validating a larger-export alternative is optional future work, not a v1 launch gate. This provider limit is distinct from the warning-only policy for overall ZIP size.
- Continue processing after individual item failures when possible. Deliver successful items with an understandable report of missing items and reasons.
- Identify partial success explicitly; never label an incomplete archive as fully successful.
- Show meaningful progress, warnings, and a cancellation action. Exact progress may be indeterminate during discovery or exports.
- Warn before or during unusually large jobs, including when size is unknown. A warning is not a promise that the browser can complete the job.
- Do not add a hard application-level size/count cutoff without a new product decision. Provider, browser, device, and ZIP-library limits still apply.

### Privacy and security

- No app-controlled analytics or telemetry.
- No app backend storing or proxying users' files or tokens in the intended static architecture.
- No tokens in URLs, diagnostic reports, analytics, committed files, or application logs. Handle authentication callbacks according to each provider's protocol and remove transient callback parameters when appropriate.
- Do not ship client secrets in the static bundle. Public client identifiers are configuration, not secrets.
- Request the minimum practical read permissions for the agreed browsing and download scope; revisit consent when introducing writes.
- Explain what access is requested, where temporary file data is processed, what is remembered, and how to disconnect.
- Hosting and cloud providers may retain their own logs; “no telemetry” does not mean no third party ever observes requests.
- Treat filenames, metadata, and document contents as untrusted input. Render names safely and normalize archive paths to avoid traversal or misleading entries.

## 4. Scope explicitly excluded from v1

- Uploading files or folders.
- Moving, renaming, creating, or deleting remote items.
- Transfers between accounts or providers.
- Work/school OneDrive, SharePoint libraries, Google Workspace-specific features, and shared drives as promised support targets.
- A dedicated shared-with-me browser.
- Drive-wide search, previewers, and advanced listing controls.
- Cross-folder or cross-account download selections.
- Public sharing links or anonymous access to someone else's connected account.
- Offline access to cloud files or guaranteed downloads after closing the app.

These exclusions do not require hiding ordinary files that happen to be shared and appear in the supported hierarchy. Exact shortcut/shared-item behavior still needs a policy.

## 5. Future scope

The longer-term product should support:

1. Moving files and folders within an account.
2. Uploading individual or multiple local files.
3. Uploading local folder hierarchies, with browser capability handling.
4. Renaming items, creating folders, and deleting items.
5. Transferring files and folders between accounts, including across providers.

Cross-account transfers are not assumed to be atomic moves. The future design must distinguish copying from moving, verify destination results, and seek explicit authorization before deleting sources. Conflict resolution, resumability, quota handling, and partial-failure recovery need their own specification.

Write access should be requested when users enable or use these later capabilities, not during read-only onboarding.

## 6. Proposed technical direction — subject to validation

- Use SvelteKit's static deployment path and GitHub Pages-compatible routing/base-path configuration.
- Keep cloud operations in the browser unless a demonstrated requirement justifies revisiting the backend preference.
- Use provider-supported public-client authentication. Do not assume Microsoft and Google have identical token persistence or renewal behavior.
- Keep the UI separate from provider-specific authentication, listing, pagination, downloading, export, and error mapping.
- Reuse browsing and ZIP-download behavior across providers without forcing provider-specific concepts into a misleading common model.
- Load download/archive code when needed and avoid adding a large UI framework without evidence it helps the lightweight goal.
- Investigate bounded concurrency and incremental ZIP processing to reduce memory pressure. Do not assume streaming directly to a local file works consistently on all target mobile browsers.
- Avoid retaining downloaded file contents after the job ends. Define and disclose any temporary browser storage used by the implementation.

No SDK, ZIP library, styling system, state library, token-storage mechanism, or concrete package budget has been selected.

## 7. Feasibility checks before implementation commitments

### A. Public authentication and provider registration

Verify current Microsoft and Google requirements using official documentation:

- Personal-account registration settings and minimum practical read permissions.
- Production redirect URLs for the actual GitHub Pages deployment, including any repository subpath.
- Browser-origin/CORS support for listing, content download, and export requests.
- Multi-account login and reliable account switching without unintended session reuse.
- Supported persistence, token renewal, reauthentication, and disconnect/revocation behavior.

### B. Google Drive permission and verification tradeoff

Full browsing of arbitrary existing Drive contents may require broader scopes than a limited user-selected-file integration. Validate current scope classification, consent-screen/publication rules, verification obligations, and whether any additional review applies to this exact data flow.

If full Google integration is impractical, present concrete alternatives and obtain a decision. A picker-limited integration is not automatically equivalent to the full-drive browser described here.

### C. Browser ZIP feasibility, especially mobile

Test representative small downloads and larger warning-triggering cases on desktop and mobile. Validate recursive traversal, exports, memory use, cancellation, final download behavior, and partial-failure reporting.

No-hard-cap is a user-experience policy, not an unlimited-capacity guarantee. Some failures may prevent producing any ZIP at all; handle those honestly rather than promising partial recovery from every failure.

### D. GitHub Pages deployment

Confirm repository/site URL, base path, deep-link strategy, OAuth callback handling, deployment workflow, and what security headers can be controlled on this host. A static deployment cannot keep a client secret private.

## 8. Acceptance scenarios

The first release is acceptable when all of these can be demonstrated within the agreed provider scope:

1. A user connects two accounts from the same provider and switches between them without data or credential confusion.
2. A user connects both providers, refreshes or returns to the app, and either resumes supported access or receives a clear reauthentication prompt.
3. A user browses nested folders and a paginated listing, with clear loading/error states.
4. A user selects multiple items in one folder and gets one ZIP with the expected hierarchy.
5. A user downloads an entire folder, including nested files and subfolders.
6. Supported Google-native documents appear in the archive in the agreed Office formats.
7. An unreadable file or failed export does not silently disappear: successful items download where possible, and the failure is clearly reported.
8. Changing folders or accounts clears the selection.
9. A large job produces a warning, remains cancellable where execution permits, and is not rejected solely by an application-defined size/count limit.
10. The main flows work on representative desktop, Android, and iOS browsers.
11. Disconnect removes the app's local access state; normal operation sends no app telemetry and exposes no credentials in logs or reports.
12. The production GitHub Pages URL supports navigation, refresh, and authentication callbacks.
13. List and grid views show item names independently from thumbnail and folder-count metadata; missing thumbnails use a fallback icon, and grid selection/folder navigation work on touch-sized layouts.

Any agreed reduction of Google scope must update these criteria explicitly.

## 9. Open decisions and proposed defaults

These details were not settled in the interview and are not confirmed requirements:

| Question | Proposed direction / next action |
| --- | --- |
| Exact custom domain, GitHub Pages URL, and repository | Custom-domain hosting confirmed during feasibility research; obtain actual addresses before provider registration and routing setup. |
| Provider registrations | Neither exists yet; document Microsoft and Google setup after the scope and domain decisions. |
| Exact browser/version support matrix | Agree on current desktop and mobile targets before testing. |
| Meaning of “lightweight” | Set a measurable initial-load JS budget after auth/ZIP feasibility is understood. |
| Large-job warning thresholds | Base on testing; distinguish byte count, file count, and unknown export sizes. |
| Single-file action | Recommend a direct single-file download alongside batch ZIPs; confirm UX. |
| Account switching during a download | Decide whether to disable switching or keep the job bound to its original account. |
| Concurrent jobs | Recommend one active archive job initially. |
| ZIP naming and duplicate/export collisions | Define deterministic, safe disambiguation without overwriting entries. |
| Empty folders | Recommend preserving them in the archive. |
| Shortcuts and linked/shared folders | Define follow/skip policy, cycle handling, access boundaries, and reporting. |
| Error report location | Recommend visible summary plus a safely named report inside partial archives; confirm format. |
| All selected items fail | Recommend no empty success download; show the complete failure report. |
| Download interruption/backgrounding | Define expectations for mobile suspension and page closure; no guaranteed background completion. |
| Token persistence | Select provider-supported approach after security and browser review; do not assume permanent access. |
| Accessibility and visual design | Recommend semantic controls, keyboard access, touch-friendly layout, and a minimal responsive interface. |
| Backend fallback | Requires an explicit decision about hosting, privacy, costs, and operations before adding one. |

## 10. Next step

Implement and validate the read-only OneDrive slice first, including registration setup, pagination, account isolation, ZIP failure handling, and static deployment. Google verification and real-device mobile ZIP testing remain launch gates. This document does not authorize adding future write features or silently changing privacy, Google scope, or deployment architecture.
