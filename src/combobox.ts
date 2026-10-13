import Fuse from 'fuse.js';

export interface ComboItem {
  value: string;
  label: string;
  hint?: string;
}

interface ComboboxOptions {
  placeholder: string;
  onSelect: (value: string | null) => void;
  emptyText?: string;
  ariaLabel?: string;
}

/**
 * Accessible searchable dropdown (combobox) with fuzzy matching.
 */
export class Combobox {
  readonly el: HTMLDivElement;
  private input: HTMLInputElement;
  private list: HTMLUListElement;
  private items: ComboItem[] = [];
  private fuse: Fuse<ComboItem> | null = null;
  private visible: ComboItem[] = [];
  private active = -1;
  private selected: string | null = null;
  private opts: ComboboxOptions;

  constructor(opts: ComboboxOptions) {
    this.opts = opts;
    this.el = document.createElement('div');
    this.el.className = 'combo';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'combo__input';
    this.input.placeholder = opts.placeholder;
    this.input.autocomplete = 'off';
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.setAttribute('aria-autocomplete', 'list');
    if (opts.ariaLabel) this.input.setAttribute('aria-label', opts.ariaLabel);

    this.list = document.createElement('ul');
    this.list.className = 'combo__list';
    this.list.setAttribute('role', 'listbox');
    this.list.hidden = true;

    this.el.append(this.input, this.list);

    this.input.addEventListener('input', () => {
      this.selected = null;
      this.opts.onSelect(null);
      this.open(this.filter(this.input.value));
    });
    this.input.addEventListener('focus', () => this.open(this.filter(this.input.value)));
    this.input.addEventListener('keydown', (e) => this.onKeydown(e));
    this.input.addEventListener('blur', () => window.setTimeout(() => this.close(), 120));
    this.input.addEventListener('change', () => {
      const exact = this.items.find((i) => i.label.toLowerCase() === this.input.value.trim().toLowerCase());
      if (!exact) this.selected = null;
    });
  }

  setItems(items: ComboItem[]): void {
    this.items = items;
    this.fuse = new Fuse(items, { keys: ['label'], threshold: 0.35, ignoreLocation: true });
    this.input.value = '';
    this.selected = null;
    this.close();
  }

  setValue(value: string | null): void {
    const item = value ? this.items.find((i) => i.value === value) : undefined;
    this.selected = item ? item.value : null;
    this.input.value = item ? item.label : '';
    this.close();
  }

  getValue(): string | null {
    return this.selected;
  }

  setDisabled(disabled: boolean): void {
    this.input.disabled = disabled;
    if (disabled) this.close();
  }

  setPlaceholder(text: string): void {
    this.input.placeholder = text;
  }

  private filter(query: string): ComboItem[] {
    const q = query.trim();
    if (!q) return this.items.slice(0, 60);
    if (!this.fuse) return this.items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
    return this.fuse.search(q, { limit: 60 }).map((r) => r.item);
  }

  private open(items: ComboItem[]): void {
    this.visible = items;
    this.active = items.length ? 0 : -1;
    this.render();
    this.list.hidden = items.length === 0;
    this.input.setAttribute('aria-expanded', String(!this.list.hidden));
  }

  private close(): void {
    this.list.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
    this.active = -1;
  }

  private render(): void {
    this.list.innerHTML = '';
    if (this.visible.length === 0) {
      const li = document.createElement('li');
      li.className = 'combo__empty';
      li.textContent = this.opts.emptyText ?? 'Brak wyników';
      this.list.append(li);
      return;
    }
    this.visible.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'combo__item' + (i === this.active ? ' is-active' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(item.value === this.selected));
      li.innerHTML = '';
      const label = document.createElement('span');
      label.textContent = item.label;
      li.append(label);
      if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'combo__hint';
        hint.textContent = item.hint;
        li.append(hint);
      }
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.choose(item);
      });
      li.addEventListener('mouseenter', () => {
        this.active = i;
        this.render();
      });
      this.list.append(li);
    });
  }

  private choose(item: ComboItem): void {
    this.selected = item.value;
    this.input.value = item.label;
    this.close();
    this.opts.onSelect(item.value);
  }

  private onKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.list.hidden) {
        this.open(this.filter(this.input.value));
        return;
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      this.active = (this.active + delta + this.visible.length) % this.visible.length;
      this.render();
      this.list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (!this.list.hidden && this.active >= 0) {
        e.preventDefault();
        this.choose(this.visible[this.active]);
      }
    } else if (e.key === 'Escape') {
      this.close();
    }
  }
}
