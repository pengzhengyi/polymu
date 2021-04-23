import { CircularArray } from './CircularArray';

describe('CircularArray test', () => {
  test('basic adding', () => {
    const circularArray = new CircularArray(3);
    expect(circularArray.capacity).toEqual(3);
    expect(circularArray).toHaveLength(0);
    expect(circularArray.isEmpty).toBe(true);
    expect(circularArray.isFull).toBe(false);
    expect(Array.from(circularArray)).toEqual([]);

    circularArray.add(1);
    expect(circularArray).toHaveLength(1);
    expect(1).toEqual(circularArray.get(0));
    expect(circularArray.isEmpty).toBe(false);
    expect(circularArray.isFull).toBe(false);
    expect(Array.from(circularArray)).toEqual([1]);

    circularArray.add(2);
    expect(circularArray).toHaveLength(2);
    expect(1).toEqual(circularArray.get(0));
    expect(2).toEqual(circularArray.get(1));
    expect(circularArray.isEmpty).toBe(false);
    expect(circularArray.isFull).toBe(false);
    expect(Array.from(circularArray)).toEqual([1, 2]);

    circularArray.add(3);
    expect(circularArray).toHaveLength(3);
    expect(1).toEqual(circularArray.get(0));
    expect(2).toEqual(circularArray.get(1));
    expect(3).toEqual(circularArray.get(2));
    expect(circularArray.isEmpty).toBe(false);
    expect(circularArray.isFull).toBe(true);
    expect(Array.from(circularArray)).toEqual([1, 2, 3]);

    circularArray.add(4);
    expect(circularArray).toHaveLength(3);
    expect(2).toEqual(circularArray.get(0));
    expect(3).toEqual(circularArray.get(1));
    expect(4).toEqual(circularArray.get(2));
    expect(circularArray.isEmpty).toBe(false);
    expect(circularArray.isFull).toBe(true);
    expect(Array.from(circularArray)).toEqual([2, 3, 4]);

    circularArray.add(5);
    expect(circularArray).toHaveLength(3);
    expect(3).toEqual(circularArray.get(0));
    expect(4).toEqual(circularArray.get(1));
    expect(5).toEqual(circularArray.get(2));
    expect(circularArray.isEmpty).toBe(false);
    expect(circularArray.isFull).toBe(true);
    expect(Array.from(circularArray)).toEqual([3, 4, 5]);

    circularArray.add(6);
    expect(circularArray).toHaveLength(3);
    expect(4).toEqual(circularArray.get(0));
    expect(5).toEqual(circularArray.get(1));
    expect(6).toEqual(circularArray.get(2));
    expect(circularArray.isEmpty).toBe(false);
    expect(circularArray.isFull).toBe(true);
    expect(Array.from(circularArray)).toEqual([4, 5, 6]);
    expect(Array.from(circularArray.slice(0, 2))).toEqual([4, 5]);

    circularArray.add(7);
    expect(circularArray).toHaveLength(3);
    expect(5).toEqual(circularArray.get(0));
    expect(6).toEqual(circularArray.get(1));
    expect(7).toEqual(circularArray.get(2));
    expect(circularArray.isEmpty).toBe(false);
    expect(circularArray.isFull).toBe(true);
    expect(Array.from(circularArray)).toEqual([5, 6, 7]);
    expect(Array.from(circularArray.slice(1, 3))).toEqual([6, 7]);
  });

  test('capacity change', () => {
    const circularArray = new CircularArray(3);
    circularArray.add(1);
    circularArray.add(2);
    circularArray.add(3);
    expect(circularArray).toHaveLength(3);
    expect(circularArray.capacity).toEqual(3);
    expect(1).toEqual(circularArray.get(0));
    expect(2).toEqual(circularArray.get(1));
    expect(3).toEqual(circularArray.get(2));

    circularArray.capacity = 5;
    expect(circularArray).toHaveLength(3);
    expect(circularArray.capacity).toEqual(5);
    expect(1).toEqual(circularArray.get(0));
    expect(2).toEqual(circularArray.get(1));
    expect(3).toEqual(circularArray.get(2));

    circularArray.add(4);
    circularArray.add(5);
    circularArray.add(6);
    expect(circularArray).toHaveLength(5);
    expect(circularArray.capacity).toEqual(5);
    expect(Array.from(circularArray)).toEqual([2, 3, 4, 5, 6]);

    circularArray.capacity = 2;
    expect(circularArray).toHaveLength(2);
    expect(circularArray.capacity).toEqual(2);
    expect(Array.from(circularArray)).toEqual([2, 3]);

    circularArray.capacity = 4;
    expect(circularArray).toHaveLength(2);
    expect(circularArray.capacity).toEqual(4);
    expect(Array.from(circularArray)).toEqual([2, 3]);

    circularArray.add(4);
    circularArray.add(5);
    circularArray.add(6);
    circularArray.add(7);
    expect(circularArray).toHaveLength(4);
    expect(circularArray.capacity).toEqual(4);
    expect(Array.from(circularArray)).toEqual([4, 5, 6, 7]);

    circularArray.capacity = 5;
    expect(circularArray).toHaveLength(4);
    expect(circularArray.capacity).toEqual(5);
    expect(Array.from(circularArray)).toEqual([4, 5, 6, 7]);

    circularArray.capacity = 3;
    expect(circularArray).toHaveLength(3);
    expect(circularArray.capacity).toEqual(3);
    expect(Array.from(circularArray)).toEqual([4, 5, 6]);
  });

  test('shift towards start', () => {
    const circularArray: CircularArray<string> = new CircularArray(5);
    circularArray.add('v');
    circularArray.add('w');
    circularArray.add('x');
    circularArray.add('y');
    circularArray.add('z');
    expect(circularArray.isFull).toBe(true);

    let onEnter = jest.fn();
    let onExit = jest.fn();
    circularArray.shift(-3, ['s', 't', 'u'], onExit, onEnter);
    expect(circularArray.get(0)).toEqual('s');
    expect(circularArray.get(1)).toEqual('t');
    expect(circularArray.get(2)).toEqual('u');
    expect(circularArray.get(3)).toEqual('v');
    expect(circularArray.get(4)).toEqual('w');
    expect(onEnter.mock.calls).toHaveLength(3);
    expect(onExit.mock.calls).toHaveLength(3);
    expect(onEnter.mock.calls[0]).toEqual(['s', 0]);
    expect(onEnter.mock.calls[1]).toEqual(['t', 1]);
    expect(onEnter.mock.calls[2]).toEqual(['u', 2]);
    expect(onExit.mock.calls[0]).toEqual(['x', 2]);
    expect(onExit.mock.calls[1]).toEqual(['y', 3]);
    expect(onExit.mock.calls[2]).toEqual(['z', 4]);

    onEnter = jest.fn();
    onExit = jest.fn();
    circularArray.shift(
      -4,
      (function* () {
        yield 'o';
        yield 'p';
        yield 'q';
        yield 'r';
      })(),
      onExit,
      onEnter
    );

    expect(circularArray.get(0)).toEqual('o');
    expect(circularArray.get(1)).toEqual('p');
    expect(circularArray.get(2)).toEqual('q');
    expect(circularArray.get(3)).toEqual('r');
    expect(circularArray.get(4)).toEqual('s');

    expect(onEnter.mock.calls).toHaveLength(4);
    expect(onExit.mock.calls).toHaveLength(4);
    expect(onEnter.mock.calls[0]).toEqual(['o', 0]);
    expect(onEnter.mock.calls[1]).toEqual(['p', 1]);
    expect(onEnter.mock.calls[2]).toEqual(['q', 2]);
    expect(onEnter.mock.calls[3]).toEqual(['r', 3]);
    expect(onExit.mock.calls[0]).toEqual(['t', 1]);
    expect(onExit.mock.calls[1]).toEqual(['u', 2]);
    expect(onExit.mock.calls[2]).toEqual(['v', 3]);
    expect(onExit.mock.calls[3]).toEqual(['w', 4]);
  });

  test('shift towards end', () => {
    const circularArray: CircularArray<string> = new CircularArray(5);
    circularArray.add('a');
    circularArray.add('b');
    circularArray.add('c');
    circularArray.add('d');
    circularArray.add('e');
    expect(circularArray.isFull).toBe(true);

    let onEnter = jest.fn();
    let onExit = jest.fn();
    circularArray.shift(2, ['f', 'g'], onExit, onEnter);
    expect(circularArray.get(0)).toEqual('c');
    expect(circularArray.get(1)).toEqual('d');
    expect(circularArray.get(2)).toEqual('e');
    expect(circularArray.get(3)).toEqual('f');
    expect(circularArray.get(4)).toEqual('g');

    expect(onEnter.mock.calls).toHaveLength(2);
    expect(onExit.mock.calls).toHaveLength(2);
    expect(onEnter.mock.calls[0]).toEqual(['f', 3]);
    expect(onEnter.mock.calls[1]).toEqual(['g', 4]);
    expect(onExit.mock.calls[0]).toEqual(['a', 0]);
    expect(onExit.mock.calls[1]).toEqual(['b', 1]);

    onEnter = jest.fn();
    onExit = jest.fn();
    circularArray.shift(
      4,
      (function* () {
        yield 'h';
        yield 'i';
        yield 'j';
        yield 'k';
      })(),
      onExit,
      onEnter
    );

    expect(circularArray.get(0)).toEqual('g');
    expect(circularArray.get(1)).toEqual('h');
    expect(circularArray.get(2)).toEqual('i');
    expect(circularArray.get(3)).toEqual('j');
    expect(circularArray.get(4)).toEqual('k');

    expect(onEnter.mock.calls).toHaveLength(4);
    expect(onExit.mock.calls).toHaveLength(4);
    expect(onEnter.mock.calls[0]).toEqual(['h', 1]);
    expect(onEnter.mock.calls[1]).toEqual(['i', 2]);
    expect(onEnter.mock.calls[2]).toEqual(['j', 3]);
    expect(onEnter.mock.calls[3]).toEqual(['k', 4]);
    expect(onExit.mock.calls[0]).toEqual(['c', 0]);
    expect(onExit.mock.calls[1]).toEqual(['d', 1]);
    expect(onExit.mock.calls[2]).toEqual(['e', 2]);
    expect(onExit.mock.calls[3]).toEqual(['f', 3]);
  });

  test('fit', () => {
    const circularArray: CircularArray<string> = new CircularArray(5);
    let onEnter = jest.fn();
    let onExit = jest.fn();
    circularArray.fit(['a', 'b', 'c', 'd', 'e'], onExit, onEnter);

    expect(circularArray.get(0)).toEqual('a');
    expect(circularArray.get(1)).toEqual('b');
    expect(circularArray.get(2)).toEqual('c');
    expect(circularArray.get(3)).toEqual('d');
    expect(circularArray.get(4)).toEqual('e');

    expect(circularArray.isFull).toBe(true);
    expect(circularArray).toHaveLength(5);
    expect(onEnter.mock.calls).toHaveLength(5);
    expect(onExit.mock.calls).toHaveLength(0);
    expect(onEnter.mock.calls[0]).toEqual(['a', 0]);
    expect(onEnter.mock.calls[1]).toEqual(['b', 1]);
    expect(onEnter.mock.calls[2]).toEqual(['c', 2]);
    expect(onEnter.mock.calls[3]).toEqual(['d', 3]);
    expect(onEnter.mock.calls[4]).toEqual(['e', 4]);

    onEnter = jest.fn();
    onExit = jest.fn();

    circularArray.fit(
      (function* () {
        yield 'D';
        yield 'E';
        yield 'F';
      })(),
      onExit,
      onEnter
    );

    expect(circularArray.get(0)).toEqual('D');
    expect(circularArray.get(1)).toEqual('E');
    expect(circularArray.get(2)).toEqual('F');

    expect(circularArray.isFull).toBe(false);
    expect(circularArray).toHaveLength(3);
    expect(onEnter.mock.calls).toHaveLength(3);
    expect(onExit.mock.calls).toHaveLength(5);
    expect(onEnter.mock.calls[0]).toEqual(['D', 0]);
    expect(onEnter.mock.calls[1]).toEqual(['E', 1]);
    expect(onEnter.mock.calls[2]).toEqual(['F', 2]);
    expect(new Set(onExit.mock.calls.map((call) => call[0]))).toEqual(
      new Set(['a', 'b', 'c', 'd', 'e'])
    );

    const numRandomAdd = Math.floor(Math.random() * (30 - 20) + 20);
    for (let i = 0; i < numRandomAdd; i++) {
      circularArray.add('RANDOM');
    }

    expect(circularArray.isFull).toBe(true);
    expect(circularArray).toHaveLength(5);
    onEnter = jest.fn();
    onExit = jest.fn();
    const iterable = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    circularArray.fit(iterable, onExit, onEnter);

    expect(circularArray.isFull).toBe(true);
    expect(circularArray).toHaveLength(10);
    expect([...circularArray.slice(2, 6)]).toEqual(['c', 'd', 'e', 'f']);
    expect(onEnter.mock.calls).toHaveLength(10);
    expect(onExit.mock.calls).toHaveLength(5);
    expect(onEnter.mock.calls.map((call) => call[0])).toEqual(iterable);
    expect(new Set(onExit.mock.calls.map((call) => call[0]))).toEqual(new Set(['RANDOM']));
  });

  test('shift towards end with a large capacity', () => {
    // initialization
    const circularArray: CircularArray<number> = new CircularArray(1000);
    circularArray.add(10);
    circularArray.add(11);
    circularArray.add(12);
    circularArray.add(13);
    expect(circularArray).toHaveLength(4);
    expect(circularArray.get(0)).toEqual(10);
    expect(circularArray.get(2)).toEqual(12);

    // shift towards end
    const onEnter = jest.fn();
    const onExit = jest.fn();
    circularArray.shift(2, [21, 22], onExit, onEnter);
    expect(circularArray).toHaveLength(4);
    expect(circularArray.get(0)).toEqual(12);
    expect(circularArray.get(1)).toEqual(13);
    expect(circularArray.get(2)).toEqual(21);
    expect(circularArray.get(3)).toEqual(22);
    expect(onEnter.mock.calls).toHaveLength(2);
    expect(onExit.mock.calls).toHaveLength(2);
    expect(onEnter.mock.calls[0]).toEqual([21, 2]);
    expect(onEnter.mock.calls[1]).toEqual([22, 3]);
    expect(onExit.mock.calls[0]).toEqual([10, 0]);
    expect(onExit.mock.calls[1]).toEqual([11, 1]);
  });

  test('shift past start with a large capacity', () => {
    // initialization
    const circularArray: CircularArray<number> = new CircularArray(1000);
    circularArray.add(10);
    circularArray.add(11);
    circularArray.add(12);
    circularArray.add(13);
    circularArray.add(14);
    expect(circularArray).toHaveLength(5);
    expect(circularArray.get(0)).toEqual(10);
    expect(circularArray.get(2)).toEqual(12);

    // shift towards start
    const onEnter = jest.fn();
    const onExit = jest.fn();
    circularArray.shift(-2, [0, 1], onExit, onEnter);
    expect(circularArray).toHaveLength(5);
    expect(circularArray.get(0)).toEqual(0);
    expect(circularArray.get(1)).toEqual(1);
    expect(circularArray.get(2)).toEqual(10);
    expect(circularArray.get(3)).toEqual(11);
    expect(circularArray.get(4)).toEqual(12);
    expect(onEnter.mock.calls).toHaveLength(2);
    expect(onExit.mock.calls).toHaveLength(2);
    expect(onEnter.mock.calls[0]).toEqual([0, 0]);
    expect(onEnter.mock.calls[1]).toEqual([1, 1]);
    expect(onExit.mock.calls[0]).toEqual([13, 3]);
    expect(onExit.mock.calls[1]).toEqual([14, 4]);
  });
});
