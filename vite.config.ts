import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const normalizedBase = process.env.BASE_PATH?.replace(/^\/+|\/+$/g, '') ?? '';
const basePath: '' | `/${string}` = normalizedBase ? `/${normalizedBase}` : '';

export default defineConfig({
	envPrefix: ['VITE_', 'PUBLIC_'],
	plugins: [
		sveltekit({
			adapter: adapter({ fallback: '404.html' }),
			paths: { base: basePath }
		})
	]
});
