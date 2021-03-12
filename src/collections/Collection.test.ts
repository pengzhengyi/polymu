import { LazyCollectionProvider, UnmaterializableCollectionProvider } from './Collection';

describe('UnmaterializableCollectionProvider', () => {
  const iterable = [1, 2, 3, 4, 5];
  let collectionProvider: UnmaterializableCollectionProvider<number>;

  beforeEach(() => (collectionProvider = new UnmaterializableCollectionProvider<number>(iterable)));

  test('iteration', () => {
    let i = 0;
    expect(collectionProvider.length).toBeUndefined();
    for (const element of collectionProvider) {
      expect(element).toEqual(iterable[i++]);
    }
    expect(collectionProvider.length).toEqual(5);

    i = 0;
    for (const element of collectionProvider) {
      expect(element).toEqual(iterable[i++]);
    }
  });

  test('indexing', () => {
    expect(collectionProvider[-1]).toBeUndefined();
    expect(collectionProvider[100]).toBeUndefined();
    for (let i = 0; i < iterable.length; i++) {
      expect(collectionProvider[i]).toEqual(iterable[i]);
    }
  });

  test('slicing', () => {
    const slice = collectionProvider.slice(1, 3);
    let index = 1;
    for (const element of slice) {
      expect(element).toEqual(iterable[index++]);
    }
  });
});

describe('LazyCollectionProvider', () => {
  const iterable = [1, 2, 3, 4, 5];
  let collectionProvider: LazyCollectionProvider<number>;

  beforeEach(() => (collectionProvider = new LazyCollectionProvider<number>(iterable)));

  test('iteration', () => {
    let i = 0;
    for (const element of collectionProvider) {
      expect(element).toEqual(iterable[i++]);
    }

    i = 0;
    for (const element of collectionProvider) {
      expect(element).toEqual(iterable[i++]);
    }
  });

  test('indexing', () => {
    expect(collectionProvider[-1]).toBeUndefined();
    expect(collectionProvider[100]).toBeUndefined();
    for (let i = 0; i < iterable.length; i++) {
      expect(collectionProvider[i]).toEqual(iterable[i]);
    }
  });

  test('slicing', () => {
    const slice = collectionProvider.slice(1, 3);
    let index = 1;
    for (const element of slice) {
      expect(element).toEqual(iterable[index++]);
    }
  });

  test('materialization', () => {
    const oneTimeIterable = (function* () {
      yield 1;
      yield 2;
      yield 3;
      yield 4;
      yield 5;
    })();
    const collection = new LazyCollectionProvider<number>(oneTimeIterable);

    let iterationIndex = 0;
    for (const element of collection) {
      if (iterationIndex === 0) {
        expect(element).toEqual(1);
      } else if (iterationIndex === 1) {
        expect(element).toEqual(2);
      } else {
        break;
      }
      iterationIndex++;
    }

    expect(collection[3]).toEqual(4);

    expect(Array.from(collection.slice(-2, 100))).toEqual([1, 2, 3, 4, 5]);
    // materialized
    expect(Array.from(collection.slice(1, 100))).toEqual([2, 3, 4, 5]);
    expect(collection[4]).toEqual(5);
    expect(Array.from(collection)).toEqual([1, 2, 3, 4, 5]);
    expect(collection.length).toEqual(5);
  });
});
