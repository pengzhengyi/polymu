import { Partial } from './Partial';

describe('Partial', () => {
  test('basic partial rendering', () => {
    const array = Array.from(Array(100).keys());
    const pv = new Partial<number>(0, 4);
    // default view
    expect([...pv.view(array)]).toEqual([0, 1, 2, 3, 4]);
    expect(pv).toHaveLength(5);
    expect(pv.reachedStart).toBe(true);
    expect(pv.reachedEnd).toBe(false);
    expect(pv.windowSize).toBe(5);
    expect(pv.numElementBefore).toBe(0);
    expect(pv.numElementAfter).toBe(95);
    expect(pv.isWindowEmpty).toBe(false);
    expect(pv.isWindowFull).toBe(true);
    expect(pv.get(1)).toEqual(1);

    expect(pv.setWindow(0, 4)).toBe(false);
    expect([...pv.view(array)]).toEqual([0, 1, 2, 3, 4]);
    expect(pv.shiftWindow(5)).toBe(true);
    expect([...pv.view(array)]).toEqual([5, 6, 7, 8, 9]);
    expect(pv.shiftWindow(-5)).toBe(true);
    expect([...pv.view(array)]).toEqual([0, 1, 2, 3, 4]);
    expect(pv).toHaveLength(5);
    expect(pv.reachedStart).toBe(true);
    expect(pv.startIndex).toBe(0);

    // reached top
    expect(pv.shiftWindow(-10)).toBe(false);
    expect(pv.reachedStart).toBe(true);
    expect(pv.startIndex).toBe(0);
    expect(pv.shiftWindow(0)).toBe(false);
    expect(pv.startIndex).toBe(0);

    expect([...pv.view([0, 1, 2])]).toEqual([0, 1, 2]);
    expect(pv.startIndex).toBe(0);
    expect(pv.endIndex).toBe(4);
    expect(pv.windowSize).toBe(5);
    expect(pv).toHaveLength(3);
  });
});
