/**
 * @module
 *
 * This module provides a way to represent a collection of element, which provides a way to iterate through a group of elements.
 *
 * An important classification criterion for Collection is its materializability. A Collection can be classified into one of the following three categories based on its materializability:
 *
 *    + materialized: there is constant cost O(1) in indexing an element (@example when the collection is realized through an array of elements)
 *    + materializable: there is linear cost O(n) in indexing an element before the Collection is materialized. However, after the Collection is materialzable, the cost of indexing an element will be constant O(1). Usually the materialization process happens lazily *on-need*: for example, when last element needs to be accessed, the Collection will materialize since it only knows to reach the last element through iterating the whole collection. (@example when the collection is initially represented by an Iterable that fits in memory)
 *    + unmaterializable: there will always be a linear cost O(n) in indexing an element. The Collection can be unmaterializable when
 *        + the materialized Collection will be too large to fit in memory
 *        + materialization is unnecessary as there is no need to index an element -- the collection will only be iterated.
 */

import { Prop } from './Abstraction';

/**
 * Represents an iterable of elements. It provides the following properties:
 *    + indexable with at most O(n) cost
 *    + sliceable with at most O(n) cost
 *
 * *n being the number of elements in the iterable*
 *
 * @typedef {TElement} - The element type.
 */
export interface Collection<TElement> extends Iterable<TElement> {
  /**
   * Collection can be indexed using bracket syntax
   * @example
   *    collection[0]
   */
  [index: number]: TElement;
  /**
   * Returns a slice view of the collection with elements selected from start to end (end not included) where `start` and `end` represent the index of items in that array. The collection will not be modified.
   *
   * Roughly equivalent to the following piece of code:
   *
   * ```Javascript
   * for (let i = start; i < end; i++) }
   * yield collection[i];
   * }
   * ```
   *
   * @param {number} start - Zero-based index at which to start extraction. If `start` is less than 0, 0 will be used as value for `start`.
   * @param {number} end - Zero-based index before which to end extraction. `slice` extracts up to but no including `end`,. If end is greater than the length of the collection, `slice` extracts through to the end of the sequence (`collection.length`)
   * @return {IterableIterator<TElemenet>} An iterable of elements between specified indices.
   */
  slice(start: number, end: number): IterableIterator<TElement>;
}

/**
 * `MaterializationStrategy` defines how a collection can process its underlying iterable.
 */
enum MaterializationStrategy {
  /**
   * If `MaterializationStrategy` is `Lazy`, then a collection can create an array containing all elements in the iterable. However, this array is not created at-once, it is created lazily on-need.
   *
   * Since materialization happens through iterating the iterable, if an element at some index is materialized, all elements at index before it must also be materialized.
   *
   * @example When 5th element is indexed on a freshly created collection, the iterable will be iterated until the 5th element, therefore, the array will contain elements with index less than or equal to 5.
   */
  Lazy,
  /**
   * Materialization is not allowed. All accessing needed to be done through iterating.
   *
   * This could be useful when the underlying iterable maps to a constantly-changing data structure, in which case, any materialization would be invalidated at next iteration of the iterable.
   */
  Prohibit,
}

abstract class AbstractCollectionProvider<TElement> implements Collection<TElement> {
  [index: number]: TElement;

  protected materializable: boolean;

  protected abstract get length(): number;

  constructor(
    protected readonly iterable: Iterable<TElement>,
    protected readonly materializationStrategy: MaterializationStrategy
  ) {
    this.materializable = this.materializationStrategy !== MaterializationStrategy.Prohibit;
    return this.createProxy();
  }

  protected createProxy() {
    return new Proxy(this, {
      /**
       * A trap for getting a property value.
       *
       * Prioritizing getting property from the instantiation.
       * There will not be a naming collision (a same name is registered both in instantiation and in forwarding element) because:
       *
       *    + the property names in instantiation are properly prefixed and suffixed by underscore to avoid name clash
       *    + the `set` function will only allow modification to existing properties on instantiation
       *    + the `defineProperty` function will only allow appropriated named property to be defined on the instantiation (not possible for name clash)
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/get}
       */
      get(target: AbstractCollectionProvider<TElement>, prop: Prop, receiver: any) {
        // @ts-ignore: ignore type check as `Number.isInteger` works for string and symbol
        if (Number.isInteger(prop)) {
          return target.get(prop as number);
        }

        if (prop in target) {
          // attempts to resolve `prop` on the `target`
          return Reflect.get(target, prop, receiver);
        }
      },
    });
  }

