import { expect, test, type Page } from '@playwright/test';

async function expectNoSidewaysScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test.describe('phone app shell', () => {
  for (const path of ['/songs', '/analyze', '/stems', '/settings']) {
    test(`${path} has the tab bar, no footer and no sideways scroll`, async ({ page }) => {
      await page.goto(path);
      const tabBar = page.getByRole('navigation', { name: 'Main' });
      await expect(tabBar).toBeVisible();
      await expect(page.locator('footer')).toBeHidden();
      await expectNoSidewaysScroll(page);

      for (const link of await tabBar.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('tabs move between screens and mark the current one', async ({ page }) => {
    await page.goto('/songs');
    const tabBar = page.getByRole('navigation', { name: 'Main' });
    await expect(tabBar.getByRole('link', { name: 'Songs' })).toHaveAttribute('aria-current', 'page');

    await tabBar.getByRole('link', { name: 'Add' }).tap();
    await expect(page).toHaveURL(/\/analyze$/);
    await expect(tabBar.getByRole('link', { name: 'Add' })).toHaveAttribute('aria-current', 'page');
  });

  test('the song list starts near the top of the screen', async ({ page }) => {
    await page.goto('/songs');
    const search = page.getByRole('searchbox', { name: 'Search songs by name' });
    await expect(search).toBeVisible();
    const box = await search.boundingBox();
    expect(box!.y).toBeLessThan(844 / 2);
  });

  test('the home page search does not squeeze the upload button', async ({ page }) => {
    await page.goto('/');
    await expectNoSidewaysScroll(page);
    const input = await page.locator('#youtube-search').boundingBox();
    expect(input!.width).toBeGreaterThan(300);
  });
});
