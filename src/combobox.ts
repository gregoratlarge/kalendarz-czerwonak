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
 *
 * Options are activated on `click`: that event fires for both taps and mouse
 * clicks, but is *not* fired when a touch turns into a scroll gesture. The
 * `pointerdown`/`mousedown` handlers only cancel the default action so the
 * field keeps focus (and the on-screen keyboard stays put) while the tap
 * resolves. This avoids two mobile failure modes of an `mousedown`-only setup:
 * scroll-swallowed taps and the blur/close racing ahead of the tap.
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

  private onDocumentPointerDown = (e: Event): void => {
    if (!this.el.contains(e.target as Node)) this.close();
  };

  private reposition = (): void => {
    if (!this.list.hidden) this.position();
  };

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
    this.input.setAttribute('enterkeyhint', 'search');
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
    // Re-open on tap/click, including when the field is already focused.
    this.input.addEventListener('focus', () => this.open(this.filter(this.input.value)));
    this.input.addEventListener('click', () => this.open(this.filter(this.input.value)));
    this.input.addEventListener('keydown', (e) => this.onKeydown(e));
    this.input.addEventListener('change', () => {
      const exact = this.items.find((i) => i.label.toLowerCase() === this.input.value.trim().toLowerCase());
      if (!exact) this.selected = null;
    });

    // Close only when focus actually leaves the widget (no fixed-delay race).
    this.el.addEventListener('focusout', (e) => {
      const next = (e as FocusEvent).relatedTarget as Node | null;
      if (!next || !this.el.contains(next)) this.close();
    });
    // Reliable outside-tap close on touch devices.
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    // Keep the flip-up decision correct when the on-screen keyboard resizes
    // the visual viewport after the field receives focus.
    window.addEventListener('resize', this.reposition);
    window.visualViewport?.addEventListener('resize', this.reposition);
    window.visualViewport?.addEventListener('scroll', this.reposition);
  }

  /** Detach the global listeners created in the constructor. */
  destroy(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('scroll', this.reposition);
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
    if (!this.list.hidden) this.position();
  }

  private close(): void {
    this.list.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
    this.active = -1;
  }

  /**
   * Flip the list above the field when there is not enough room below (e.g.
   * the on-screen keyboard leaves only a sliver of the visual viewport).
   */
  private position(): void {
    const rect = this.input.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewportTop = vv?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (vv?.height ?? window.innerHeight);
    const spaceBelow = viewportBottom - rect.bottom;
    const spaceAbove = rect.top - viewportTop;
    const listHeight = Math.min(this.list.scrollHeight || 0, 320);
    const openUp = spaceBelow < listHeight + 16 && spaceAbove > spaceBelow;
    this.list.classList.toggle('combo__list--up', openUp);
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
      const label = document.createElement('span');
      label.textContent = item.label;
      li.append(label);
      if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'combo__hint';
        hint.textContent = item.hint;
        li.append(hint);
      }
      // Keep focus (and the keyboard) on the input while the tap resolves.
      // Do not choose here: a scroll gesture would select the wrong row.
      li.addEventListener('pointerdown', (e) => e.preventDefault());
      li.addEventListener('mousedown', (e) => e.preventDefault());
      li.addEventListener('click', () => this.choose(item));
      li.addEventListener('mouseenter', () => {
        this.active = i;
        this.updateActive();
      });
      this.list.append(li);
    });
  }

  /** Toggle the active row without rebuilding the list (safe mid-tap). */
  private updateActive(): void {
    const nodes = this.list.querySelectorAll<HTMLLIElement>('.combo__item');
    nodes.forEach((node, idx) => node.classList.toggle('is-active', idx === this.active));
  }

  private choose(item: ComboItem): void {
    this.selected = item.value;
    this.input.value = item.label;
    this.close();
    this.opts.onSelect(item.value);
  }

  /** Resolve what Enter should pick, even if the list is no longer open. */
  private currentChoice(): ComboItem | null {
    if (!this.list.hidden && this.active >= 0) {
      const active = this.visible[this.active];
      if (active) return active;
    }
    const query = this.input.value.trim().toLowerCase();
    if (!query) return null;
    const exact = this.items.find((i) => i.label.toLowerCase() === query);
    if (exact) return exact;
    const matches = this.list.hidden ? this.filter(this.input.value) : this.visible;
    return matches[0] ?? null;
  }

  private onKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.list.hidden) {
        this.open(this.filter(this.input.value));
        return;
      }
      if (!this.visible.length) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      this.active = (this.active + delta + this.visible.length) % this.visible.length;
      this.updateActive();
      this.list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' || e.keyCode === 13) {
      const item = this.currentChoice();
      if (item) {
        e.preventDefault();
        this.choose(item);
      }
    } else if (e.key === 'Escape') {
      this.close();
    }
  }
}
