/**
 * @module
 *
 * This module provides a data structure to hold a "window slice" for an iterable of elements.
 *
 * The sliding window is built upon {@link CircularArray:CircularArray}.
 */

import { Collection } from './Collection';

/**
 * When the end index of `SlidingWindow` is greater than or equal with the length of iterable, a **resize** could happen.
 *
 * `ResizeStrategy` defines how `SlidingWindow` behaves during resizing.
 */
export enum ResizeStrategy {
  /**
   * When end index exceeds, set the end index to point to last element of the iterable
   * @example
   * ```
   * **Scenario 1**:
   *
   * Before Resize:
   * [ X X X X X ]
   *           ↑ - ↥
   * After Resize
   * [ X X X X X ]
   *           ↟
   *
   * **Scenario 2**:
   *
   * Before Resize:
   * [ X X X ]
   *     ↑ - - - ↥
   * After Resize:
   * [ X X X ]
   *   ↑ - ↥
   *
   * **Scenario 3**:
   *
   * Before Resize:
   * [ X X X ]
   *           ↑ - - - ↥
   * After Resize:
   * [ X X X ]
   *       ↟
   *
   * To satisfy the constraint that end index is lower bounded by start index, start index also need to be set to the last element of the iterable.
   * ```
   */
  Shrink,
  /**
   * Try to shift the *window* towards the start while maintaining the *window size*
   * @example
   * ```
   * **Scenario 1**:
   *
   * Before Resize:
   * [ X X X X X ]
   *           ↑ - ↥
   * After Resize
   * [ X X X X X ]
   *       ↑ - ↥
   *
   * **Scenario 2**:
   *
   * Before Resize:
   * [ X X X ]
   *     ↑ - - - ↥
   * After Resize:
   * [ X X X ]
   *   ↑ - - - ↥
   *
   * **Scenario 3**:
   *
   * Before Resize:
   * [ X X X ]
   *           ↑ - - - ↥
   * After Resize:
   * [ X X X ]
   *   ↑ - - - ↥
   *
   * ```
   */
  Shift,
  /**
   * Try **Shift** strategy first, if not enough, use **Shrink** strategy
   * @example
   * ```
   * **Scenario 1**:
   *
   * Before Resize:
   * [ X X X X X ]
   *           ↑ - ↥
   * After Resize
   * [ X X X X X ]
   *       ↑ - ↥
   *
   * **Scenario 2**:
   *
   * Before Resize:
   * [ X X X ]
   *     ↑ - - - ↥
   * After Resize:
   * [ X X X ]
   *   ↑ - ↥
   *
   * **Scenario 3**:
   *
   * Before Resize:
   * [ X X X ]
   *           ↑ - - - ↥
   * After Resize:
   * [ X X X ]
   *   ↑ - ↥
   *
   * ```
   */
  ShiftAndShrinkIfNecessary,
  /** `SlidingWindow` will remain as it is */
  NoAction,
}

/**
 * This class represents a partial window through which the access to the underlying iterable is managed: only a slice of the iterable is available through the window.
 *
 * Additionally, this window is not fixed: it is slidable through changing its start index and end index. This means `SlidingWindow` provides a lazy view: not until elements are resolved, the window is flexible enough to slide over any slice of any iterable.
 */
export class SlidingWindow<TElement> implements Iterable<TElement>, Collection<TElement> {
  /** start index of the window, inclusive */

  protected _startIndex: number;
  /**
   * @returns {number} The start index of the `SlidingWindow`. This index is inclusive.
   */
  get startIndex(): number {
    return this._startIndex;
  }
  /**
   * A safe setter for changing `_startIndex`, it will lower bound new value by 0.
   *
   * @param {number} newStartIndex - A new value for `_startIndex`. Will be changed to 0 if new value is negative.
   */
  protected set _startIndex_(newStartIndex: number) {
    this._startIndex = Math.max(0, newStartIndex);
  }
  /** end index of the window, inclusive */
  protected _endIndex: number;
  /**
   * @returns {number} The end index of the `SlidingWindow`. This index is inclusive.
   */
  get endIndex(): number {
    return this._endIndex;
  }
  /**
   * A safe setter for changing `_endIndex`, it will lower bound new value by `_startIndex` if it is defined.
   *
   * @param {number} newStartIndex - A new value for `_endIndex`.
   */
  protected set _endIndex_(newEndIndex: number) {
    if (this._startIndex !== undefined) {
      newEndIndex = Math.max(this._startIndex, newEndIndex);
    }
    this._endIndex = newEndIndex;
  }

