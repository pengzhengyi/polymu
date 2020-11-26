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

export interface Collection<TElement> extends Iterable<TElement> {
  [index: number]: TElement;
}

enum MaterializationStrategy {
  Capped,
  Lazy,
  Prohibit,
}

export class CollectionProvider<TElement> implements Collection<TElement> {
  [index: number]: TElement;

  static MaterializableCollectionProvider<TElement>(
    iterable: Iterable<TElement>
  ): CollectionProvider<TElement> {
    return new CollectionProvider<TElement>(iterable, MaterializationStrategy.Lazy);
  }

  static UnmaterializableCollectionProvider<TElement>(
    iterable: Iterable<TElement>
  ): CollectionProvider<TElement> {
    return new CollectionProvider<TElement>(iterable, MaterializationStrategy.Prohibit);
  }

  protected materializable: boolean;
  protected materialized: boolean;
  protected materializedCollection: Array<TElement>;
  protected _length: number = undefined;

  protected get length(): number {
    if (this._length === undefined && this.materializable && this.materialized) {
      return (this._length = this.materializedCollection.length);
    }

    return this._length;
  }

  constructor(
    protected readonly iterable: Iterable<TElement>,
    protected readonly materializationStrategy: MaterializationStrategy
  ) {
    this.materializable = this.materializationStrategy !== MaterializationStrategy.Prohibit;
    if (this.materializable) {
      this.materializedCollection = [];
      this.materialized = false;
    }

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
      get(target: CollectionProvider<TElement>, prop: Prop, receiver: any) {
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
    if (this.materializable) {
      if (this.materialized) {
        // reuse the materialized collection
        return this.materializedCollection[Symbol.iterator];
      } else {
        const that = this;
        return function* () {
          let index = 0;
          for (const element of that.iterable) {
            that.materializeElement(index++,element);
            yield element;
          }
          that._length = index;
        };
      }
    } else {
      return this.iterable;
    }
  }

  get(index: number): TElement {
    if (this.materializable && (this.materialized || index in this.materializedCollection)) {
      return this.materializedCollection[index];
    }

    const length = this.length;
    if (index < 0 || (length !== undefined && index >= length)) {
      // shortcut out of bound indexing
      return undefined;
    }

    let i = 0;
    for (const element of this.iterable) {
      if (this.materializable) {
        this.materializeElement(i, element);
      }

      if (i === index) {
        return element;
      }
      i++;
    }
    this._length = i;
    return undefined;
  }

  slice(start: number, end: number) {
    start = Math.max(0, start);
    if (end <= start) {
      return [];
    }

    if (this.materializable && (this.materialized || end in this.materializedCollection)) {
      // if end in materialized, then all indices before it is also materialized
      return this.materializedCollection.slice(start, end);
    }

    const that = this;
    return function*() {
      const length = this.length;
      if (length !== undefined && start >= length) {
        return;
      }

      let i = 0;
      for (const element of this.iterable) {
        if (this.materializable) {
          this.materializeElement(i, element);
        }

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
    };
  }
}

class CollectionProviderWithFixedCache<TElement> extends CollectionProvider<TElement> {
  protected materializable: boolean = true;
  protected materialized: boolean = false;
  protected materializedCollection: Map<number, TElement>;
  protected readonly materializationStrategy =
}
