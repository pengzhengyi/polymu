import { isIterable, iteratorForEach, patch, peek } from './IterableHelper';

describe('patch test', () => {
  test('iterable1 and iterable2 has same length', () => {
    const iterable1 = [1, 2, 3];
    const iterable2 = [1, 3, 5];
    const matchHandler = (e1: number, e2: number, index: number) => expect(e2 - e1).toEqual(index);
    const failWhenCalled = () => fail();

    patch(iterable1, iterable2, matchHandler, failWhenCalled, failWhenCalled);
  });

  test('iterable1 has longer length', () => {
    const iterable1 = [1, 2, 3, -1, -1];
    const iterable2 = [1, 3, 5];
    const matchHandler = (e1: number, e2: number, index: number) => expect(e2 - e1).toEqual(index);
    const iterable1SurplusHandler = (e1: number) => expect(e1).toEqual(-1);
    const failWhenCalled = () => fail();

    patch(iterable1, iterable2, matchHandler, iterable1SurplusHandler, failWhenCalled);
  });

  test('iterable2 has longer length', () => {
    const iterable1 = [1, 2, 3];
    const iterable2 = [1, 3, 5, -1, -1];
    const matchHandler = (e1: number, e2: number, index: number) => expect(e2 - e1).toEqual(index);
    const iterable2SurplusHandler = (e2: number) => expect(e2).toEqual(-1);
    const failWhenCalled = () => fail();

    patch(iterable1, iterable2, matchHandler, failWhenCalled, iterable2SurplusHandler);
  });

  test('iterable1 is empty', () => {
    const iterable1: Array<number> = [];
    const iterable2 = [1, 1, 1];
    const failWhenCalled = () => fail();
    const iterable2SurplusHandler = (e2: number) => expect(e2).toEqual(1);

    patch(iterable1, iterable2, failWhenCalled, failWhenCalled, iterable2SurplusHandler);
  });

  test('iterable2 is empty', () => {
    const iterable2: Array<number> = [];
    const iterable1 = [1, 1, 1];
    const failWhenCalled = () => fail();
    const iterable1SurplusHandler = (e1: number) => expect(e1).toEqual(1);

    patch(iterable1, iterable2, failWhenCalled, iterable1SurplusHandler, failWhenCalled);
  });
});

describe('isIterable test', () => {
  test('not iterable types', () => {
    expect(isIterable(undefined)).toEqual(false);
    expect(isIterable(null)).toEqual(false);
    expect(isIterable(0)).toEqual(false);
    expect(isIterable(function () {})).toEqual(false);
  });

  test('iterable types', () => {
    expect(isIterable([])).toEqual(true);
    expect(isIterable('abc')).toEqual(true);
    expect(isIterable(new Set())).toEqual(true);
    expect(isIterable(new Map())).toEqual(true);
  });
});

describe('iteratorForEach', () => {
  test('nonempty iterator', () => {
    const array = ['a', 'b'];
    const iterator = array[Symbol.iterator]();
    const callback = jest.fn();
    iteratorForEach(iterator, callback);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, 'a', 0);
    expect(callback).toHaveBeenNthCalledWith(2, 'b', 1);
  });

  test('empty iterator', () => {
    const array: Array<string> = [];
    const iterator = array[Symbol.iterator]();
    const callback = jest.fn();
    iteratorForEach(iterator, callback);
    expect(callback).toHaveBeenCalledTimes(0);
  });
});

describe('peek', () => {
  test('empty iterable', () => {
    const array: Array<number> = [];
    const peekResult = peek(array);
    const { done, value } = peekResult.next();
    expect(done).toEqual(true);
    expect(value).toBeFalsy();
  });

  test('not empty iterable', () => {
    const array: Array<number> = [1, 2];
    const peekResult = peek(array);
    let { done, value } = peekResult.next();
    expect(done).toEqual(false);
    expect(value).toEqual(1);

    ({ done, value } = peekResult.next());
    expect(done).toEqual(false);
    expect(value).toEqual(1);

    ({ done, value } = peekResult.next());
    expect(done).toEqual(false);
    expect(value).toEqual(2);

    ({ done, value } = peekResult.next());
    expect(done).toEqual(true);
    expect(value).toBeFalsy();
  });
});