  /**
   * Window size reflects how many elements could be, hypothetically, between the start index and the end index.
   *
   * Window size is defined only when `_startIndex` and `_endIndex` are both defined. It is different from `length` as `windowSize` is not tied to a specific iterable.
   *
   * `windowSize` is the difference between end index and start index. This means `windowSize` might not be realistic with respect to the `iterable`. For example, if end index is greater than the iterable length, window size might be larger than the iterable length.
   *
   * @returns {number} The hypothetical number of elements between start index and end index. Undefined if either start index or end index is undefined.
   */
  get windowSize(): number {
    if (this._startIndex === undefined || this._endIndex === undefined) {
      return undefined;
    }

    return this._endIndex - this._startIndex + 1;
  }

  /** decides how this `SlidingWindow` will behave when its window size needs to be changed to match its iterable length */
  protected _resizeStrategy: ResizeStrategy;
  /**
   * @returns {ResizeStrategy} How this `SlidingWindow` behaves when its end index is outside the iterable.
   */
  get resizeStrategy(): ResizeStrategy {
    return this.resizeStrategy;
  }
  /**
   * Changes the `SlidingWindow`'s resize strategy. It will determine how this `SlidingWindow` behaves when its end index is outside the underlying iterable.
   *
   * Setting a different `ResizeStrategy` will trigger a window resize.
   *
   * @param {ResizeStrategy} A resize strategy that determines how the `SlidingWindow` responds to resize.
   */
  set resizeStrategy(strategy: ResizeStrategy) {
    if (strategy !== this._resizeStrategy) {
      this._resizeStrategy = strategy;
      this._resizeAndSetWindow();
    }
  }

  /** The haystack upon which the SlidingWindow currently scopes */
  protected _iterable: Collection<TElement>;
  /**
   * @returns {Collection<TElement>} The underlying iterable on which this SlidingWindow defines a slice.
   */
  get iterable(): Collection<TElement> {
    return this._iterable;
  }
  /**
   * Changes the underlying iterable.
   */
  set iterable(newIterable: Collection<TElement>) {
    if (this._iterable !== newIterable) {
      this._iterable = newIterable;
      this._resizeAndSetWindow();
    }
  }

  /**
   * A `SlidingWindow` is fully initialized when:
   *
   * + `_iterable` is defined
   * + `_startIndex` and `_endIndex` are both defined
   * + `_capacity` is defined
   *
   * @returns {boolean} Whether the window is meaningfully defined.
   */
  protected get _isFullyInitialized(): boolean {
    return (
      this._iterable !== undefined && this._startIndex !== undefined && this._endIndex !== undefined
    );
  }

  /**
   * @returns {boolean} Whether there is any element from the iterable that is available through window. If this predicate is not meaningful (for example when `iterable` is not defined), `undefined` is returned. If the answer is ambiguous (for example, when `iterable` is partially materialized), `null` is returned.
   */
  get isWindowEmpty(): boolean | undefined | null {
    if (!this._isFullyInitialized) {
      return undefined;
    }

    const iterableLength = this._iterable.length;
    if (iterableLength !== undefined) {
      // at least one element
      return iterableLength <= this._startIndex;
    }

    if (Collection.isElementMaterialized(this._iterable, this._startIndex)) {
      return false;
    }

    // the iterable is partially materialized, we do not know the answer
    return null;
  }

