import { expect, test } from '@playwright/test';

test.describe('install to home screen', () => {
  test('the manifest opens the song list and its PNG icons load', async ({ page, request }) => {
    await page.goto('/songs');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifest = await (await request.get(manifestHref!)).json();
    expect(manifest.start_url).toBe('/songs');
    expect(manifest.display).toBe('standalone');
    const purposes = manifest.icons.map((icon: { purpose?: string }) => icon.purpose);
    expect(purposes).toEqual(expect.arrayContaining(['any', 'maskable']));

    for (const icon of manifest.icons as Array<{ src: string; type: string }>) {
      expect(icon.type).toBe('image/png');
      const response = await request.get(icon.src);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
    }
  });

  test('iOS gets a PNG touch icon and the home screen tags', async ({ page, request }) => {
    await page.goto('/songs');
    const touchIcon = await page.locator('link[rel="apple-touch-icon"]').first().getAttribute('href');
    expect(touchIcon).toMatch(/\.png/);
    expect((await request.get(touchIcon!)).status()).toBe(200);
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Chord Overlord');
    await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]').first()).toHaveAttribute('content', 'yes');
  });
});

test.describe('Install app button in Settings', () => {
  test('on Android Chrome it opens the browser install dialog', async ({ page }) => {
    await page.goto('/settings');
    // Wait until the page has hydrated and listens for the event.
    await expect(page.getByRole('button', { name: 'Install app' })).toBeVisible();
    // Headless Chrome never offers installation, so stand in for its event.
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>;
      event.prompt = () => { (window as unknown as Record<string, boolean>).__installPrompted = true; return Promise.resolve(); };
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(event);
    });
    const button = page.getByRole('button', { name: 'Install app' });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await button.tap();
    await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, boolean>).__installPrompted)).toBe(true);
  });

  test.describe('on iPhone Safari', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });

    test('it shows the Add to Home Screen steps', async ({ page }) => {
      await page.goto('/settings');
      await page.getByRole('button', { name: 'Install app' }).tap();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Install on iPhone or iPad')).toBeVisible();
      await expect(dialog.getByText('Add to Home Screen')).toBeVisible();
    });
  });
});
