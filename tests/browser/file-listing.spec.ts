import { expect, test } from '@playwright/test';

test('shows folder names separately from child counts and opens folders', async ({ page }) => {
	const thumbnail = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l5sAAAAASUVORK5CYII=', 'base64');
	await page.route('https://thumbnail.example.test/**', (route) => route.fulfill({
		status: 200,
		contentType: 'image/png',
		body: thumbnail
	}));
	await page.goto('/?fixture=drive-list');

	const folderName = page.getByRole('button', { name: 'Documents', exact: true });
	await expect(folderName).toBeVisible();
	const nameCell = folderName.locator('..');
	await expect(nameCell.locator('.child-count')).toHaveText('4');
	await expect(folderName).toHaveJSProperty('textContent', 'Documents');
	await expect(nameCell.locator('.thumbnail-list')).toBeVisible();
	await expect(nameCell.locator('.thumbnail-list img')).toHaveAttribute('src', 'https://thumbnail.example.test/documents-small.png');
	const listPreview = page.getByRole('button', { name: 'Preview Beach.jpg' });
	await listPreview.click();
	const listDialog = page.getByRole('dialog', { name: 'Image preview: Beach.jpg' });
	await expect(listDialog).toBeVisible();
	await expect(listDialog.locator('img')).toHaveAttribute('src', 'https://thumbnail.example.test/beach-large.png');
	await listDialog.getByRole('button', { name: 'Close preview of Beach.jpg' }).click();
	await expect(listDialog).toBeHidden();
	await listPreview.click();
	await page.keyboard.press('Escape');
	await expect(listDialog).toBeHidden();

	await page.getByRole('button', { name: 'Grid', exact: true }).click();
	const gridFolder = page.getByRole('button', { name: 'Documents', exact: true });
	await expect(gridFolder).toBeVisible();
	await expect(gridFolder.locator('.thumbnail-grid')).toBeVisible();
	await expect(gridFolder.locator('.thumbnail-grid img')).toHaveAttribute('src', 'https://thumbnail.example.test/documents-medium.png');
	const gridPreview = page.getByRole('button', { name: 'Preview Beach.jpg' });
	await gridPreview.click();
	const gridDialog = page.getByRole('dialog', { name: 'Image preview: Beach.jpg' });
	await expect(gridDialog).toBeVisible();
	await gridDialog.getByRole('button', { name: 'Close image preview' }).click();
	await expect(gridDialog).toBeHidden();
	const gridCheckbox = gridFolder.locator('..').locator('.grid-checkbox');
	await expect(gridCheckbox).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await expect(gridCheckbox).toHaveCSS('border-top-style', 'none');
	const gridCaption = gridFolder.locator('.grid-name');
	await expect(gridCaption).toHaveCSS('position', 'absolute');
	const captionAtBottom = await gridCaption.evaluate((caption) => {
		const media = caption.parentElement!.getBoundingClientRect();
		const label = caption.getBoundingClientRect();
		return Math.abs(media.bottom - label.bottom) < 1;
	});
	expect(captionAtBottom).toBe(true);
	await expect(page.locator('.grid-meta')).toHaveCount(0);
	await gridFolder.locator('..').locator('input[type="checkbox"]').check();
	await expect(page.getByText('1 selected')).toBeVisible();
	await gridFolder.click();
	await expect(page.locator('.breadcrumbs [aria-current="location"]')).toHaveText('Documents');
	await expect(page.getByRole('button', { name: 'Invoices and notes', exact: true })).toBeVisible();
});

test('grid cards remain selectable at a mobile viewport', async ({ browser }) => {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await context.newPage();
	await page.route('https://thumbnail.example.test/**', (route) => route.fulfill({
		status: 200,
		contentType: 'image/png',
		body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l5sAAAAASUVORK5CYII=', 'base64')
	}));
	await page.goto('http://127.0.0.1:4178/?fixture=drive-list');
	await page.getByRole('button', { name: 'Grid', exact: true }).click();
	const folderCard = page.locator('.grid-card').filter({ hasText: 'Documents' });
	await expect(folderCard).toBeVisible();
	const fileCard = page.getByRole('button', { name: 'Budget.xlsx', exact: true });
	await fileCard.click();
	await expect(fileCard).toHaveAttribute('aria-pressed', 'true');
	await folderCard.getByRole('checkbox', { name: 'Select Documents' }).check();
	await expect(page.getByText('2 selected')).toBeVisible();
	await expect(folderCard.locator('.thumbnail-grid img')).toBeVisible();
	await context.close();
});
