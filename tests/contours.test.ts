import { describe, it, expect } from 'vitest';
import { buildContours, polygonArea } from '../src/ui/map/contours';
import { generateWorld } from '../src/engine/generator/world';

describe('map contours', () => {
  it('produces one or more closed smooth polygons per country covering its area', () => {
    const w = generateWorld({ seed: 'contours' });
    const shapes = buildContours(w.geography);
    expect(shapes.byCountry.size).toBe(w.geography.countryOrder.length);
    for (const [r, polys] of shapes.byCountry) {
      expect(polys.length).toBeGreaterThan(0);
      const area = polys.reduce((a, p) => a + polygonArea(p), 0);
      const cells = w.countries[w.geography.countryOrder[r]].area;
      // Smoothing shrinks corners a little; holes (enclaves) subtract. Stay in a sane band.
      expect(area).toBeGreaterThan(cells * 0.5);
      expect(area).toBeLessThan(cells * 1.6);
      for (const p of polys) { expect(p.length % 2).toBe(0); expect(p.length).toBeGreaterThanOrEqual(8); for (const v of p) expect(Number.isFinite(v)).toBe(true); }
    }
  });
  it('handles a single-cell island grid without crashing', () => {
    const geo = { width: 4, height: 3, cells: [-1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1], elevation: new Array(12).fill(0.6), moisture: new Array(12).fill(0.5), countryOrder: ['c_1'] };
    const shapes = buildContours(geo);
    expect(shapes.byCountry.get(0)?.length).toBe(1);
  });
});
