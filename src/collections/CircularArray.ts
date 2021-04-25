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

import { mod } from '../utils/math';
import { Collection } from './Collection';

/**
 * A `CircularArray` is built upon a underlying "large" array while exposes a view window. Consequently, there are two set of indices:
 *
 * + **Array Index**: this index applies to the underlying array.
 * + **Window Index**: this index applies to the exposed window. For example, window index of 0 means the index of first element in the view window, which have a entirely different array index.
 */
export class CircularArray<TElement> implements Collection<TElement> {
  /** The maximum number of elements that could be stored in this circular array */
  protected capacity_: number;
  /** Array index of first element in the view window */
  protected start_ = 0;
  /** The number of unoccupied slots */
  protected slots_: number;
  /** The underlying data structure, where elements are actually stored */
  protected array_: Array<TElement>;

  /**
   * @returns {number} The number of elements currently in the view window. This is also the number of non-empty slots in the underlying array.
   */
  get length(): number {
    return this.capacity_ - this.slots_;
  }

  /**
   * @returns {number} The maximum number of elements that could be stored in this circular array.
   */
  get capacity(): number {
    return this.capacity_;
  }

  /**
   * Change the capacity of the Circular Array.
   *
   * @param {number} newCapacity - A new capacity for the circular array. If `newCapacity` is larger than old capacity, the circular array will have more empty slots to contain additional elements. If `newCapacity` is smaller than the existing capacity, circular array will be truncated and the elements "towards the end" that cannot fit will be dropped.
   */
  set capacity(newCapacity: number) {
    const numSlotChange = newCapacity - this.capacity_;

    const numElements = this.length;
    const numWrappedAroundElements = numElements - this.capacity_ + this.start_;
    if (newCapacity < this.capacity_) {
      // shrinking
      if (numWrappedAroundElements > 0) {
        // extend the array to fit wrapped around elements
        for (let i = 0; i < numWrappedAroundElements; i++) {
          this.array_[this.capacity_ + i] = this.array_[i];
        }

        // move elements up to align with array start
        this.array_.copyWithin(0, this.start_, this.start_ + numElements);
      } else {
        // no wrapped around elements
        if (this.start_ !== 0) {
          // move elements up to align with array start
          this.array_.copyWithin(0, this.start_, this.start_ + numElements);
        }
      }
      this.start_ = 0;
      this.slots_ = Math.max(0, this.slots_ + numSlotChange);
      this.array_.length = newCapacity;
    } else if (newCapacity > this.capacity_) {
      // extending
      if (numWrappedAroundElements > 0) {
        // has wrapped around elements

        // copy the first section of wrapped around elements to new slots
        let i = 0;
        for (; i < numSlotChange; i++) {
          this.array_[this.capacity_ + i] = this.array_[i];
        }

        if (numWrappedAroundElements > numSlotChange) {
          // new slots cannot fully contain all wrapped around elements, move remaining wrapped around elements up
          this.array_.copyWithin(0, i, this.start_);
        }
      }

      this.slots_ += numSlotChange;
    }

    this.capacity_ = newCapacity;
  }

  /**
   * @returns Whether the circular array is empty.
   */
  get isEmpty(): boolean {
    return this.slots_ === this.capacity_;
  }

  /**
   * @returns Whether the circular array is full -- no available slots.
   */
  get isFull(): boolean {
    return this.slots_ === 0;
  }

  /**
   * Create a CircularArray instance.
   *
   * @param capacity - The number of elements that can maximally be put in the circular array.
   */
  constructor(capacity: number) {
    this.capacity_ = capacity;
    this.array_ = new Array(capacity) as Array<TElement>;
    this.slots_ = capacity;
  }

  /**
   * Translate an array index to its corresponding window index.
   *
   * @param arrayIndex - An array index to be translated.
   * @returns The corresponding window index.
   */
  protected translateArrayIndexIntoWindowIndex__(arrayIndex: number): number {
    return arrayIndex < this.start_
      ? this.capacity_ - this.start_ + arrayIndex
      : arrayIndex - this.start_;
  }

  /**
   * Translate a window index to its corresponding array index.
   *
   * ! Window index should be greater than the negative value of capacity.
   *
   * @param windowIndex - A window index to be translated.
   * @returns The corresponding array index.
   */
  protected translateWindowIndexIntoArrayIndex__(windowIndex: number): number {
    // `this.capacity_` is added to handle negative
    return mod(this.start_ + windowIndex, this.capacity_);
  }

  /**
   * Retrieve an element at specified window index.
   *
   * @param {number} windowIndex - The window index of element to be retrieved. A meaningful index should be between zero and element count (`0 <= index < this.length`).
   * @returns {TElement} The element at specified index.
   */
  get(windowIndex: number): TElement {
    return this.array_[this.translateWindowIndexIntoArrayIndex__(windowIndex)];
  }

