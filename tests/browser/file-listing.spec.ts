import { expect, test } from '@playwright/test';

test('shows folder names separately from child counts and opens folders', async ({ page }) => {
	await page.goto('/?fixture=drive-list');

	const folderName = page.getByRole('button', { name: 'Documents', exact: true });
	await expect(folderName).toBeVisible();
	const nameCell = folderName.locator('..');
	await expect(nameCell.locator('.child-count')).toHaveText('4');
	await expect(folderName).toHaveJSProperty('textContent', 'Documents');

	await folderName.click();
	await expect(page.locator('.breadcrumbs [aria-current="location"]')).toHaveText('Documents');
	await expect(page.getByRole('button', { name: 'Invoices and notes', exact: true })).toBeVisible();
});