  /**
   * @returns {boolean} Whether every index in the window corresponds to an element in the iterable. If this predicate is not meaningful (for example when `iterable` is not defined), `undefined` is returned. If the answer is ambiguous (for example, when `iterable` is partially materialized), `null` is returned.
   */
  get isWindowFull(): boolean | undefined | null {
    if (!this._isFullyInitialized) {
      return undefined;
    }

    const iterableLength = this._iterable.length;
    if (iterableLength !== undefined) {
      // last index corresponds to an element
      return iterableLength > this._endIndex;
    }

    if (Collection.isElementMaterialized(this._iterable, this._endIndex)) {
      return true;
    }

    // the iterable is partially materialized, we do not know the answer
    return null;
  }

  /**
   * Length is defined only when
   *
   * + `_iterable` is defined
   * + `_startIndex` and `_endIndex` are both defined
   *
   * It reflects the number of elements from the iterable that is in the window.
   *
   * Different from `windowSize`, `length` is tied to the `iterable`.
   *
   * @returns {number} The number of elements from the iterable currently in the Sliding Window. If `length` is not meaningful (for example when `iterable` is not defined), `undefined` is returned. If the answer is ambiguous (for example, when `iterable` is partially materialized), `null` is returned.
   */
  get length(): number | undefined | null {
    if (!this._isFullyInitialized) {
      return undefined;
    }

    if (this._iterable.length === undefined) {
      // check whether the element at `_endIndex` is materialized (defined), if it is, then `this._iterable.length > this._endIndex`
      if (Collection.isElementMaterialized(this._iterable, this._endIndex)) {
        return this.windowSize;
      } else {
        // There might be cases where the actual iterable length is greater than the window end index but it is partially materialized so we are not aware of its actual length. We can conservative here by returning `null` to indicate "we cannot determine"
        return null;
      }
    } else {
      const lastElementIndex = Math.min(this._iterable.length - 1, this._endIndex);
      return lastElementIndex - this._startIndex + 1;
    }
  }

  /**
   * @returns {number} Number of elements in `iterable` before the window start index. If this answer is not meaningful (for example when `iterable` is not defined), `undefined` is returned. If the answer is ambiguous (for example, when `iterable` is partially materialized), `null` is returned.
   */
  get numElementBefore(): number | undefined | null {
    if (!this._isFullyInitialized) {
      return undefined;
    }

    if (this._startIndex === 0) {
      return 0;
    }

    if (this._iterable.length === undefined) {
      // check whether the element at `_startIndex` is materialized (defined), if it is, then `this._iterable.length > this._startIndex`
      if (Collection.isElementMaterialized(this._iterable, this._startIndex)) {
        return this._startIndex;
      } else {
        // There might be cases where the actual iterable length is greater than the window end index but it is partially materialized so we are not aware of its actual length. We can conservative here by returning `null` to indicate "we cannot determine"
        return null;
      }
    } else {
      return Math.min(this._iterable.length, this._startIndex);
    }
  }

  /**
   * @returns {number} Number of elements in `iterable` after the window end index. If this answer is not meaningful (for example when `iterable` is not defined), `undefined` is returned. If the answer is ambiguous (for example, when `iterable` is partially materialized), `null` is returned.
   */
  get numElementAfter(): number | undefined | null {
    if (!this._isFullyInitialized) {
      return undefined;
    }

    const iterableLength = this._iterable.length;
    if (iterableLength === undefined) {
      // without knowing the accurate length of iterable, we cannot get a reliable number for numElementAfter. Being conservative, we return `null` to indicate "we cannot determine"
      return null;
    } else {
      return Math.max(0, iterableLength - this._endIndex - 1);
    }
  }

  /**
   * @returns {boolean} If true, then the window cannot shift towards the start anymore. If this answer is not meaningful (for example when `iterable` is not defined), `undefined` is returned.
   */
  get reachedStart(): boolean | undefined {
    if (!this._isFullyInitialized) {
      return undefined;
    }

    return this._startIndex === 0;
  }