  /**
   * Replace an element at specified window index. This method will not modify number of available slots.
   *
   * @param {number} windowIndex - The index of element to be replaced.
   * @param {TElement} element - The element to replace at specified index.
   */
  protected replaceElementWith__(windowIndex: number, element: TElement): void {
    this.array_[this.translateWindowIndexIntoArrayIndex__(windowIndex)] = element;
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
  add(element: TElement): void {
    if (this.isFull) {
      this.array_[this.start_++] = element;
      this.start_ %= this.length;
    } else {
      this.replaceElementWith__(this.length, element);
      this.slots_--;
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
  ): void {
    const capacity = this.capacity_;
    const numExistingElements = this.length;

    let i = 0;
    const toInsert = [];
    for (const element of iterable) {
      if (i < capacity) {
        if (onExit) {
          const deletedElementWindowIndex = this.translateArrayIndexIntoWindowIndex__(i);
          if (deletedElementWindowIndex < numExistingElements) {
            // an element actually will be replaced
            onExit(this.array_[i], deletedElementWindowIndex);
          }
        }

        this.array_[i] = element;
        onEnter && onEnter(element, i);
      } else {
        toInsert.push(element);
      }
      i++;
    }

    if (i < capacity) {
      this.slots_ = capacity - i;

      if (onExit) {
        // if `onExit` is defined, also call onExit on elements that are effectively deleted
        for (; i < numExistingElements; i++) {
          onExit(this.array_[i], this.translateArrayIndexIntoWindowIndex__(i));
        }
      }
    } else if (i > capacity) {
      let windowIndex = capacity;
      for (const element of toInsert) {
        this.array_.push(element);
        onEnter && onEnter(element, windowIndex++);
      }

      this.capacity_ += toInsert.length;
      this.slots_ = 0;
    } else {
      this.slots_ = 0;
    }

    this.start_ = 0;
  }

  /**
   * Shift can be used to achieve two workflows:
   *
   * + `shiftAmount > 0`: delete some amount (`shiftAmount`) of elements from the start of the circular array and append same amount of elements to the end of the circular array. Imagine circular array is a segment of a straight line, this workflow pushes the circular array towards the end direction.
   * + `shiftAmount < 0`: delete some amount (absolute value of `shiftAmount`) of elements from the end of the circular array and prepend some amount of elements to the start of the circular array. Imagine circular array is a segment of a straight line, this workflow pushes the circular array towards the start direction.
   *
   * ! The circular array must be full to apply shift operation
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
  ): void {
    if (shiftAmount > 0) {
      this.shiftTowardsEnd__(shiftAmount, replacement, onExit, onEnter);
    } else if (shiftAmount === 0) {
      return;
    } else {
      this.shiftTowardsStart__(shiftAmount, replacement, onExit, onEnter);
    }
  }

  /**
   *
   * Example: shiftAmount = -4 and length = 5, __*__ represents an empty slot, **x** represents an element exists before shifting, **+** represents an inserted new element, **-** represents an deleted existing element, **↑** represent circular array start position
   *
   * ```
   * Before Shift
   * [ * * x x x x x * * *]
   *       ↑
   * After Shift
   * [ + + x - - - - * + +]
   *                 ↑
   * ```
   *
   * @param shiftAmount - See `shiftAmount` in `shift` method. **A negative value**.
   * @param replacement - See `replacement` in `shift` method.
   * @param onExit - See `onExit` in `shift` method.
   * @param onEnter - See `onEnter` in `shift` method.
   */
  protected shiftTowardsStart__(
    shiftAmount: number,
    replacement: Iterable<TElement>,
    onExit: (element: TElement, windowIndex: number) => void = () => undefined,
    onEnter: (element: TElement, windowIndex: number) => void = () => undefined
  ): void {
    // shift window towards start
    let enterWindowIndex = 0;
    let exitWindowIndex = this.length + shiftAmount;
    for (const replaceElement of replacement) {
      onExit(this.get(exitWindowIndex), exitWindowIndex++);
      this.replaceElementWith__(shiftAmount + enterWindowIndex, replaceElement);
      onEnter(replaceElement, enterWindowIndex++);
    }
    this.start_ = this.translateWindowIndexIntoArrayIndex__(shiftAmount);
  }

  /**
   * Example: shiftAmount = 4 and length = 5, __*__ represents an empty slot, **x** represents an element exists before shifting, **+** represents an inserted new element, **-** represents an deleted existing element, **↑** represent circular array start position
   *
   * ```
   * Before Shift
   * [ * * x x x x x * * *]
   *       ↑
   * After Shift
   * [ + * - - - - x + + +]
   *               ↑
   * ```
   *
   * @param shiftAmount - See `shiftAmount` in `shift` method.
   * @param replacement - See `replacement` in `shift` method.
   * @param onExit - See `onExit` in `shift` method.
   * @param onEnter - See `onEnter` in `shift` method.
   */
  protected shiftTowardsEnd__(
    shiftAmount: number,
    replacement: Iterable<TElement>,
    onExit: (element: TElement, windowIndex: number) => void = () => undefined,
    onEnter: (element: TElement, windowIndex: number) => void = () => undefined
  ): void {
    // shift window towards end
    let enterWindowIndex = this.length - shiftAmount;
    let exitWindowIndex = 0;
    for (const replaceElement of replacement) {
      onExit(this.array_[this.start_], exitWindowIndex++);
      // put `replaceElement` at next index past end element
      this.replaceElementWith__(this.length, replaceElement);
      onEnter(replaceElement, enterWindowIndex++);
      this.start_ = this.translateWindowIndexIntoArrayIndex__(1);
    }
  }
}
