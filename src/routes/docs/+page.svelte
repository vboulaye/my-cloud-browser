<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>About &amp; privacy — Cloud Browser</title>
	<meta name="description" content="How Cloud Browser accesses OneDrive and processes files locally." />
</svelte:head>

<main>
	<a href={resolve('/')}>← Back to OneDrive</a>
	<h1>About &amp; privacy</h1>
	<p>Cloud Browser is a static website. Microsoft sign-in and OneDrive API requests run in your browser.</p>
	<ul>
		<li>The app requests delegated read-only <code>Files.Read</code> access.</li>
		<li>File and folder thumbnails, when available, are loaded by this browser from URLs supplied by Microsoft Graph. Files are downloaded from Microsoft directly to this browser and assembled into a ZIP locally.</li>
		<li>The app does not send your file content or access tokens to an app backend and does not run app-controlled analytics.</li>
		<li>Microsoft and the static-site host may process their own requests and operational logs.</li>
		<li>Use “Disconnect account” to clear this app's local Microsoft connection. This does not sign you out of Microsoft everywhere.</li>
	</ul>
	<h2>Large downloads</h2>
	<p>ZIP creation uses browser memory or, in supported browsers, a save-file stream. Large or interrupted jobs may fail. Keep this page open until the ZIP is finished.</p>
	<h2>Provider setup</h2>
	<p>See the <a href={resolve('/docs/onedrive-setup')}>OneDrive setup instructions</a> if Microsoft sign-in is not configured yet.</p>
</main>

<style>
	main { max-width: 760px; margin: 64px auto; padding: 0 24px 70px; color: #344054; font: 16px/1.7 system-ui, sans-serif; }
	h1 { color: #172b4d; font-size: 36px; letter-spacing: -1px; }
	h2 { margin-top: 36px; color: #172b4d; font-size: 20px; }
	a { color: #175cd3; }
	code { padding: 2px 5px; border-radius: 4px; background: #f2f4f7; }
</style>
