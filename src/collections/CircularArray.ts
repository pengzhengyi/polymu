/**
 * @module
 *
 * This module provides a fixed-length data structure that
 *
 *      + supports random accessing (indexing)
 *      + stores the most recent added elements / removes the least recently added elements
 *
 * @example
 * Suppose we add in order the following elements: [1, 2, 3, 4, 5, 6, 7], the circular array will look like the following at each insertion:
 *
 * [ * * * ]  -- before first insertion
 * [ 1 * * ]  -- after 1st insertion
 * [ 1 2 * ]  -- after 2st insertion
 * [ 1 2 3 ]  -- after 3st insertion
 * [ 4 2 3 ]  -- after 4st insertion
 * [ 4 5 3 ]  -- after 5st insertion
 * [ 4 5 6 ]  -- after 6st insertion
 * [ 7 5 6 ]  -- after 6st insertion
 */

import { Collection } from './Collection';

export class CircularArray<TElement> implements Collection<TElement> {
  /** The maximum number of elements that could be stored in this circular array */
  protected _capacity: number;
  /** Index of first element(if any) */
  protected _start = 0;
  /** The number of unoccupied slots */
  protected _slots: number;
  /** The underlying data structure, where elements are actually stored */
  protected _array: Array<TElement>;

  /**
   * @returns {number} The number of elements currently stored in the circular array.
   */
  get length(): number {
    return this._capacity - this._slots;
  }

  /**
   * @returns {number} The maximum number of elements that could be stored in this circular array.
   */
  get capacity(): number {
    return this._capacity;
  }

  /**
   * Change the capacity of the Circular Array.
   *
   * @param {number} newCapacity - A new capacity for the circular array. If `newCapacity` is larger than old capacity, the circular array will have more empty slots to contain additional elements. If `newCapacity` is smaller than the existing capacity, circular array will be truncated and the elements "towards the end" that cannot fit will be dropped.
   */
  set capacity(newCapacity: number) {
    const numSlotChange = newCapacity - this._capacity;

    const numElements = this.length;
    const numWrappedAroundElements = numElements - this._capacity + this._start;
    if (newCapacity < this._capacity) {
      // shrinking
      if (numWrappedAroundElements > 0) {
        // extend the array to fit wrapped around elements
        for (let i = 0; i < numWrappedAroundElements; i++) {
          this._array[this._capacity + i] = this._array[i];
        }

        // move elements up to align with array start
        this._array.copyWithin(0, this._start, this._start + numElements);
      } else {
        // no wrapped around elements
        if (this._start !== 0) {
          // move elements up to align with array start
          this._array.copyWithin(0, this._start, this._start + numElements);
        }
      }
      this._start = 0;
      this._slots = Math.max(0, this._slots + numSlotChange);
      this._array.length = newCapacity;
    } else if (newCapacity > this._capacity) {
      // extending
      if (numWrappedAroundElements > 0) {
        // has wrapped around elements

        // copy the first section of wrapped around elements to new slots
        let i = 0;
        for (; i < numSlotChange; i++) {
          this._array[this._capacity + i] = this._array[i];
        }

        if (numWrappedAroundElements > numSlotChange) {
          // new slots cannot fully contain all wrapped around elements, move remaining wrapped around elements up
          this._array.copyWithin(0, i, this._start);
        }
      }

      this._slots += numSlotChange;
    }

    this._capacity = newCapacity;
  }

  /**
   * @returns Whether the circular array is empty.
   */
  get isEmpty(): boolean {
    return this._slots === this._capacity;
  }

  /**
   * @returns Whether the circular array is full -- no available slots.
   */
  get isFull(): boolean {
    return this._slots === 0;
  }

  /**
   * Create a CircularArray instance.
   *
   * @param capacity - The number of elements that can maximally be put in the circular array.
   */
  constructor(capacity: number) {
    this._capacity = capacity;
    this._array = new Array(capacity);
    this._slots = capacity;
  }

  /**
   * Translate an array index to its window index as these two indices not always equal.
   *
   * @param index - An array index to be translated.
   * @returns The corresponding window index.
   */
  protected _translateIndex(index: number): number {
    return index < this._start ? this._capacity - this._start + index : index - this._start;
  }

