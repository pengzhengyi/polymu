import { FilteredView } from './FilteredView';

describe('FilteredView', () => {
  test('basic filtering', () => {
    const array = [1, 2, 3, 4, 5];
    const fv = new FilteredView<number>();
    expect([...fv.view(array)]).toEqual([1, 2, 3, 4, 5]);
    expect(fv.addFilterFunction('no 1', (n) => n != 1)).toBe(true);
    expect([...fv.view(array)]).toEqual([2, 3, 4, 5]);

    const lessThan3 = (n: number) => n <= 3;
    expect(fv.addFilterFunction('<= 3', lessThan3)).toBe(true);
    expect(fv.addFilterFunction('<= 3', lessThan3)).toBe(false);
    expect([...fv.view(array)]).toEqual([2, 3]);
    expect([...fv.view(array)]).toEqual([2, 3]);
    expect([...fv.view([0, 1, 3, 4])]).toEqual([0, 3]);

    expect(fv.deleteFilterFunction('no 1')).toBe(true);
    expect(fv.deleteFilterFunction('no 1')).toBe(false);
    expect([...fv.view(array)]).toEqual([1, 2, 3]);
    expect([...fv.view([0, 1, 3, 4])]).toEqual([0, 1, 3]);

    expect(fv.clearFilterFunction()).toBe(true);
    expect([...fv.view(array)]).toEqual([1, 2, 3, 4, 5]);
    expect(fv.clearFilterFunction()).toBe(false);
    expect([...fv.view(array)]).toEqual([1, 2, 3, 4, 5]);
  });
});
