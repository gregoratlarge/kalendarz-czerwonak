// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

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

beforeAll(async () => {
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

describe('subscribe links', () => {
  it('builds a Google Calendar link using the webcal scheme', () => {
    const google = document.querySelector<HTMLAnchorElement>('#btn-google')!;
    const href = google.getAttribute('href') ?? '';
    expect(href.startsWith('https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2F')).toBe(true);
    expect(href).not.toContain('cid=https');
  });

  it('points the Apple / Outlook button at a webcal:// URL', () => {
    const webcal = document.querySelector<HTMLAnchorElement>('#btn-webcal')!;
    expect(webcal.getAttribute('href')).toMatch(/^webcal:\/\//);
  });

  it('offers the manual "From URL" fallback for Google', () => {
    const help = document.querySelector<HTMLAnchorElement>('#google-addurl');
    expect(help).not.toBeNull();
    expect(help?.getAttribute('href')).toBe(
      'https://calendar.google.com/calendar/u/0/r/settings/addbyurl',
    );
  });

  it('shows the subscription URL in the link field', () => {
    const link = document.querySelector<HTMLAnchorElement>('#ics-link')!;
    expect(link.getAttribute('href')).toMatch(/^https?:\/\/.+\/ics\/\d{4}\/rejon-\d+\.ics$/);
    expect(link.textContent).toBe(link.getAttribute('href'));
  });
});
