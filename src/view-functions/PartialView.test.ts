import { PartialView } from "./PartialView";


describe('PartialView', () => {
    test('basic partial rendering', () => {
      const array = Array.from(Array(100).keys());
      const pv = new PartialView<number>(array, 0, 4, 5);
      // default view
      expect([...pv.view(array)]).toEqual([0, 1, 2, 3, 4]);
      expect(pv.length).toBe(5);
      expect(pv.reachedStart).toBe(true);
      expect(pv.reachedEnd).toBe(false);
      expect(pv.numElement).toBe(array.length);
      expect(pv.windowSize).toBe(5);
      expect(pv.numElementNotRenderedBefore).toBe(0);
      expect(pv.numElementNotRenderedAfter).toBe(95);
      expect(pv.setWindow(0, 4)).toBe(false);
      expect([...pv.view(array)]).toEqual([0, 1, 2, 3, 4]);
      expect(pv.shiftWindow(5, true)).toBe(5);
      expect([...pv.view(array)]).toEqual([5, 6, 7, 8, 9]);
      expect(pv.shiftWindow(-5, true)).toBe(-5);
      expect([...pv.view(array)]).toEqual([0, 1, 2, 3, 4]);
      expect(pv.length).toBe(5);
  
      // reached top
      expect(pv.shiftWindow(-10, false)).toBeFalsy();
      expect(pv.shiftWindow(0, false)).toBeFalsy();
  
      expect([...pv.view([0, 1, 2])]).toEqual([0, 1, 2]);
      expect(pv.maximumWindowSize).toBe(3);
      expect(pv.length).toBe(3);
    });
  });