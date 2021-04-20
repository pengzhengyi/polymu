import {
  Collection,
  LazyCollectionProvider,
  UnmaterializableCollectionProvider,
} from './Collection';

describe('UnmaterializableCollectionProvider', () => {
  const iterable = [1, 2, 3, 4, 5];
  let collection: UnmaterializableCollectionProvider<number>;

  beforeEach(() => (collection = new UnmaterializableCollectionProvider<number>(iterable)));

  test('iteration', () => {
    let i = 0;
    expect(collection.length).toBeUndefined();
    for (const element of collection) {
      expect(element).toEqual(iterable[i++]);
    }
    expect(collection).toHaveLength(5);

    i = 0;
    for (const element of collection) {
      expect(element).toEqual(iterable[i++]);
    }
  });

  test('indexing', () => {
    expect(Collection.get(collection, -1)).toBeUndefined();
    expect(Collection.get(collection, 100)).toBeUndefined();
    for (let i = 0; i < iterable.length; i++) {
      expect(Collection.get(collection, i)).toEqual(iterable[i]);
    }
  });

  test('slicing', () => {
    const slice = collection.slice(1, 3);
    let index = 1;
    for (const element of slice) {
      expect(element).toEqual(iterable[index++]);
    }
  });
});

describe('LazyCollectionProvider', () => {
  const iterable = [1, 2, 3, 4, 5];
  let collection: LazyCollectionProvider<number>;

  beforeEach(() => (collection = new LazyCollectionProvider<number>(iterable)));

  test('iteration', () => {
    let i = 0;
    for (const element of collection) {
      expect(element).toEqual(iterable[i++]);
    }

    i = 0;
    for (const element of collection) {
      expect(element).toEqual(iterable[i++]);
    }
  });

  test('indexing', () => {
    expect(Collection.get(collection, -1)).toBeUndefined();
    expect(Collection.get(collection, 100)).toBeUndefined();
    for (let i = 0; i < iterable.length; i++) {
      expect(Collection.get(collection, i)).toEqual(iterable[i]);
    }
  });

  test('slicing', () => {
    const slice = collection.slice(1, 3);
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

    expect(Collection.get(collection, 3)).toEqual(4);

    expect(Array.from(collection.slice(-2, 100))).toEqual([1, 2, 3, 4, 5]);
    // materialized
    expect(Array.from(collection.slice(1, 100))).toEqual([2, 3, 4, 5]);
    expect(Collection.get(collection, 4)).toEqual(5);
    expect(Array.from(collection)).toEqual([1, 2, 3, 4, 5]);
    expect(collection).toHaveLength(5);
  });
});
