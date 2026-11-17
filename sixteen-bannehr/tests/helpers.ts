import type { Page } from '@playwright/test';
import sharp from 'sharp';

/** A believable "render": a large JPEG with a gradient, so variants and srcset are real. */
export async function renderJpeg(width = 3200, height = 2000, hue = 0): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${30 + hue},35%,78%)"/><stop offset="1" stop-color="hsl(${20 + hue},30%,32%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect x="${width * 0.3}" y="${height * 0.55}" width="${width * 0.4}" height="${height * 0.12}" fill="hsl(${hue},10%,92%)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

export async function freshBook(page: Page, hash = '') {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('sixteen-bannehr');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  await page.goto(`/${hash}`);
  await page.reload();
  await page.waitForSelector('.spread');
}

export async function startEditing(page: Page, who: 'Adi' | 'Sonny' = 'Sonny') {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.waitForSelector('.edit-bar');
  const dialog = page.getByRole('dialog', { name: 'Who is holding the pen?' });
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: who, exact: true }).click();
}

export async function goTo(page: Page, spreadId: string) {
  await page.evaluate((id) => {
    location.hash = `#/p/${id}`;
  }, spreadId);
  await page.waitForSelector(`[data-spread="${spreadId}"]`);
  await page.waitForTimeout(400);
}

export async function undoAll(page: Page) {
  const undo = page.getByRole('button', { name: 'Undo' });
  for (let i = 0; i < 60 && (await undo.isEnabled()); i++) await undo.click();
}