  /**
   * Retrieve an element at specified index.
   *
   * @param {number} index - The index of element to be retrieved. A meaningful index should be between zero and element count (0 <= index < length).
   * @returns {TElement} The element at specified index.
   */
  get(index: number): TElement {
    return this._array[(this._start + index) % this._capacity];
  }

  /**
   * Implements the iteration protocol.
   */
  *[Symbol.iterator](): IterableIterator<TElement> {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      yield this.get(i);
    }
  }

  /**
   * Adds an element to the circular array.
   *
   * @param {TElement} element - An element to be added.
   */
  add(element: TElement) {
    if (this.isFull) {
      this._array[this._start++] = element;
      this._start %= this.length;
    } else {
      this._array[(this._start + this.length) % this._capacity] = element;
      this._slots--;
    }
  }

  /**
   * Returns a slice view of the collection with elements selected from start to end (end not included) where `start` and `end` represent the index of items in that array. The collection will not be modified.
   *
   * Roughly equivalent to the following piece of code:
   *
   * ```Javascript
   * for (let i = start; i < end; i++) }
   *    yield collection[i];
   * }
   * ```
   *
   * @param {number} start - Zero-based index at which to start extraction. A meaningful `start` value should not be less than 0.
   * @param {number} end - Zero-based index before which to end extraction. A meaningful `end` value should not greater than element count.
   */
  *slice(start: number, end: number): Iterable<TElement> {
    for (let i = start; i < end; i++) {
      yield this.get(i);
    }
  }

  /**
   * Make this circular array contain only elements from the specified iterable in order. The existing elements are effectively deleted.
   *
   * In more detail, there are three scenarios:
   *
   * + there are more elements than this circular array can contain: in this case, this circular array will be extended to just fit the iterable
   * + there are same number of elements than this circular array's capacity: in this case, this existing elements are "replaced" by the new elements.
   * + there are less elements than this circular array can contain: in this case, this circular array will fit the iterable and claim the remaining capacity as available space (not reclaim empty space)
   *
   * This method can also be useful to quickly initialize a circular array from an existing iterable.
   *
   * @param iterable - An iterable to be fit inside this circular array. After this call, the elements from this iterable will all reside in this circular array in order. For example, `this.get(0)` will return the first element in the iterable.
   * @param onExit - A callback to apply to each removed element. This callback will receive the element about to be removed and its window index. Elements are NOT removed in order, meaning first element removed does not necessarily have the smallest window index.
   * @param onEnter - A callback to apply to each inserted element. This callback will receive the element just inserted and its window index. Elements are inserted in order, meaning first element inserted will have the smallest window index.
   */
  fit(
    iterable: Iterable<TElement>,
    onExit: (element: TElement, windowIndex: number) => void = undefined,
    onEnter: (element: TElement, windowIndex: number) => void = undefined
  ) {
    const capacity = this._capacity;
    const numExistingElements = this.length;

    let i = 0;
    const toInsert = [];
    for (const element of iterable) {
      if (i < capacity) {
        if (onExit) {
          const deletedElementWindowIndex = this._translateIndex(i);
          if (deletedElementWindowIndex < numExistingElements) {
            // an element actually will be replaced
            onExit(this._array[i], deletedElementWindowIndex);
          }
        }

        this._array[i] = element;
        onEnter && onEnter(element, i);
      } else {
        toInsert.push(element);
      }
      i++;
    }

    if (i < capacity) {
      this._slots = capacity - i;

      if (onExit) {
        // if `onExit` is defined, also call onExit on elements that are effectively deleted
        for (; i < numExistingElements; i++) {
          onExit(this._array[i], this._translateIndex(i));
        }
      }
    } else if (i > capacity) {
      let windowIndex = capacity;
      for (const element of toInsert) {
        this._array.push(element);
        onEnter && onEnter(element, windowIndex++);
      }

      this._capacity += toInsert.length;
      this._slots = 0;
    } else {
      this._slots = 0;
    }

    this._start = 0;
  }

  /**
   * Shift can be used to achieve two workflows:
   *
   * + `shiftAmount > 0`: delete some amount (`shiftAmount`) of elements from the start of the circular array and append same amount of elements to the end of the circular array. Imagine circular array is a segment of a straight line, this workflow pushes the circular array towards the end direction.
   * + `shiftAmount < 0`: delete some amount (absolute value of `shiftAmount`) of elements from the end of the circular array and prepend some amount of elements to the start of the circular array. Imagine circular array is a segment of a straight line, this workflow pushes the circular array towards the start direction.
   *
   * ! The circular array must be full to apply shift operation
   *
   * Example: shiftAmount = 4, **x** represent a deleted element and **+** represent an inserted element, **↑** represent circular array start position
   *
   * ```
   * Before Shift
   * [ * * x x x x * * * *]
   *       ↑
   * After Shift
   * [ * * + + + + * * * *]
   *               ↑
   * ```
   *
   * Example: shiftAmount = -4, **x** represent a deleted element and **+** represent an inserted element, **↑** represent circular array start position
   *
   * ```
   * Before Shift
   * [ - - * * * * * * - -]
   *       ↑
   * After Shift
   * [ + + * * * * * * + +]
   *                 ↑
   * ```
   *
   * @param shiftAmount - A nonzero shift amount, see above description. In short, negative shift amount will insert elements at the start while remove elements from the end while the positive shift does the reverse.
   * @param replacement - The elements to be inserted in order. Its length should equal to the absolute value of `shiftAmount`. In order means that the first element of `replacement` will be at the smallest window index.
   * @param onExit - A callback to apply to each removed element. This callback will receive the element about to be removed and its window index. Elements are removed in order, meaning first element removed will have the smallest window index.
   * @param onEnter - A callback to apply to each inserted element. This callback will receive the element just inserted and its window index. Elements are inserted in order, meaning first element inserted will have the smallest window index.
   */
  shift(
    shiftAmount: number,
    replacement: Iterable<TElement>,
    onExit: (element: TElement, windowIndex: number) => void = () => undefined,
    onEnter: (element: TElement, windowIndex: number) => void = () => undefined
  ) {
    let newStart = this._start + shiftAmount;
    if (shiftAmount > 0) {
      // shift towards end
      let enterWindowIndex = this._capacity - shiftAmount;
      let exitWindowIndex = 0;

      if (newStart < this._capacity) {
        for (const replaceElement of replacement) {
          onExit(this._array[this._start], exitWindowIndex++);
          this._array[this._start++] = replaceElement;
          onEnter(replaceElement, enterWindowIndex++);
        }
        return;
      } else {
        // wrap around
        newStart -= this._capacity;

        const iterator = replacement[Symbol.iterator]();
        for (let i = this._start; i < this._capacity; i++) {
          const { value: replaceElement } = iterator.next();
          onExit(this._array[i], exitWindowIndex++);
          this._array[i] = replaceElement;
          onEnter(replaceElement, enterWindowIndex++);
        }

        for (let i = 0; i < newStart; i++) {
          const { value: replaceElement } = iterator.next();
          onExit(this._array[i], exitWindowIndex++);
          this._array[i] = replaceElement;
          onEnter(replaceElement, enterWindowIndex++);
        }
      }
    } else if (shiftAmount === 0) {
      return;
    } else {
      // shift window towards start
      let enterWindowIndex = 0;
      let exitWindowIndex = this._capacity + shiftAmount;

      if (newStart >= 0) {
        let i = newStart;
        for (const replaceElement of replacement) {
          onExit(this._array[i], exitWindowIndex++);
          this._array[i++] = replaceElement;
          onEnter(replaceElement, enterWindowIndex++);
        }
      } else {
        newStart += this._capacity;

        const iterator = replacement[Symbol.iterator]();
        for (let i = newStart; i < this._capacity; i++) {
          const { value: replaceElement } = iterator.next();
          onExit(this._array[i], exitWindowIndex++);
          this._array[i] = replaceElement;
          onEnter(replaceElement, enterWindowIndex++);
        }

        for (let i = 0; i < this._start; i++) {
          const { value: replaceElement } = iterator.next();
          onExit(this._array[i], exitWindowIndex++);
          this._array[i] = replaceElement;
          onEnter(replaceElement, enterWindowIndex++);
        }
      }
    }

    this._start = newStart;
  }
}
