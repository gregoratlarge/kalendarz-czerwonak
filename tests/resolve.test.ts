import { describe, it, expect } from 'vitest';
import { resolveAddress, describeEntry } from '../src/resolve';
import type { StreetsFile } from '../src/lib/types';

const file: StreetsFile = {
  rok: 2026,
  localities: [
    { miasto: 'Owińska', pelny_rejon: 3 },
    { miasto: 'Kicin', pelny_rejon: null },
    { miasto: 'Czerwonak', pelny_rejon: null },
  ],
  streets: [
    { miasto: 'Owińska', ulica: 'Kwiatowa', rejon: 3 },
    { miasto: 'Kicin', ulica: 'Poznańska', rejon: 1, parzystosc: 'nieparzyste' },
    { miasto: 'Kicin', ulica: 'Poznańska', rejon: 2, parzystosc: 'parzyste' },
    { miasto: 'Kicin', ulica: 'Berberysowa', rejon: 1 },
    { miasto: 'Czerwonak', ulica: 'Źródlana', rejon: 8, nr_do: 73 },
    { miasto: 'Czerwonak', ulica: 'Źródlana', rejon: 9, nr_od: 74 },
  ],
};

describe('resolveAddress', () => {
  it('resolves a single-street match', () => {
    const r = resolveAddress(file, 'Kicin', 'Berberysowa');
    expect(r).toEqual({ kind: 'resolved', rejon: 1, entry: file.streets[3], viaLocality: false });
  });

  it('resolves a whole locality without a street', () => {
    const r = resolveAddress(file, 'Owińska', null);
    expect(r).toMatchObject({ kind: 'resolved', rejon: 3, viaLocality: true });
  });

  it('resolves whole-locality coverage for an unknown street', () => {
    const r = resolveAddress(file, 'Owińska', 'Nieistniejąca');
    expect(r).toMatchObject({ kind: 'resolved', rejon: 3, viaLocality: true });
  });

  it('disambiguates by house-number parity', () => {
    expect(resolveAddress(file, 'Kicin', 'Poznańska', 12)).toMatchObject({ rejon: 2 });
    expect(resolveAddress(file, 'Kicin', 'Poznańska', 13)).toMatchObject({ rejon: 1 });
  });

  it('disambiguates by house-number range', () => {
    expect(resolveAddress(file, 'Czerwonak', 'Źródlana', 50)).toMatchObject({ rejon: 8 });
    expect(resolveAddress(file, 'Czerwonak', 'Źródlana', 100)).toMatchObject({ rejon: 9 });
  });

  it('reports ambiguity when no number is given', () => {
    const r = resolveAddress(file, 'Kicin', 'Poznańska', null);
    expect(r?.kind).toBe('ambiguous');
    if (r?.kind === 'ambiguous') expect(r.candidates).toHaveLength(2);
  });

  it('returns null for an unknown address without locality coverage', () => {
    expect(resolveAddress(file, 'Kicin', 'Nieistniejąca', null)).toBeNull();
  });
});

describe('describeEntry', () => {
  it('describes parity, ranges and plain streets', () => {
    expect(describeEntry({ miasto: 'x', ulica: 'y', rejon: 1 })).toBe('cała ulica');
    expect(describeEntry({ miasto: 'x', ulica: 'y', rejon: 1, parzystosc: 'parzyste' })).toBe('numery parzyste');
    expect(describeEntry({ miasto: 'x', ulica: 'y', rejon: 1, nr_od: 74 })).toBe('numery od 74');
    expect(describeEntry({ miasto: 'x', ulica: 'y', rejon: 1, nr_do: 73 })).toBe('numery do 73');
  });
});
