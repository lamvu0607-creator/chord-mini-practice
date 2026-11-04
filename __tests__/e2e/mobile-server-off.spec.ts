import { expect, test } from '@playwright/test';

const MESSAGE = 'The ChordMini server is off right now. Please contact Lâm Vũ.';

test.describe('server is off', () => {
  test.setTimeout(60_000);

  test('a banner appears when the analysis server stops answering, and goes away when it is back', async ({ page }) => {
    let backendUp = false;
    await page.route('**/api/health', (route) => (backendUp
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"healthy"}' })
      : route.fulfill({ status: 500, contentType: 'application/json', body: '{"status":"unhealthy"}' })));

    await page.goto('/songs');
    // Two failed checks, 15 seconds apart.
    await expect(page.getByRole('alert').filter({ hasText: MESSAGE })).toBeVisible({ timeout: 30_000 });

    backendUp = true;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByText(MESSAGE)).toBeHidden({ timeout: 10_000 });
  });

  test('a rate-limited check does not show the banner', async ({ page }) => {
    await page.route('**/api/health', (route) => route.fulfill({ status: 503, body: '' }));
    await page.goto('/songs');
    await page.waitForTimeout(20_000);
    await expect(page.getByText(MESSAGE)).toBeHidden();
  });

  test('when the whole server is unreachable, an installed visitor sees the offline page', async ({ page, context }) => {
    await page.goto('/songs');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The worker takes control of the page after its first load.
    await page.reload();

    await context.setOffline(true);
    await page.goto('/stems').catch(() => undefined);
    await expect(page.getByRole('heading', { name: 'The ChordMini server is off' })).toBeVisible();
    await expect(page.getByText('The server is off right now. Please contact Lâm Vũ.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await context.setOffline(false);
  });
});
