import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/browser',
	fullyParallel: true,
	use: {
		baseURL: 'http://127.0.0.1:4178',
		browserName: 'chromium',
		launchOptions: {
			executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
			args: ['--no-sandbox']
		}
	},
	webServer: {
		command: 'npm run dev -- --host 127.0.0.1 --port 4178 --strictPort',
		url: 'http://127.0.0.1:4178',
		reuseExistingServer: !process.env.CI
	}
});