  /**
   * @returns {boolean} If true, then the window cannot shift towards the end (last element of the iterable) anymore. If this answer is not meaningful (for example when `iterable` is not defined), `undefined` is returned. If the answer is ambiguous (for example, when `iterable` is partially materialized), `null` is returned.
   */
  get reachedEnd(): boolean | undefined | null {
    const numElementAfter = this.numElementAfter;
    if (numElementAfter === undefined) {
      return undefined;
    } else if (numElementAfter === null) {
      return null;
    } else if (numElementAfter === 0) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Creates a SlidingWindow instance.
   *
   * @param {number} [startIndex] - The start index of the SlidingWindow that defines the first element in the iterable available through the window, should be nonnegative.
   * @param {number} [endIndex] - The end index of the SlidingWindow that defines the last element in the iterable available through the window, should be lower bounded by the start index.
   * @param {Collection<TElement>} [iterable] - The underlying iterable to which this SlidingWindow scopes.
   * @param {ResizeStrategy} [resizeStrategy = ResizeStrategy.Shift] - The resize strategy that defines how the SlidingWindow will behave when its end index is greater than iterable length. Default to Shift resize strategy.
   */
  constructor(
    startIndex: number = undefined,
    endIndex: number = undefined,
    iterable: Collection<TElement> = undefined,
    resizeStrategy: ResizeStrategy = ResizeStrategy.Shift
  ) {
    this._iterable = iterable;
    this._resizeStrategy = resizeStrategy;
    this.setWindow(startIndex, endIndex);
  }

  /**
   * Implements the iteration protocol.
   */
  *[Symbol.iterator](): IterableIterator<TElement> {
    if (this._isFullyInitialized) {
      yield* this._iterable.slice(this._startIndex, this._endIndex + 1);
    }
  }

  /**
   * Takes in two new indices specifying new start index and new end index, adjusting these indices according to resize strategy, and set these indices as the window indices.
   *
   * A resize will only happen when the iterable length is known and the tentative new end index is greater than this length. In other words, if iterable is not defined or is a partially materialized collection, no resize will happen.
   *
   * @param {number} [tentativeStartIndex = this._startIndex] - A tentative start index to set to. Should be nonnegative.
   * @param {number} [tentativeEndIndex = this._endIndex] - A tentative end index to set to. Should be greater than or equal to the tentative start index.
   */
  _resizeAndSetWindow(
    tentativeStartIndex: number = this._startIndex,
    tentativeEndIndex: number = this._endIndex
  ): void {
    if (tentativeStartIndex === undefined && tentativeEndIndex === undefined) {
      return;
    }

    /**
     * Assertions:
     *
     * + `tentativeStartIndex >= 0`
     * + `tentativeEndIndex >= tentativeStartIndex`
     */
    if (
      this._iterable === undefined ||
      this._resizeStrategy === ResizeStrategy.NoAction ||
      this._iterable.length === undefined ||
      tentativeEndIndex < this._iterable.length
    ) {
      // resize strategy is not relevant
      this._startIndex_ = tentativeStartIndex;
      this._endIndex_ = tentativeEndIndex;
      return;
    }

    /**
     * Conditions:
     *
     * + `this._iterable !== undefined`
     * + `this._iterable.length !== undefined`
     * + `this.resizeStrategy !== ResizeStrategy.NoAction`
     * + `tentativeEndIndex >= this._iterable.length`
     */
    let surplusAmount = tentativeEndIndex - this._iterable.length + 1;
    if (
      this._resizeStrategy === ResizeStrategy.Shift ||
      this._resizeStrategy === ResizeStrategy.ShiftAndShrinkIfNecessary
    ) {
      const shiftRoom = tentativeStartIndex;
      if (shiftRoom !== 0) {
        const shiftAmount = Math.min(surplusAmount, shiftRoom);
        surplusAmount -= shiftAmount;
        tentativeStartIndex -= shiftAmount;
        tentativeEndIndex -= shiftAmount;
      }
    }

    if (
      surplusAmount > 0 &&
      (this._resizeStrategy === ResizeStrategy.Shrink ||
        this._resizeStrategy === ResizeStrategy.ShiftAndShrinkIfNecessary)
    ) {
      /**
       * Assertions:
       *
       * + `this._endIndex - this._iterable.length + 1 === surplusAmount`
       * + `(this._resizeStrategy === ResizeStrategy.Shift || this._resizeStrategy === ResizeStrategy.ShiftAndShrinkIfNecessary) && this._startIndex = 0`
       */
      tentativeEndIndex = this._iterable.length - 1;
      if (tentativeStartIndex > tentativeEndIndex) {
        /**
         * @see {@link ResizeStrategy#Shrink **Scenario 3**}
         * Since start index should lower bound end index, it should be at minimum equal to the end index
         */

        tentativeStartIndex = tentativeEndIndex;
      }
    }

    this._startIndex_ = tentativeStartIndex;
    this._endIndex_ = tentativeEndIndex;
  }

  /**
   * Retrieves an element at specified index in the Window.
   *
   * @example
   *
   * get(0) is equivalent with retrieving the iterable element at window start index.
   *
   * @param {number} windowIndex - The relative window index. A meaningful index should be between zero and element count (0 <= index < length).
   * @returns {TElement} The element at specified index.
   */
  get(windowIndex: number): TElement {
    return Collection.get(this._iterable, this._startIndex + windowIndex);
  }

  slice(start: number, end: number): Iterable<TElement> {
    return Collection.slice(this, start, end);
  }

  /**
   * Shift the window by changing its start index and end index by same amount.
   *
   * This amount is bounded `shiftAmount >= -startIndex` in that the shifted start index should still be nonnegative, though both indices can be shifted pass the current iterable length. This is because there is no meaningful negative start index for any iterable but a larger-than-current-iterable-length end index might be meaningful for other iterables.
   *
   * @param {number} shiftAmount - By which amount, the start index and end index will be changed. Due to iterable length constraint, the actual shift amount to each index might be smaller.
   */
  shiftWindow(shiftAmount: number): void {
    if (this._startIndex === undefined && this._endIndex === undefined) {
      return;
    }

    if (shiftAmount === 0) {
      return;
    }

    const shiftTowardsEnd: boolean = shiftAmount >= 0;
    if (shiftTowardsEnd) {
      if (this.reachedEnd === true) {
        // already reached end, cannot shift pass end
        return;
      }
    } else {
      // shift towards start
      if (this.reachedStart === true) {
        // already reached start, cannot shift pass start
        return;
      } else if (shiftAmount < -this._startIndex) {
        // this `shiftAmount` will result in a negative window start index, decrease to shift by start index amount
        shiftAmount = -this._startIndex;
      }
    }

    this._resizeAndSetWindow(this._startIndex + shiftAmount, this._endIndex + shiftAmount);
  }

  /**
   * Changes the window by redefining its start index and end index.
   *
   * If only one index needs to be changed, pass `undefined` to the other value.
   *
   * Due to resize strategy, the actual index value might be different.
   *
   * @param {number} [startIndex=this._startIndex] - The start index of the window. Will be lower bounded by 0. Default to current start index.
   * @param {number} [endIndex=this._endIndex] - The end index of the window. Will be lower bounded by startIndex. Default to current end index.
   */
  setWindow(startIndex: number = this._startIndex, endIndex: number = this._endIndex): void {
    if (startIndex === undefined) {
      if (endIndex === undefined) {
        // both start index and end index is `undefined`, nothing needs to be done
        return;
      } else {
        // set only the end index;
        this._endIndex_ = endIndex;
        return;
      }
    } else {
      // start index is defined
      if (endIndex === undefined) {
        this._startIndex_ = startIndex;
      } else {
        // both indices are defined
        startIndex = Math.max(0, startIndex);
        endIndex = Math.max(startIndex, endIndex);
        this._resizeAndSetWindow(startIndex, endIndex);
      }
    }
  }
}
