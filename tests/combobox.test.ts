// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { Combobox, type ComboItem } from '../src/combobox';

const CITIES: ComboItem[] = [
  { value: 'Kicin', label: 'Kicin' },
  { value: 'Kliny', label: 'Kliny' },
  { value: 'Owińska', label: 'Owińska' },
  { value: 'Koziegłowy', label: 'Koziegłowy' },
];

let active: Combobox | null = null;

function mount(): { combo: Combobox; picks: Array<string | null> } {
  const picks: Array<string | null> = [];
  const combo = new Combobox({ placeholder: 'x', onSelect: (v) => picks.push(v) });
  document.body.append(combo.el);
  combo.setItems(CITIES);
  active = combo;
  return { combo, picks };
}

function inputOf(combo: Combobox): HTMLInputElement {
  return combo.el.querySelector<HTMLInputElement>('.combo__input')!;
}

function listOf(combo: Combobox): HTMLUListElement {
  return combo.el.querySelector<HTMLUListElement>('.combo__list')!;
}

function itemNodes(combo: Combobox): HTMLLIElement[] {
  return [...combo.el.querySelectorAll<HTMLLIElement>('.combo__item')];
}

function type(combo: Combobox, text: string): HTMLInputElement {
  const input = inputOf(combo);
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
}

function pointerdown(el: Element): void {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
}

function tap(el: Element): void {
  pointerdown(el);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

afterEach(() => {
  active?.destroy();
  active = null;
  document.body.innerHTML = '';
});

describe('Combobox touch/mobile interaction', () => {
  it('selects an item on pointerdown + click (mobile tap)', () => {
    const { combo, picks } = mount();
    type(combo, 'Kicin');
    const item = itemNodes(combo).find((li) => li.textContent === 'Kicin')!;
    tap(item);
    expect(picks.at(-1)).toBe('Kicin');
    expect(combo.getValue()).toBe('Kicin');
    expect(inputOf(combo).value).toBe('Kicin');
    expect(listOf(combo).hidden).toBe(true);
  });

  it('does not select on pointerdown alone (scroll gesture)', () => {
    const { combo, picks } = mount();
    type(combo, 'Kicin');
    const item = itemNodes(combo).find((li) => li.textContent === 'Kicin')!;
    pointerdown(item);
    expect(combo.getValue()).toBeNull();
    expect(picks.every((p) => p === null)).toBe(true);
    expect(listOf(combo).hidden).toBe(false);
  });

  it('selects with Enter while the list is open', () => {
    const { combo, picks } = mount();
    const input = type(combo, 'Kicin');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(picks.at(-1)).toBe('Kicin');
    expect(combo.getValue()).toBe('Kicin');
  });

  it('selects the typed match with Enter even if the list was closed', () => {
    const { combo, picks } = mount();
    const input = type(combo, 'Kicin');
    // Simulate a stray blur / keyboard dismissal closing the list first.
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(listOf(combo).hidden).toBe(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(picks.at(-1)).toBe('Kicin');
    expect(combo.getValue()).toBe('Kicin');
  });

  it('prefers an exact match over the fuzzy first hit', () => {
    const { combo } = mount();
    const input = type(combo, 'Kliny');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(combo.getValue()).toBe('Kliny');
  });

  it('closes when focus leaves the widget', () => {
    const { combo } = mount();
    const input = type(combo, 'Kicin');
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    expect(listOf(combo).hidden).toBe(true);
  });

  it('closes when the user taps outside', () => {
    const { combo } = mount();
    type(combo, 'Kicin');
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(listOf(combo).hidden).toBe(true);
  });
});

describe('Combobox list placement', () => {
  it('opens upward when there is no room below', () => {
    const { combo } = mount();
    const input = inputOf(combo);
    input.getBoundingClientRect = () =>
      ({ top: 250, bottom: 280, left: 0, right: 200, width: 200, height: 30, x: 0, y: 250 }) as DOMRect;
    Object.defineProperty(window, 'innerHeight', { value: 290, configurable: true });
    type(combo, 'Kicin');
    expect(listOf(combo).classList.contains('combo__list--up')).toBe(true);
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  it('opens downward when there is room below', () => {
    const { combo } = mount();
    const input = inputOf(combo);
    input.getBoundingClientRect = () =>
      ({ top: 10, bottom: 40, left: 0, right: 200, width: 200, height: 30, x: 0, y: 10 }) as DOMRect;
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    type(combo, 'Kicin');
    expect(listOf(combo).classList.contains('combo__list--up')).toBe(false);
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });
});
