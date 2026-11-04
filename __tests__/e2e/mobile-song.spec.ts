import { expect, test, type Page } from '@playwright/test';

// Needs a song with saved results, so this runs against an existing app: E2E_BASE_URL and E2E_SONG_ID.
const songId = process.env.E2E_SONG_ID;

async function openSong(page: Page) {
  await page.goto(`/analyze/${songId}`);
  const openCached = page.getByRole('button', { name: 'Open cached results' });
  await expect(openCached).toBeVisible({ timeout: 30_000 });
  await openCached.tap();
  await expect(page.getByTestId('mobile-song-bar')).toBeVisible({ timeout: 30_000 });
}

test.describe('phone song screen', () => {
  test.skip(!songId, 'Set E2E_SONG_ID to a song with saved results');
  // Opening a song waits for the cache check and the YouTube player, which can take a while.
  test.setTimeout(90_000);

  test('uses one screen with a fixed player bar and all views in reach', async ({ page }) => {
    await openSong(page);

    const { scrollWidth, clientWidth, scrollHeight, clientHeight } = await page.evaluate(() => {
      const { scrollWidth, clientWidth, scrollHeight, clientHeight } = document.documentElement;
      return { scrollWidth, clientWidth, scrollHeight, clientHeight };
    });
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight);

    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(page.locator('footer')).toBeHidden();

    for (const name of ['Chords', 'Guitar', 'Piano', 'Lyrics']) {
      const box = await page.getByRole('tab', { name }).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(clientWidth);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    for (const name of ['Play', 'Tools']) {
      const box = await page.getByTestId('mobile-song-bar').getByRole('button', { name, exact: true }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('the Tools sheet offers the features that were hidden on phones', async ({ page }) => {
    await openSong(page);
    const sheet = page.getByRole('region', { name: 'Tools' });
    await expect(sheet).toBeHidden();

    await page.getByTestId('mobile-song-bar').getByRole('button', { name: 'Tools', exact: true }).tap();
    await expect(sheet).toBeVisible();
    for (const label of ['Auto-scroll', 'Chord sounds', 'Melody', 'Pitch & speed', 'Stems', 'Trim', 'Loop', 'Metronome', 'Countdown', 'Lyrics search', 'AI chat']) {
      await expect(sheet.getByText(label, { exact: true })).toBeVisible();
    }
    for (const button of await sheet.getByRole('listitem').getByRole('button').all()) {
      expect((await button.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    }

    await sheet.getByRole('button', { name: 'Toggle AI chat' }).tap();
    await expect(page.getByRole('button', { name: 'Close chatbot' })).toBeVisible();
  });

  test('opening the video does not reload the player', async ({ page }) => {
    await openSong(page);
    const iframe = page.getByTestId('mobile-song-video').locator('iframe');
    await expect(iframe).toHaveCount(1, { timeout: 30_000 });
    await iframe.evaluate((element) => { (element as HTMLElement).dataset.sameElement = 'yes'; });

    await page.getByRole('button', { name: 'Show video' }).tap();
    await expect(iframe).toHaveAttribute('data-same-element', 'yes');
    expect((await page.getByTestId('mobile-song-video').boundingBox())!.width).toBe(390);

    await page.getByRole('button', { name: 'Hide video' }).tap();
    await expect(iframe).toHaveAttribute('data-same-element', 'yes');
  });
});
