// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const writeText = vi.fn(async (_text: string) => {});

function fixture(path: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, 'public', path), 'utf8'));
}

/** Extract the <body> markup from index.html so the test mirrors the real page. */
function bodyHtml(): string {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].replace(/<script[\s\S]*?<\/script>/gi, '') : '';
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function setPlatform(ua: string, maxTouchPoints = 0): void {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

async function choose(comboId: string, text: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(`#${comboId} .combo__input`);
  if (!input) throw new Error(`no input in ${comboId}`);
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  const items = [...document.querySelectorAll<HTMLLIElement>(`#${comboId} .combo__item`)];
  const item = items.find((li) => li.textContent?.includes(text));
  if (!item) throw new Error(`no matching item "${text}" in ${comboId}`);
  item.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await tick();
}

/** Re-select the locality so renderSubscribe() runs again for the new platform. */
async function rerenderFor(ua: string, maxTouchPoints = 0): Promise<void> {
  setPlatform(ua, maxTouchPoints);
  await choose('city-combo', 'Owińska');
}

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

beforeAll(async () => {
  setPlatform(DESKTOP_UA);
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
  document.body.innerHTML = bodyHtml();
  vi.stubGlobal('fetch', async (url: string | URL) => {
    const u = String(url);
    if (u.endsWith('data/index.json')) return new Response(JSON.stringify(fixture('data/index.json')));
    if (u.endsWith('data/2026/regions.json')) return new Response(JSON.stringify(fixture('data/2026/regions.json')));
    if (u.endsWith('data/2026/streets.json')) return new Response(JSON.stringify(fixture('data/2026/streets.json')));
    return new Response('not found', { status: 404 });
  });
  await import('../src/main');
  await vi.waitFor(() => {
    expect(document.querySelectorAll('#year-select option').length).toBeGreaterThan(0);
  });
  // setupYear() finishes after the year <select> is filled; wait for its status
  // line so the city items are guaranteed to be loaded before we pick one.
  await vi.waitFor(() => {
    expect(document.querySelector('#status')?.textContent).toContain('Wybierz miejscowość');
  });
  // Owińska is served as a whole locality, so this renders the result panel
  // (and therefore the subscribe links) in one step.
  await choose('city-combo', 'Owińska');
});

describe('subscribe links on desktop', () => {
  it('builds a Google Calendar link using the webcal scheme', () => {
    const href = byId<HTMLAnchorElement>('btn-google').getAttribute('href') ?? '';
    expect(href.startsWith('https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2F')).toBe(true);
    expect(href).not.toContain('cid=https');
  });

  it('points the Apple / Outlook button at a webcal:// URL', () => {
    expect(byId<HTMLAnchorElement>('btn-webcal').getAttribute('href')).toMatch(/^webcal:\/\//);
    expect(byId<HTMLAnchorElement>('btn-webcal').textContent).toBe('Apple / Outlook (webcal)');
  });

  it('offers the manual "From URL" fallback for Google', () => {
    const help = document.querySelector<HTMLAnchorElement>('#google-addurl');
    expect(help).not.toBeNull();
    expect(help?.getAttribute('href')).toBe(
      'https://calendar.google.com/calendar/u/0/r/settings/addbyurl',
    );
  });

  it('shows only the desktop hint', () => {
    expect(byId('hint-desktop').hidden).toBe(false);
    expect(byId('hint-android').hidden).toBe(true);
    expect(byId('hint-ios').hidden).toBe(true);
  });

  it('shows the subscription URL in the link field', () => {
    const link = byId<HTMLAnchorElement>('ics-link');
    expect(link.getAttribute('href')).toMatch(/^https?:\/\/.+\/ics\/\d{4}\/rejon-\d+\.ics$/);
    expect(link.textContent).toBe(link.getAttribute('href'));
  });
});

describe('subscribe links on Android', () => {
  beforeAll(async () => {
    await rerenderFor(ANDROID_UA, 5);
  });

  it('opens Google\'s "Add by URL" form instead of the desktop deep link', () => {
    expect(byId<HTMLAnchorElement>('btn-google').getAttribute('href')).toBe(
      'https://calendar.google.com/calendar/r/settings/addbyurl',
    );
  });

  it('copies the feed URL before the user pastes it', async () => {
    writeText.mockClear();
    const google = byId<HTMLAnchorElement>('btn-google');
    // Drop the href for the click so jsdom does not attempt a navigation.
    const href = google.getAttribute('href');
    google.removeAttribute('href');
    google.click();
    google.setAttribute('href', href ?? '');
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/ics\/\d{4}\/rejon-\d+\.ics$/));
    });
    expect(document.querySelector('#status')?.textContent).toContain('Skopiowano link do schowka');
    // The confirmation must also appear next to the buttons, where the user is
    // looking, because #status is above the (scrolled-away) result panel.
    const confirm = byId('copy-confirm');
    expect(confirm.hidden).toBe(false);
    expect(confirm.textContent).toContain('Skopiowano link do schowka');
  });

  it('hides the webcal button, which has no handler on Android', () => {
    expect(byId('btn-webcal').hidden).toBe(true);
  });

  it('shows only the Android hint', () => {
    expect(byId('hint-android').hidden).toBe(false);
    expect(byId('hint-desktop').hidden).toBe(true);
    expect(byId('hint-ios').hidden).toBe(true);
  });
});

describe('subscribe links on iPhone', () => {
  beforeAll(async () => {
    await rerenderFor(IPHONE_UA, 5);
  });

  it('opens Google\'s "Add by URL" form and keeps the webcal one-tap option', () => {
    expect(byId<HTMLAnchorElement>('btn-google').getAttribute('href')).toBe(
      'https://calendar.google.com/calendar/r/settings/addbyurl',
    );
    const webcal = byId<HTMLAnchorElement>('btn-webcal');
    expect(webcal.hidden).toBe(false);
    expect(webcal.getAttribute('href')).toMatch(/^webcal:\/\//);
    expect(webcal.textContent).toBe('Kalendarz Apple (jednym dotknięciem)');
  });

  it('shows only the iOS hint', () => {
    expect(byId('hint-ios').hidden).toBe(false);
    expect(byId('hint-desktop').hidden).toBe(true);
    expect(byId('hint-android').hidden).toBe(true);
  });
});
