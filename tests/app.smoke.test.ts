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
  item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
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
});

describe('app wiring', () => {
  it('populates the year selector with 2026 as default', () => {
    const year = document.querySelector<HTMLSelectElement>('#year-select')!;
    expect([...year.options].map((o) => o.value)).toContain('2026');
    expect(year.value).toBe('2026');
  });

  it('loads localities into the city combobox', async () => {
    await choose('city-combo', 'Kicin');
    expect(document.querySelector('#status')?.textContent).toContain('Wybierz ulicę');
  });

  it('shows the ambiguity panel for a parity-split street', async () => {
    await choose('street-combo', 'Poznańska');
    const panel = document.querySelector<HTMLElement>('#ambiguity')!;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelectorAll('button')).toHaveLength(2);
  });

  it('renders a region result (calendar) for a whole-locality address', async () => {
    await choose('city-combo', 'Owińska');
    const result = document.querySelector<HTMLElement>('#result')!;
    expect(result.hidden).toBe(false);
    expect(document.querySelector('#region-title')?.textContent).toBe('Rejon 3');
    expect(document.querySelectorAll('#schedule-table tbody tr')).toHaveLength(12);
    await tick();
    expect((document.querySelector('#calendar') as HTMLElement).childElementCount).toBeGreaterThan(0);
  });
});
