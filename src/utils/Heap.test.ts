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

    expect(heap.length).toBe(0);
    expect(heap.capacity).toBe(10);
    expect(heap.peek()).toBeUndefined();
    expect(heap.pop()).toBeUndefined();
  });

  test('single-element heap', () => {
    heap = new Heap(comparator, 1);
    expect(heap.length).toBe(0);
    heap.push(10);
    expect(heap.length).toBe(1);
    expect(heap.peek()).toBe(10);
    expect(Array.from(heap)).toEqual([10]);
    expect(heap.length).toBe(1);

    expect(heap.pop()).toBe(10);
    expect(heap.length).toBe(0);
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
