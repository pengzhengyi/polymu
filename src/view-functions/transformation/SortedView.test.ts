import { Sort } from './Sort';

describe('Sorted', () => {
  test('basic sorting', () => {
    const array = [1, 2, 3, 4, 5];
    const sv = new Sort<number>();
    expect([...sv.view(array)]).toEqual([1, 2, 3, 4, 5]);
    expect(sv.addSortingFunction('desc', (n1, n2) => n2 - n1, 1)).toBe(true);
    expect([...sv.view(array)]).toEqual([5, 4, 3, 2, 1]);
    expect([...sv.view(array)]).toEqual([5, 4, 3, 2, 1]);

    const ascSort = (n1: number, n2: number) => n1 - n2;
    expect(sv.addSortingFunction('asc', ascSort, 2)).toBe(true);
    expect(sv.addSortingFunction('asc', ascSort, 2)).toBe(false);
    expect([...sv.view(array)]).toEqual([1, 2, 3, 4, 5]);

    sv.reorderSortingFunction(
      new Map([
        ['desc', 10],
        ['asc', 5],
      ])
    );
    expect([...sv.view(array)]).toEqual([5, 4, 3, 2, 1]);

    expect(sv.deleteSortingFunction('desc')).toBe(true);
    expect([...sv.view(array)]).toEqual([1, 2, 3, 4, 5]);

    expect(sv.deleteSortingFunction('desc')).toBe(false);
    expect([...sv.view(array)]).toEqual([1, 2, 3, 4, 5]);

    expect(sv.clearSortingFunction()).toBe(true);
    expect([...sv.view(array)]).toEqual([1, 2, 3, 4, 5]);
    expect([...sv.view([2, 4, 5])]).toEqual([2, 4, 5]);
    expect(sv.clearSortingFunction()).toBe(false);
  });

  test('Multi Sort', () => {
    interface Cell {
      row: number;
      cellIndex: number;
    }
    const array: Array<Cell> = [
      {
        row: 1,
        cellIndex: 0,
      },
      {
        row: 1,
        cellIndex: 1,
      },
      {
        row: 2,
        cellIndex: 1,
      },
    ];
    const sv = new Sort<Cell>();
    expect(sv.addSortingFunction('row sort asc', (c1, c2) => c1.row - c2.row, 10)).toBe(true);
    expect(
      sv.addSortingFunction('cellIndex sort asc', (c1, c2) => c1.cellIndex - c2.cellIndex, 1)
    ).toBe(true);
    expect([...sv.view(array)]).toEqual([
      {
        row: 1,
        cellIndex: 0,
      },
      {
        row: 1,
        cellIndex: 1,
      },
      {
        row: 2,
        cellIndex: 1,
      },
    ]);

    expect(sv.deleteSortingFunction('cellIndex sort asc')).toBe(true);
    expect(
      sv.addSortingFunction('cellIndex sort desc', (c1, c2) => c2.cellIndex - c1.cellIndex, 1)
    ).toBe(true);
    expect([...sv.view(array)]).toEqual([
      {
        row: 1,
        cellIndex: 1,
      },
      {
        row: 1,
        cellIndex: 0,
      },
      {
        row: 2,
        cellIndex: 1,
      },
    ]);

    expect(
      sv.reorderSortingFunction(
        new Map([
          ['row sort asc', 1],
          ['cellIndex sort desc', 2],
        ])
      )
    ).toBe(true);
    expect([...sv.view(array)]).toEqual([
      {
        row: 1,
        cellIndex: 1,
      },
      {
        row: 2,
        cellIndex: 1,
      },
      {
        row: 1,
        cellIndex: 0,
      },
    ]);
    expect(
      sv.reorderSortingFunction(
        new Map([
          ['row sort asc', 1],
          ['cellIndex sort desc', 2],
        ])
      )
    ).toBe(false);
    expect([...sv.view(array)]).toEqual([
      {
        row: 1,
        cellIndex: 1,
      },
      {
        row: 2,
        cellIndex: 1,
      },
      {
        row: 1,
        cellIndex: 0,
      },
    ]);
  });
});
