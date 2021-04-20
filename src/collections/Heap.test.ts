import Heap from './Heap';

function getRandomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(min);
  return Math.floor(Math.random() * (max - min) + min);
}

describe('Heap sort', () => {
  let heap;
  const comparator = (n1: number, n2: number) => n1 - n2;

  afterEach(() => (heap = undefined));

  test('empty heap', () => {
    heap = new Heap(comparator, 10);

    expect(heap).toHaveLength(0);
    expect(heap.capacity).toBe(10);
    expect(heap.peek()).toBeUndefined();
    expect(heap.pop()).toBeUndefined();
  });

  test('single-element heap', () => {
    heap = new Heap(comparator, 1);
    expect(heap).toHaveLength(0);
    heap.push(10);
    expect(heap).toHaveLength(1);
    expect(heap.peek()).toBe(10);
    expect(Array.from(heap)).toEqual([10]);
    expect(heap).toHaveLength(1);

    expect(heap.pop()).toBe(10);
    expect(heap).toHaveLength(0);
  });

  test('basic sorting', () => {
    heap = new Heap(comparator, 10);

    const array = [1, 2, 3, 4, 5];
    heap.push(...array);

    expect(Array.from(heap.popAll())).toEqual(array);

    const reversedArray = array.reverse();
    heap.push(...reversedArray);
    const result = reversedArray.sort(comparator);
    expect(Array.from(heap.popAll())).toEqual(result);
  });

  test('sorting object', () => {
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

    const comparator = (e1: Cell, e2: Cell) => {
      const rowdiff = e1.row - e2.row;
      if (rowdiff !== 0) {
        return rowdiff;
      } else {
        return e1.cellIndex - e2.cellIndex;
      }
    };
    heap = new Heap(comparator, 3);
    heap.extend(array);
    const result = array.sort(comparator);
    expect(Array.from(heap.popAll())).toEqual(result);
  });

  test('random sorting', () => {
    for (let i = 0; i < 10000; i++) {
      heap = new Heap(comparator, 20);
      const arrayLength = getRandomInt(2, 35);
      const array = [];
      for (let e = 0; e < arrayLength; e++) {
        const element = getRandomInt(-10, 10);
        array.push(element);
        heap.push(element);
      }

      const sortedArray = array.sort(comparator);
      expect(Array.from(heap.popAll())).toEqual(sortedArray);
    }
  });
});
