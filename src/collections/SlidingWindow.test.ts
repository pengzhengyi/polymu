import { LazyCollectionProvider, UnmaterializableCollectionProvider } from './Collection';
import { ResizeStrategy, SlidingWindow } from './SlidingWindow';

describe('SlidingWindow', () => {
  test('index and iterating', () => {
    const array = ['a', 'b', 'c', 'd', 'e'];
    const window = new SlidingWindow(0, 2, array);
    expect(window.get(0)).toEqual('a');
    expect(window.get(1)).toEqual('b');
    expect(window.get(2)).toEqual('c');
    expect(Array.from(window)).toEqual(array.slice(0, 3));
    expect(window.startIndex).toEqual(0);
    expect(window.endIndex).toEqual(2);
    expect(window.windowSize).toEqual(3);
    expect(window).toHaveLength(3);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(true);
    expect(window.numElementBefore).toEqual(0);
    expect(window.numElementAfter).toEqual(2);
    expect(window.reachedStart).toBe(true);
    expect(window.reachedEnd).toBe(false);

    window.setWindow(2, 4);
    expect(window.get(0)).toEqual('c');
    expect(window.get(1)).toEqual('d');
    expect(window.get(2)).toEqual('e');
    expect(Array.from(window)).toEqual(array.slice(2, 5));
    expect(window.startIndex).toEqual(2);
    expect(window.endIndex).toEqual(4);
    expect(window.windowSize).toEqual(3);
    expect(window).toHaveLength(3);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(true);
    expect(window.numElementBefore).toEqual(2);
    expect(window.numElementAfter).toEqual(0);
    expect(window.reachedStart).toBe(false);
    expect(window.reachedEnd).toBe(true);
  });

  test('slice SlidingWindow', () => {
    const array = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
    const window = new SlidingWindow(0, 5, array);
    // a -- f
    expect(Array.from(window.slice(0, 2))).toEqual(['a', 'b']);
    expect(Array.from(window.slice(2, 4))).toEqual(['c', 'd']);

    // slice past end
    expect(Array.from(window.slice(4, 10))).toEqual(['e', 'f']);

    // slice start index past end
    expect(Array.from(window.slice(6, 8))).toEqual([]);

    // empty slice
    expect(Array.from(window.slice(6, 4))).toEqual([]);
  });

  test('unmaterializable iterable', () => {
    const array = ['a', 'b', 'c', 'd', 'e'];
    const collection = new UnmaterializableCollectionProvider(array);
    const window = new SlidingWindow(1, 3, collection);
    expect(window.startIndex).toEqual(1);
    expect(window.endIndex).toEqual(3);
    expect(window.windowSize).toEqual(3);
    expect(window.length).toBeNull();
    expect(window.isWindowEmpty).toBeNull();
    expect(window.isWindowFull).toBeNull();
    expect(window.numElementBefore).toBeNull();
    expect(window.numElementAfter).toBeNull();
    expect(window.reachedStart).toBe(false);
    expect(window.reachedEnd).toBeNull();

    expect(window.get(0)).toEqual('b');
    expect(window.get(1)).toEqual('c');
    expect(window.get(2)).toEqual('d');
    expect(window.startIndex).toEqual(1);
    expect(window.endIndex).toEqual(3);
    expect(window.windowSize).toEqual(3);
    expect(window.length).toBeNull();
    expect(window.isWindowEmpty).toBeNull();
    expect(window.isWindowFull).toBeNull();
    expect(window.numElementBefore).toBeNull();
    expect(window.numElementAfter).toBeNull();
    expect(window.reachedStart).toBe(false);
    expect(window.reachedEnd).toBeNull();

    // iterate through the collection so that it knows its length
    expect(Array.from(collection)).toEqual(array);
    expect(window.startIndex).toEqual(1);
    expect(window.endIndex).toEqual(3);
    expect(window.windowSize).toEqual(3);
    expect(window).toHaveLength(3);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(true);
    expect(window.numElementBefore).toEqual(1);
    expect(window.numElementAfter).toEqual(1);
    expect(window.reachedStart).toBe(false);
    expect(window.reachedEnd).toBe(false);
  });

  test('uninitialized SlidingWindow state', () => {
    const window = new SlidingWindow();
    expect(window.startIndex).toBeUndefined();
    expect(window.endIndex).toBeUndefined();
    expect(window.windowSize).toBeUndefined();
    expect(window.iterable).toBeUndefined();
    expect(window.isWindowEmpty).toBeUndefined();
    expect(window.isWindowFull).toBeUndefined();
    expect(window.length).toBeUndefined();
    expect(window.numElementBefore).toBeUndefined();
    expect(window.numElementAfter).toBeUndefined();
    expect(window.reachedStart).toBeUndefined();
    expect(window.reachedEnd).toBeUndefined();
  });

  test('iterate uninitialized SlidingWindow', () => {
    const window = new SlidingWindow();
    const result = Array.from(window);
    expect(result).toEqual([]);
  });

  test('changing iterable', () => {
    const array = ['a', 'b', 'c', 'd', 'e'];
    const window = new SlidingWindow(1, 4, array, ResizeStrategy.ShiftAndShrinkIfNecessary);
    expect(window.get(0)).toEqual('b');
    expect(window.get(1)).toEqual('c');
    expect(window.get(2)).toEqual('d');
    expect(window.get(3)).toEqual('e');
    expect(Array.from(window)).toEqual(array.slice(1));
    expect(window.startIndex).toEqual(1);
    expect(window.endIndex).toEqual(4);
    expect(window.windowSize).toEqual(4);
    expect(window).toHaveLength(4);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(true);
    expect(window.numElementBefore).toEqual(1);
    expect(window.numElementAfter).toEqual(0);
    expect(window.reachedStart).toBe(false);
    expect(window.reachedEnd).toBe(true);

    const newArray = ['A', 'B', 'C'];
    window.iterable = newArray;
    expect(window.get(0)).toEqual('A');
    expect(window.get(1)).toEqual('B');
    expect(window.get(2)).toEqual('C');
    expect(Array.from(window)).toEqual(newArray);
    expect(window.startIndex).toEqual(0);
    expect(window.endIndex).toEqual(2);
    expect(window.windowSize).toEqual(3);
    expect(window).toHaveLength(3);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(true);
    expect(window.numElementBefore).toEqual(0);
    expect(window.numElementAfter).toEqual(0);
    expect(window.reachedStart).toBe(true);
    expect(window.reachedEnd).toBe(true);

    // lazy collection
    const iterable: Iterable<string> = (function* () {
      yield 'e';
      yield 'f';
      yield 'g';
      yield 'h';
      yield 'i';
    })();
    const lazyCollection = new LazyCollectionProvider(iterable);
    window.iterable = lazyCollection;
    expect(window.startIndex).toEqual(0);
    expect(window.endIndex).toEqual(2);
    expect(window.windowSize).toEqual(3);
    expect(window.length).toBeNull();
    expect(window.isWindowEmpty).toBeNull();
    expect(window.isWindowFull).toBeNull();
    expect(window.numElementBefore).toEqual(0);
    expect(window.numElementAfter).toBeNull();
    expect(window.reachedStart).toBe(true);
    expect(window.reachedEnd).toBeNull();

    expect(window.get(0)).toEqual('e');
    expect(window.get(1)).toEqual('f');

    expect(window.startIndex).toEqual(0);
    expect(window.endIndex).toEqual(2);
    expect(window.windowSize).toEqual(3);
    expect(window.length).toBeNull();
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBeNull();
    expect(window.numElementBefore).toEqual(0);
    expect(window.numElementAfter).toBeNull();
    expect(window.reachedStart).toBe(true);
    expect(window.reachedEnd).toBeNull();

    expect(window.get(2)).toEqual('g');
    expect(window.startIndex).toEqual(0);
    expect(window.endIndex).toEqual(2);
    expect(window.windowSize).toEqual(3);
    expect(window).toHaveLength(3);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(true);
    expect(window.numElementBefore).toEqual(0);
    expect(window.numElementAfter).toBeNull();
    expect(window.reachedStart).toBe(true);
    expect(window.reachedEnd).toBeNull();

    // materialize the collection
    expect(Array.from(lazyCollection)).toEqual(['e', 'f', 'g', 'h', 'i']);
    expect(window.startIndex).toEqual(0);
    expect(window.endIndex).toEqual(2);
    expect(window.windowSize).toEqual(3);
    expect(window).toHaveLength(3);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(true);
    expect(window.numElementBefore).toEqual(0);
    expect(window.numElementAfter).toEqual(2);
    expect(window.reachedStart).toBe(true);
    expect(window.reachedEnd).toBe(false);

    // no iterable
    window.iterable = undefined;
    expect(window.startIndex).toEqual(0);
    expect(window.endIndex).toEqual(2);
    expect(window.windowSize).toEqual(3);
    expect(window.length).toBeUndefined();
    expect(window.isWindowEmpty).toBeUndefined();
    expect(window.isWindowFull).toBeUndefined();
    expect(window.numElementBefore).toBeUndefined();
    expect(window.numElementAfter).toBeUndefined();
    expect(window.reachedStart).toBeUndefined();
    expect(window.reachedEnd).toBeUndefined();
  });

  test('shrink resize strategy', () => {
    const array = ['a', 'b', 'c', 'd', 'e'];
    const window = new SlidingWindow(4, 6, array, ResizeStrategy.Shrink);
    expect(window.startIndex).toEqual(4);
    expect(window.endIndex).toEqual(4);
    expect(window.windowSize).toEqual(1);
    expect(window).toHaveLength(1);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(true);
    expect(window.numElementBefore).toEqual(4);
    expect(window.numElementAfter).toEqual(0);
    expect(window.reachedStart).toBe(false);
    expect(window.reachedEnd).toBe(true);

    const array2 = ['a', 'b', 'c'];
    const window2 = new SlidingWindow(5, 9, array2, ResizeStrategy.Shrink);
    expect(window2.startIndex).toEqual(2);
    expect(window2.endIndex).toEqual(2);
    expect(window2.windowSize).toEqual(1);
    expect(window2).toHaveLength(1);
    expect(window2.isWindowEmpty).toBe(false);
    expect(window2.isWindowFull).toBe(true);
    expect(window2.numElementBefore).toEqual(2);
    expect(window2.numElementAfter).toEqual(0);
    expect(window2.reachedStart).toBe(false);
    expect(window2.reachedEnd).toBe(true);
  });

  test('shift resize strategy', () => {
    const array = ['a', 'b', 'c', 'd', 'e'];
    const window = new SlidingWindow(4, 6, array, ResizeStrategy.Shift);
    expect(window.startIndex).toEqual(2);
    expect(window.endIndex).toEqual(4);
    expect(window.windowSize).toEqual(3);
    expect(window).toHaveLength(3);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(true);
    expect(window.numElementBefore).toEqual(2);
    expect(window.numElementAfter).toEqual(0);
    expect(window.reachedStart).toBe(false);
    expect(window.reachedEnd).toBe(true);

    const array2 = ['a', 'b', 'c'];
    const window2 = new SlidingWindow(1, 5, array2, ResizeStrategy.Shift);
    expect(window2.startIndex).toEqual(0);
    expect(window2.endIndex).toEqual(4);
    expect(window2.windowSize).toEqual(5);
    expect(window2).toHaveLength(3);
    expect(window2.isWindowEmpty).toBe(false);
    expect(window2.isWindowFull).toBe(false);
    expect(window2.numElementBefore).toEqual(0);
    expect(window2.numElementAfter).toEqual(0);
    expect(window2.reachedStart).toBe(true);
    expect(window2.reachedEnd).toBe(true);

    const array3 = ['a', 'b', 'c'];
    const window3 = new SlidingWindow(4, 8, array3, ResizeStrategy.Shift);
    expect(window3.startIndex).toEqual(0);
    expect(window3.endIndex).toEqual(4);
    expect(window3.windowSize).toEqual(5);
    expect(window3).toHaveLength(3);
    expect(window3.isWindowEmpty).toBe(false);
    expect(window3.isWindowFull).toBe(false);
    expect(window3.numElementBefore).toEqual(0);
    expect(window3.numElementAfter).toEqual(0);
    expect(window3.reachedStart).toBe(true);
    expect(window3.reachedEnd).toBe(true);
  });

  test('shift and shrink resize strategy', () => {
    const array = ['a', 'b', 'c', 'd', 'e'];
    const window = new SlidingWindow(4, 6, array, ResizeStrategy.ShiftAndShrinkIfNecessary);
    expect(window.startIndex).toEqual(2);
    expect(window.endIndex).toEqual(4);
    expect(window.windowSize).toEqual(3);
    expect(window).toHaveLength(3);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(true);
    expect(window.numElementBefore).toEqual(2);
    expect(window.numElementAfter).toEqual(0);
    expect(window.reachedStart).toBe(false);
    expect(window.reachedEnd).toBe(true);

    const array2 = ['a', 'b', 'c'];
    const window2 = new SlidingWindow(1, 5, array2, ResizeStrategy.ShiftAndShrinkIfNecessary);
    expect(window2.startIndex).toEqual(0);
    expect(window2.endIndex).toEqual(2);
    expect(window2.windowSize).toEqual(3);
    expect(window2).toHaveLength(3);
    expect(window2.isWindowEmpty).toBe(false);
    expect(window2.isWindowFull).toBe(true);
    expect(window2.numElementBefore).toEqual(0);
    expect(window2.numElementAfter).toEqual(0);
    expect(window2.reachedStart).toBe(true);
    expect(window2.reachedEnd).toBe(true);

    const array3 = ['a', 'b', 'c'];
    const window3 = new SlidingWindow(4, 8, array3, ResizeStrategy.ShiftAndShrinkIfNecessary);
    expect(window3.startIndex).toEqual(0);
    expect(window3.endIndex).toEqual(2);
    expect(window3.windowSize).toEqual(3);
    expect(window3).toHaveLength(3);
    expect(window3.isWindowEmpty).toBe(false);
    expect(window3.isWindowFull).toBe(true);
    expect(window3.numElementBefore).toEqual(0);
    expect(window3.numElementAfter).toEqual(0);
    expect(window3.reachedStart).toBe(true);
    expect(window3.reachedEnd).toBe(true);
  });

  test('resize when window is larger than iterable', () => {
    const array = ['a', 'b', 'c', 'd', 'e'];
    const window = new SlidingWindow(0, 7, array, ResizeStrategy.NoAction);
    expect(window.get(0)).toEqual('a');
    expect(window.get(1)).toEqual('b');
    expect(window.get(2)).toEqual('c');
    expect(Array.from(window)).toEqual(array);
    expect(window.startIndex).toEqual(0);
    expect(window.endIndex).toEqual(7);
    expect(window.windowSize).toEqual(8);
    expect(window).toHaveLength(5);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(false);
    expect(window.numElementBefore).toEqual(0);
    expect(window.numElementAfter).toEqual(0);
    expect(window.reachedStart).toBe(true);
    expect(window.reachedEnd).toBe(true);

    window.resizeStrategy = ResizeStrategy.Shift;
    expect(window.get(0)).toEqual('a');
    expect(window.get(1)).toEqual('b');
    expect(window.get(2)).toEqual('c');
    expect(Array.from(window)).toEqual(array);
    expect(window.startIndex).toEqual(0);
    expect(window.endIndex).toEqual(7);
    expect(window.windowSize).toEqual(8);
    expect(window).toHaveLength(5);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(false);
    expect(window.numElementBefore).toEqual(0);
    expect(window.numElementAfter).toEqual(0);
    expect(window.reachedStart).toBe(true);
    expect(window.reachedEnd).toBe(true);

    window.resizeStrategy = ResizeStrategy.Shrink;
    expect(window.get(0)).toEqual('a');
    expect(window.get(1)).toEqual('b');
    expect(window.get(2)).toEqual('c');
    expect(Array.from(window)).toEqual(array);
    expect(window.startIndex).toEqual(0);
    expect(window.endIndex).toEqual(4);
    expect(window.windowSize).toEqual(5);
    expect(window).toHaveLength(5);
    expect(window.isWindowEmpty).toBe(false);
    expect(window.isWindowFull).toBe(true);
    expect(window.numElementBefore).toEqual(0);
    expect(window.numElementAfter).toEqual(0);
    expect(window.reachedStart).toBe(true);
    expect(window.reachedEnd).toBe(true);
  });
});
