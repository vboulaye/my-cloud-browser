<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Configure OneDrive — Cloud Browser</title>
	<meta name="description" content="Register a Microsoft Entra public client for Cloud Browser." />
</svelte:head>

<main>
	<a href={resolve('/')}>← Back to Cloud Browser</a>
	<h1>Configure OneDrive sign-in</h1>
	<p>Cloud Browser is a static app, so Microsoft sign-in requires a public client registration. Never create or ship a client secret for this browser app.</p>
	<ol>
		<li>In the <a href="https://entra.microsoft.com/" rel="noreferrer">Microsoft Entra admin center</a>, create an app registration for <strong>Accounts in any organizational directory and personal Microsoft accounts</strong> (or personal accounts only if that choice is offered for the registration).</li>
		<li>Under <strong>Authentication</strong>, add a <strong>Single-page application (SPA)</strong> platform redirect URI. Use the app's exact deployed origin and root path, including a trailing slash. For a custom-domain deployment this normally looks like <code>https://your-domain.example/</code>. Register the local development redirect separately when you know its exact URL.</li>
		<li>Under <strong>API permissions</strong>, add Microsoft Graph <strong>Delegated</strong> permission <code>Files.Read</code>. Do not add application permissions, write permissions, or a client secret.</li>
		<li>Copy the Application (client) ID into the static build environment as <code>PUBLIC_MICROSOFT_CLIENT_ID</code>. If using a redirect URL other than the app root, also set <code>PUBLIC_MICROSOFT_REDIRECT_URI</code> to the exact registered URL.</li>
		<li>Rebuild and redeploy the site after configuring these values. Public client IDs are not secrets; do not put credentials or tokens in the build configuration.</li>
	</ol>
	<div class="warning"><strong>Important:</strong> Microsoft requires the redirect URI to exactly match the registered SPA URI. This starter currently handles redirect responses on the root page; a non-root redirect needs a separately implemented and tested callback route.</div>
	<h2>Official references</h2>
	<ul>
		<li><a href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app" rel="noreferrer">Register an app in Microsoft Entra</a></li>
		<li><a href="https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization" rel="noreferrer">Initialize MSAL Browser</a></li>
		<li><a href="https://learn.microsoft.com/en-us/graph/permissions-reference#filesread" rel="noreferrer">Microsoft Graph Files.Read permission</a></li>
	</ul>
	<p class="fine-print">This is initial setup guidance, not a substitute for checking current Microsoft registration requirements. Production registration and live sign-in have not been tested in this repository.</p>
</main>

<style>
	main { max-width: 800px; margin: 56px auto; padding: 0 24px 70px; color: #344054; font: 15px/1.75 system-ui, sans-serif; }
	h1 { color: #172b4d; font-size: clamp(30px, 5vw, 40px); letter-spacing: -1.2px; }
	h2 { margin-top: 34px; color: #172b4d; font-size: 20px; }
	li { padding-left: 5px; margin: 0 0 13px; }
	a { color: #175cd3; }
	code { padding: 2px 5px; border-radius: 4px; background: #f2f4f7; overflow-wrap: anywhere; }
	.warning { margin: 25px 0; padding: 16px; border: 1px solid #fedf89; border-radius: 8px; background: #fffaeb; color: #93370d; }
	.fine-print { margin-top: 30px; color: #667085; font-size: 12px; }
</style>