  /**
   *
   * @public
   * @generator
   * @yields {<TElement>} The next element in collection.
   */
  abstract [Symbol.iterator](): IterableIterator<TElement>;

  protected abstract get(index: number): TElement;

  abstract slice(start: number, end: number): IterableIterator<TElement>;
}

class UnmaterializableCollectionProvider<TElement> extends AbstractCollectionProvider<TElement> {
  protected _length: number = undefined;

  protected get length(): number {
    return this._length;
  }

  constructor(protected readonly iterable: Iterable<TElement>) {
    super(iterable, MaterializationStrategy.Prohibit);
  }

  /**
   *
   * @public
   * @generator
   * @yields {<TElement>} The next element in collection.
   */
  *[Symbol.iterator](): IterableIterator<TElement> {
    let i = 0;
    for (const element of this.iterable) {
      yield element;
      i++;
    }
    this._length = i;
  }

  protected get(index: number): TElement {
    const length = this.length;
    if (index < 0 || (length !== undefined && index >= length)) {
      // shortcut out of bound indexing
      return undefined;
    }

    let i = 0;
    for (const element of this.iterable) {
      if (i === index) {
        return element;
      }
      i++;
    }
    this._length = i;
    return undefined;
  }

  *slice(start: number, end: number): IterableIterator<TElement> {
    start = Math.max(0, start);
    if (end <= start) {
      return;
    }

    const length = this.length;
    if (length !== undefined && start >= length) {
      return;
    }

    let i = 0;
    for (const element of this.iterable) {
      if (start <= i) {
        if (i < end) {
          yield element;
        } else {
          return;
        }
      }
      i++;
    }
    this._length = i;
  }
}

export class LazyCollectionProvider<TElement> extends AbstractCollectionProvider<TElement> {
  protected materialized: boolean;
  protected materializedCollection: Array<TElement>;
  protected _length: number = undefined;

  protected _getContinuation: Generator<TElement, void, number>;

  protected get length(): number {
    if (this._length === undefined && this.materialized) {
      return (this._length = this.materializedCollection.length);
    }

    return this._length;
  }

  constructor(protected readonly iterable: Iterable<TElement>) {
    super(iterable, MaterializationStrategy.Lazy);

    this.materializedCollection = [];
    this.materialized = false;
  }

  protected materializeElement(index: number, element: TElement) {
    this.materializedCollection[index] = element;
  }

  /**
   *
   * @public
   * @generator
   * @yields {<TElement>} The next element in collection.
   */
  *[Symbol.iterator](): IterableIterator<TElement> {
    if (this.materialized) {
      // reuse the materialized collection
      yield* this.materializedCollection;
    } else {
      const that = this;
      return function* () {
        let index = 0;
        for (const element of that.iterable) {
          that.materializeElement(index++, element);
          yield element;
        }
        that._length = index;
      };
    }
  }

  protected *_get() {
    let i = 0;
    let nextTargetIndex = yield;
    for (const element of this.iterable) {
      this.materializeElement(i, element);

      if (i === nextTargetIndex) {
        // yielding value
        yield element;
        // accepting next target
        nextTargetIndex = yield;
      }

      i++;
    }

    this._length = i;
    return;
  }

  protected get(index: number): TElement {
    if (this.materialized || index in this.materializedCollection) {
      return this.materializedCollection[index];
    }

    const length = this.length;
    if (index < 0 || (length !== undefined && index >= length)) {
      // shortcut out of bound indexing
      return undefined;
    }

    // iterating the iterable to find the element at index
    if (!this._getContinuation) {
      this._getContinuation = this._get();
    }
    // set search target
    this._getContinuation.next(index);
    // retrieve value
    const { value } = this._getContinuation.next();
    return value || undefined;
  }

  *slice(start: number, end: number): IterableIterator<TElement> {
    start = Math.max(0, start);
    if (end <= start) {
      return;
    }

    if (this.materialized || end in this.materializedCollection) {
      // if end in materialized, then all indices before it is also materialized
      for (let i = start; i < end; i++) {
        yield this.materializedCollection[i];
      }
    }

    const length = this.length;
    if (length !== undefined && start >= length) {
      return;
    }

    let i = 0;
    for (const element of this.iterable) {
      this.materializeElement(i, element);

      if (start <= i) {
        if (i < end) {
          yield element;
        } else {
          return;
        }
      }
      i++;
    }
    this._length = i;
  }
}
