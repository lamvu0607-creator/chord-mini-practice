import { expect, test } from '@playwright/test';

// Needs a ready, public stem set (a YouTube song): E2E_BASE_URL and E2E_STEM_ID, e.g. yt_<videoId>.
const stemId = process.env.E2E_STEM_ID;

test.describe('phone stems screen', () => {
  test.skip(!stemId, 'Set E2E_STEM_ID to a ready stem set');
  test.setTimeout(90_000);

  test('the separated songs come before the form', async ({ page }) => {
    await page.goto('/stems');
    const library = page.getByRole('heading', { name: 'Separated songs' });
    const form = page.getByRole('tablist').first();
    await expect(library).toBeVisible();
    expect((await library.boundingBox())!.y).toBeLessThan((await form.boundingBox())!.y);
  });

  test('an open song fills the page with large controls and a sticky transport', async ({ page }) => {
    await page.goto(`/stems?id=${encodeURIComponent(stemId!)}`);
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeVisible({ timeout: 60_000 });

    await expect(page.getByRole('heading', { name: 'Separated songs' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Shortcuts' })).toBeHidden();
    await expect(page.getByRole('slider', { name: 'Tempo' })).toBeHidden();

    for (const button of [play, ...await page.getByRole('button', { name: /^(M|S)$/ }).all()]) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    // The transport stays on screen, above the tab bar.
    const playBox = (await play.boundingBox())!;
    const tabBarBox = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
    expect(playBox.y + playBox.height).toBeLessThanOrEqual(tabBarBox.y);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    await page.getByRole('button', { name: /^Tempo 100%/ }).tap();
    await expect(page.getByRole('slider', { name: 'Tempo' })).toBeVisible();

    await page.getByRole('button', { name: 'All stems' }).tap();
    await expect(page.getByRole('heading', { name: 'Separated songs' })).toBeVisible();
    await expect(page).toHaveURL(/\/stems$/);
  });
});
