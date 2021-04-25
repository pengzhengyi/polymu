/**
 * @module
 *
 * This module provides a `PartialView` which represents a view transformation which selects a "window" of the source view.
 */

import { Collection } from '../../collections/Collection';
import { ResizeStrategy, SlidingWindow } from '../../collections/SlidingWindow';
import { IFeatureProvider } from '../../composition/composition';
import { AbstractViewFunction } from '../AbstractViewFunction';

/**
 * Selects a window from the source view. More specifically, it returns a slice, defined by start index and end index, of source view.
 *
 * The defined window can be adjusted by changing the window indices (`setWindow`) or shifting both indices by some amount (`shiftWindow`).
 *
 * Besides transforming source view to target view, PartialView also supports indexing the source view using a window index relative to the window start index (`get`), after the source view is defined.
 */
export class Partial<TViewElement>
  extends AbstractViewFunction<TViewElement>
  implements IFeatureProvider {
  /** methods that should be exposed since they define the API for `PartialView` */
  features: Array<string> = ['setWindow', 'shiftWindow'];

  /**
   * The `SlidingWindow` instance member of this `PartialView`, responsible for window-related logic.
   */
  protected _slidingWindow: SlidingWindow<TViewElement>;

  /**
   * Alias to `this._slidingWindow.iterable` as both should hold last source view for view generation.
   * @see {@link SlidingWindow#iterable}
   * @override
   */
  get lastSourceView(): Collection<TViewElement> {
    return this._slidingWindow.iterable;
  }

  /**
   * @returns {number} The start index of the `PartialWindow`. This index is inclusive.
   */
  get startIndex(): number {
    return this._slidingWindow.startIndex;
  }
  /**
   * @returns {number} The end index of the `PartialWindow`. This index is inclusive.
   */
  get endIndex(): number {
    return this._slidingWindow.endIndex;
  }

  /** actual window size - number of elements that target view will maximally contain */
  /**
   * Window size reflects how many elements from the source view might be included in the `PartialWindow`. It is defined as the difference between start index and end index. Therefore, it is not tied to the source view length.
   *
   * @returns {number} The number of elements that could be included in the range defined by the start index and end index. Undefined if either start index or end index is undefined.
   */
  get windowSize(): number {
    return this._slidingWindow.windowSize;
  }

  /**
   * @returns {boolean} Whether there is any element from the source view that is available through window. If this predicate is not meaningful (for example, before first view generation when source view is not defined), `undefined` is returned. If the answer is ambiguous (for example, when source view is a partially materialized collection), `null` is returned.
   */
  get isWindowEmpty(): boolean | undefined | null {
    return this._slidingWindow.isWindowEmpty;
  }

  /**
   * @returns {boolean} Whether every index in the window corresponds to an element in the source view. If this predicate is not meaningful (for example, before first view generation when source view is not defined), `undefined` is returned. If the answer is ambiguous (for example, when source view is a partially materialized collection), `null` is returned.
   */
  get isWindowFull(): boolean | undefined | null {
    return this._slidingWindow.isWindowFull;
  }

  /**
   * Length is defined only when
   *
   * + `lastSourceView` is defined
   * + `_startIndex` and `_endIndex` are both defined
   *
   * It reflects the number of elements from the iterable that is in the window.
   *
   * Different from `windowSize`, `length` is tied to the `iterable`.
   *
   * @returns {number} The number of elements from the iterable currently in the Sliding Window. If `length` is not meaningful (for example, before first view generation when source view is not defined), `undefined` is returned. If the answer is ambiguous (for example, when source view is a partially materialized collection), `null` is returned.
   */
  get length(): number {
    return this._slidingWindow.length;
  }

  /**
   * @returns {number} Number of elements in source view before the window start index. If this answer is not meaningful (for example, before first view generation when source view is not defined), `undefined` is returned. If the answer is ambiguous (for example, when source view is a partially materialized collection), `null` is returned.
   */
  get numElementBefore(): number {
    return this._slidingWindow.numElementBefore;
  }

  /**
   * @returns {number} Number of elements in `iterable` after the window end index. If this answer is not meaningful (for example, before first view generation when source view is not defined), `undefined` is returned. If the answer is ambiguous (for example, when source view is a partially materialized collection), `null` is returned.
   */
  get numElementAfter(): number {
    return this._slidingWindow.numElementAfter;
  }

  /**
   * @returns {boolean} If true, then the window cannot shift towards the start anymore. If this answer is not meaningful (for example, before first view generation when source view is not defined), `undefined` is returned.
   */
  get reachedStart(): boolean {
    return this._slidingWindow.reachedStart;
  }

  /**
   * @returns {boolean} If true, then the window cannot shift towards the end (last element of the source view) anymore. If this answer is not meaningful (for example, before first view generation when source view is not defined), `undefined` is returned. If the answer is ambiguous (for example, when source view is a partially materialized collection), `null` is returned.
   */
  get reachedEnd(): boolean {
    return this._slidingWindow.reachedEnd;
  }

  /**
   * Creates a PartialView instance.
   *
   * @public
   * @param {number} [startIndex] - The start index of the SlidingWindow that defines the first element in the iterable available through the window, should be nonnegative.
   * @param {number} [endIndex] - The end index of the SlidingWindow that defines the last element in the iterable available through the window, should be lower bounded by the start index.
   * @constructs PartialView<TViewElement>
   */
  constructor(startIndex: number = undefined, endIndex: number = undefined) {
    super();
    this._slidingWindow = new SlidingWindow(startIndex, endIndex, undefined, ResizeStrategy.Shift);
  }

  /**
   * @public
   * @override
   * @description Defines methods that should be exposed.
   */
  getFeatures(): IterableIterator<string> | Iterable<string> {
    return this.features;
  }

  /**
   * Retrieves an element at specified index in the Window.
   *
   * @example
   *
   * get(0) is equivalent with retrieving the source view element at window start index.
   *
   * @param {number} windowIndex - The relative window index. A meaningful index should be   between zero and element count (0 <= index < `this.length`).
   * @returns {TElement} The element at specified index.
   */
  get(windowIndex: number): TViewElement {
    return this._slidingWindow.get(windowIndex);
  }

  /**
   * @override
   * Regenerates the target view if any of the following conditions are true:
   *
   *    + `source` view changed
   *    + target view should be regenerated -- window changed
   *
   * If both conditions are false, nothing will be done -- same target view will be returned.
   */
  protected regenerateView(sourceView: Collection<TViewElement>, useCache: boolean): void {
    if (sourceView === this.lastSourceView) {
      if (useCache && !this.shouldRegenerateView) {
        return;
      }
    } else {
      // update iterable reference to `sourceView`
      this._slidingWindow.iterable = sourceView;
    }

    // setting `_targetView_` is necessary even when the reference does not change as it will invoke a setter which allows before and after target view update tasks to be executed
    this._targetView_ = this._slidingWindow;

    super.regenerateView(sourceView, useCache);
  }

  /**
   * Sets the **window**. Window is defined by two indices -- a start index and an end index. The elements with indices between (inclusive) these two window boundaries will be included in the target view.
   *
   * The indices are safe as they will be properly bounded:
   *
   *    + `startIndex` will be lower-bounded by 0
   *    + `endIndex` will be lower-bounded by bounded `startIndex`
   *
   * Will trigger a regeneration of view if window boundaries are changed.
   *
   * @public
   * @param {number} [startIndex = this.startIndex] - The start index of the window. Default to current window start index.
   * @param {number} [endIndex = this.endIndex] - The end index of the window. Default to current window end index.
   * @param {boolean} [noEventNotification = false] - This determines whether setting view window will trigger a {@link AbstractViewFunction.shouldRegenerateViewEventName} event. Leaving this value as `false` or passing `false` to this parameter means this event will be triggered and might be handled by subscribers. For example, the `ViewFunctionChain` subscribes to this event which invokes a same-named event which is then subscribed by the `BasicView` (if registered) which handles this event by actually rendering the changed view. Setting this value to `true` is useful when `setWindow` is triggered by an instance which handles this event. For example, `BasicView` handles this event by calling `refreshView` which will call the `setWindow` function. Therefore, to prevent double re-rendering, the `setWindow` call from `refreshView` should have this parameter set to `true`. This applies to other scenario where the caller of `setWindow` is responsible for actually rendering the view.
   * @returns {boolean} Whether this operation will be responsible for a regeneration of view. Even this operation does not cause view regeneration, a view regeneration might still happen because of other view generation triggering events.
   */
  setWindow(
    startIndex: number = this.startIndex,
    endIndex: number = this.endIndex,
    noEventNotification = false
  ): boolean {
    const oldStartIndex = this.startIndex;
    const oldEndIndex = this.endIndex;

    this._slidingWindow.setWindow(startIndex, endIndex);
    if (this.startIndex === oldStartIndex && this.endIndex === oldEndIndex) {
      // window does not actually changed
      return false;
    }

    if (noEventNotification) {
      // not triggering {@link AbstractViewFunction.shouldRegenerateViewEventName} event
      return (this._shouldRegenerateView = true);
    } else {
      return (this.shouldRegenerateView = true);
    }
  }

  /**
   * Shifts the current window towards the end by some amount.
   *
   * Window size will be preserved during shifting {@link SlidingWindow:ResizeStrategy#Shift}.
   *
   * @example Originally, 3 elements are in the window. After trying to shift right by 3 elements, the window still has 3 elements: in order to preserve window size, the window is actually only shifted right 2 elements.
   *    0 1 2 3 4
   *   [- - -]- -
   *    - -[- - -]
   *
   * @public
   * @param {number} shiftAmount - The amount to shift the window towards the last element of the source view. If negative, the window will actually be shifted towards the first element of the source view.
   * @param {boolean } noEventNotification - @see {@link PartialView#setWindow}. This determines whether the call to `setWindow` can result in event notification.
   * @returns {boolean} Whether this operation will be responsible for a regeneration of view. Even this operation does not cause view regeneration, a view regeneration might still happen because of other view generation triggering events.
   */
  shiftWindow(shiftAmount: number, noEventNotification = false): boolean {
    const oldStartIndex = this.startIndex;
    const oldEndIndex = this.endIndex;

    this._slidingWindow.shiftWindow(shiftAmount);

    if (this.startIndex === oldStartIndex && this.endIndex === oldEndIndex) {
      // window does not actually changed
      return false;
    }

    if (noEventNotification) {
      // not triggering {@link AbstractViewFunction.shouldRegenerateViewEventName} event
      return (this._shouldRegenerateView = true);
    } else {
      return (this.shouldRegenerateView = true);
    }
  }
}
