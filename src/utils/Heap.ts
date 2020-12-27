/**
 * @module
 * This module implements a binary heap.
 */

import { SortingFunction } from '../ViewFunction';

/**
 * Represents a binary heap and implements the iterable interface.
 */

export default class Heap<TElement> implements Iterable<TElement> {
  /**
   * The underlying data structure for the heap. The array is always equivalent to the in-depth traversal of the heap.
   */

  protected _array: Array<TElement>;
  /**
   * The number of elements stored in the heap.
   */

  protected _count: number = 0;

  /**
   * The maximum number of elements can be stored in the heap without resizing.
   * @public
   */

  get capacity(): number {
    return this._array.length;
  }

  /**
   * The number of elements stored in the heap.
   * @public
   */

  get length(): number {
    return this._count;
  }

  /**
   * Creates a Heap.
   *
   * @public
   * @param {SortingFunction<TElement>} A comparator that decides the ordering of elements. The "smallest" element will be the root of the heap -- first element to be popped.
   * @param {number} [capacity = 0] Initial capacity of the heap.
   * @constructs Heap
   */

  constructor(protected _comparator: SortingFunction<TElement>, capacity: number = 0) {
    this._array = new Array<TElement>(capacity);
  }

  /**
   * Implements the iterable protocol by creating a copy of the heap and popping elements off it.
   *
   * @public
   * @generator
   * @yields {<TElement>} The next "smallest" element in the heap.
   */
  [Symbol.iterator](): IterableIterator<TElement> {
    const copy = new Heap<TElement>(this._comparator);
    copy._array = this._array.slice(0, this._count + 1);
    copy._count = this._count;
    return copy.popAll();
  }

  /**
   * Returns the left child index of a given index.
   *
   * @param {number} index - The index to be considered as "parent".
   * @returns {number} The index of left child of given index.
   */

  protected _leftChildIndex(index: number): number {
    return index * 2 + 1;
  }

  /**
   * Returns the right child index of a given index.
   *
   * @param {number} index - The index to be considered as "parent".
   * @returns {number} The index of right child of given index.
   */

  protected _rightChildIndex(index: number): number {
    return index * 2 + 2;
  }

  /**
   * Returns the parent index of an index.
   *
   * @param {number} index - The index to be considered as "child".
   * @returns {number} The index of parent of given index.
   */

  protected _parentIndex(index: number): number {
    return Math.floor((index - 1) / 2);
  }

  /**
   * Putting the element at next available slot (last index) of the heap and bubbling it up until the following heap constraint are satisfied:
   *
   *    The parent is smaller than both of its children.
   *
   * @param {TElement} element - The element to be added to the heap.
   */
  protected _bubbleUp(element: TElement) {
    const lastIndex = this._count;
    let toReplaceIndex = lastIndex;
    while (toReplaceIndex > 0) {
      const parentIndex = this._parentIndex(toReplaceIndex);
      const parentElement = this._array[parentIndex];
      if (this._comparator(element, parentElement) < 0) {
        // shift `parentElement` down
        this._array[toReplaceIndex] = parentElement;
        toReplaceIndex = parentIndex;
      } else {
        // bubbling stops here
        break;
      }
    }

    this._array[toReplaceIndex] = element;
  }

  /**
   * Pop off the top element of the heap. Swap the last element of the heap to the top and bubbling it down until the following heap constraint are satisfied:
   *
   *    The parent is smaller than both of its children.
   */
  protected _bubbleDown() {
    const lastPlace = this._count;
    const lastElement = this._array[lastPlace];
    let toReplaceIndex = 0;
    while (true) {
      const leftChildIndex = this._leftChildIndex(toReplaceIndex);
      if (leftChildIndex >= lastPlace) {
        break;
      }

      const rightChildIndex = leftChildIndex + 1;
      if (rightChildIndex >= lastPlace) {
        break;
      }

      const leftElement = this._array[leftChildIndex];
      const rightElement = this._array[rightChildIndex];

      if (this._comparator(leftElement, rightElement) < 0) {
        // consider bubbling down the left branch
        if (this._comparator(lastElement, leftElement) <= 0) {
          // bubbling stop here
          break;
        }
        this._array[toReplaceIndex] = leftElement;
        toReplaceIndex = leftChildIndex;
      } else {
        // consider bubbling down the right branch
        if (this._comparator(lastElement, rightElement) <= 0) {
          // bubbling stop here
          break;
        }
        this._array[toReplaceIndex] = rightElement;
        toReplaceIndex = rightChildIndex;
      }
    }

    this._array[toReplaceIndex] = lastElement;
  }

  /**
   * Adds an element to the heap and then restore the heap balance.
   *
   * @public
   * @param {TElement} The element to be added to the heap.
   */

  add(element: TElement) {
    this._bubbleUp(element);
    this._count++;
  }

  /**
   * Adds an indefinite number of elements to the heap and then restore the heap balance. This is equivalent to calling `this.add` for each element.
   *
   * @public
   * @param {Array<TElement>} A list of the element to be added to the heap.
   */

  push(...elements: Array<TElement>) {
    elements.forEach((element) => this.add(element));
  }

  /**
   * Adds an iterable of elements to the heap and then restore the heap balance. This is equivalent to calling `this.add` for each element in the iterable.
   *
   * @public
   * @param {Iterable<TElement>} An iterable of the element to be added to the heap.
   */

  extend(elements: Iterable<TElement>) {
    for (const element of elements) {
      this.add(element);
    }
  }

  /**
   * Pops off the "smallest" element in the heap and then restore the heap balance.
   *
   * @public
   * @return {TElement} The "smallest" element of the heap ("heap top").
   */

  pop(): TElement {
    switch (this._count) {
      case 0:
        return undefined;
      case 1:
        return this._array[--this._count];
      default:
        const popped = this._array[0];
        this._count--;
        this._bubbleDown();
        return popped;
    }
  }

  /**
   * Popping every element off the heap.
   *
   * @public
   * @generator
   * @return {IterableIterator<TElement>} An iterable of elements in the heap in sorted order.
   */

  *popAll(): IterableIterator<TElement> {
    while (this._count > 0) {
      yield this.pop();
    }
  }

  /**
   * Inspects the heap top. Heap will not be modified.
   *
   * @public
   * @return {TElement} The "smallest" element of the heap ("heap top").
   */

  peek(): TElement {
    return this._array[0];
  }
}