/**
 * @module
 * 
 * This module provides a `PartialView` which represents a view transformation which selects a "window" of the source view. 
 */

import { Collection, LazyCollectionProvider } from "../collections/Collection";
import { IFeatureProvider } from "../composition/composition";
import { bound } from "../utils/math";
import { AbstractViewFunction } from "./AbstractViewFunction";


/**
 * Selects a window from a view. More specifically, it returns a continuous selection of elements in source view.
 */
export class PartialView<TViewElement> extends AbstractViewFunction<TViewElement>
  implements IFeatureProvider {
  /** methods that should be exposed since they define the API for `PartialView` */
  features: Array<string> = ['setWindow', 'shiftWindow'];

  /** start index of the window, inclusive */
  partialViewStartIndex: number;
  /** end index of the window, inclusive */
  partialViewEndIndex: number;

  /** a hard limit on the length of the window */
  private windowSizeUpperBound: number;

  /** number of elements in source view. */
  get numElement(): number {
    return this.lastSourceView.length;
  }

  /** maximum window size -- maximum number of elements in the window */
  get maximumWindowSize(): number {
    return Math.min(this.numElement, this.windowSizeUpperBound);
  }

  /**
   * Changes the maximum window size by providing an upper bound. If this upper bound causes the maximum window size to change (more or less elements can be rendered), try to expand the window to be maximum window size.
   *
   * @param {number} windowSizeUpperBound - Similar to `this.windowSizeUpperBound`, a hard fixed (compared to the number of elements upper bound which changes when elements are removed or added) upper bound for window size.
   */
  set maximumWindowSize(windowSizeUpperBound: number) {
    const maximumWindowSize = this.maximumWindowSize;
    this.windowSizeUpperBound = windowSizeUpperBound;
    if (maximumWindowSize !== this.maximumWindowSize) {
      // maximum window size changes
      this.setWindow(this.partialViewStartIndex);
    }
  }

  /** actual window size - number of elements that target view will maximally contain */
  get windowSize(): number {
    return this.partialViewEndIndex - this.partialViewStartIndex + 1;
  }

  /**
   * the maximum number of actually rendered elements. `length` is speculative in that it is inferred from window size (how many elements could maximally be rendered in the window) and the number of elements (how many elements that could potentially be rendered)
   */

  get length(): number {
    return Math.min(this.windowSize, this.numElement);
  }

  /** number of elements in source view not rendered because they are "before" the window */
  get numElementNotRenderedBefore(): number {
    return this.partialViewStartIndex;
  }

  /** number of elements in source view not rendered because they are "after" the window */
  get numElementNotRenderedAfter(): number {
    return this.numElement - this.numElementNotRenderedBefore - this.windowSize;
  }

  /** whether the window has reached the left boundary -- it cannot be shifted leftward without shrinking the window length */
  get reachedStart(): boolean {
    return this.numElementNotRenderedBefore === 0;
  }

  /** whether the window has reached the right boundary -- it cannot be shifted rightward without shrinking the window length */
  get reachedEnd(): boolean {
    return this.numElementNotRenderedAfter === 0;
  }

  /**
   * Creates a PartialView instance.
   *
   * @public
   * @param {Collection<TViewElement>} [sourceView = []] - initial source view.
   * @param {number} [windowStartIndex = -1] - start index of the window.
   * @param {number} [windowEndIndex = -1] - end index of the window.
   * @param {number} [windowSizeUpperBound = Number.POSITIVE_INFINITY] - Maximum window size.
   * @constructs PartialView<TViewElement>
   */
  constructor(
    sourceView: Collection<TViewElement> = new LazyCollectionProvider([]),
    windowStartIndex: number = -1,
    windowEndIndex: number = -1,
    windowSizeUpperBound: number = Number.POSITIVE_INFINITY
  ) {
    super();
    this.windowSizeUpperBound = windowSizeUpperBound;
    this.lastSourceView = sourceView;
    this.setWindow(windowStartIndex, windowEndIndex);
    this.regenerateView(sourceView, false);
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
   * @override
   * Regenerates the target view if any of the following conditions are true:
   *
   *    + `source` view changed
   *    + target view should be regenerated -- window changed
   *
   * If both conditions are false, nothing will be done -- same target view will be returned.
   */
  protected regenerateView(sourceView: Collection<TViewElement>, useCache: boolean) {
    if (useCache && sourceView === this.lastSourceView && !this.shouldRegenerateView) {
      return;
    }

    // if the number of elements in source decreased, trying to shift the window so that around the same number of elements are rendered
    const numElements = sourceView.length;
    const maximumIndex = numElements - 1;

    const previousEndIndex = this.partialViewEndIndex;
    this.partialViewEndIndex = bound(this.partialViewEndIndex, 0, maximumIndex);
    const adjustment = previousEndIndex - this.partialViewEndIndex;

    this.partialViewStartIndex = bound(this.partialViewStartIndex - adjustment, 0, maximumIndex);
    this._targetView_ = new LazyCollectionProvider(
      sourceView.slice(this.partialViewStartIndex, this.partialViewEndIndex + 1)
    );

    super.regenerateView(sourceView, useCache);
  }

  /**
   * Sets the **window**. Window is defined by two indices -- a start index and an end index. The elements with indices between (inclusive) these two window boundaries will be included in the target view.
   *
   * The indices are safe as they will be properly bounded:
   *
   *    + `startIndex` will be lowerbounded by 0 and upperbounded by last index in source view.
   *    + `endIndex` will be lowerbounded by bounded `startIndex` and upperbounded by last index in source view.
   *
   * Will trigger a regeneration of view if window boundaries are changed.
   *
   * @public
   * @param {number} [startIndex = 0] - The start index of the window.
   * @param {number} [endIndex = startIndex + this.maximumWindowSize - 1] - The end index of the window.
   * @param {boolean} [noEventNotification = false] - This determines whether setting view window will trigger a {@link AbstractViewFunction.shouldRegenerateViewEventName} event. Leaving this value as `false` or passing `false` to this parameter means this event will be triggered and might be handled by subscribers. For example, the `ViewFunctionChain` subscribes to this event which invokes a same-named event which is then subscribed by the `BasicView` (if registered) which handles this event by actually rendering the changed view. Setting this value to `true` is useful when `setWindow` is triggered by an instance which handles this event. For example, `BasicView` handles this event by calling `refreshView` which will call the `setWindow` function. Therefore, to prevent double re-rendering, the `setWindow` call from `refreshView` should have this parameter set to `true`. This applies to other scenario where the caller of `setWindow` is responsible for actually rendering the view.
   * @returns Whether this operation will cause a regeneration of view. Even this operation does not cause view regeneration, a view regeneration might still happen because of other operations.
   */
  setWindow(
    startIndex: number = 0,
    endIndex: number = startIndex + this.maximumWindowSize - 1,
    noEventNotification: boolean = false
  ): boolean {
    const newStartIndex = bound(startIndex, 0, this.numElement - 1);
    const newEndIndex = bound(endIndex, newStartIndex, this.numElement - 1);

    if (newStartIndex === this.partialViewStartIndex && newEndIndex === this.partialViewEndIndex) {
      // new window is identical to old window, no change
      return false;
    }

    this.partialViewStartIndex = newStartIndex;
    this.partialViewEndIndex = newEndIndex;

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
   * + if `preserveWindowSize === true`
   *     Window size will not change even when it might cause no shifting happens.
   *     @example Originally, 3 elements are in the window. After trying to shift right by 3 elements, the window still has 3 elements: in order to preserve window size, the window is actually only shifted right 2 elements.
   *        0 1 2 3 4
   *       [- - -]- -
   *        - -[- - -]
   * + if `preserveWindowSize === false`
   *     Window size will not change unless there is not enough elements to include in the window after shifting.
   *
   *     @example Originally, 3 elements are in the window. After shifting right by 3 elements, only 2 elements will be in the window.
   *        0 1 2 3 4
   *       [- - -]- -
   *        - - -[- -]
   *
   * @public
   * @param {number} shiftAmount - The amount to shift the window rightward. If negative, the window will actually be shifted leftward.
   * @param {boolean} preserveWindowSize - Whether the window size should be preserved even if doing so will result in not shifting sufficiently or no shifting at all.
   * @param {boolean } noEventNotification - @see {@link PartialView#setWindow}. This determines whether the call to `setWindow` can result in event notification.
   * @returns {number} The actual amount of shifting. This number also indicates whether this operation will cause a regeneration of view: 0 means no regeneration while non-zero means regeneration needed. Even this operation does not cause view regeneration, a view regeneration might still happen because of other operations.
   */
  shiftWindow(
    shiftAmount: number,
    preserveWindowSize: boolean,
    noEventNotification: boolean = false
  ): number {
    if (shiftAmount === 0) {
      return 0;
    }

    const shiftTowardsEnd: boolean = shiftAmount >= 0;
    if ((shiftTowardsEnd && this.reachedEnd) || (!shiftTowardsEnd && this.reachedStart)) {
      return 0;
    }

    let startIndex, endIndex;
    if (preserveWindowSize) {
      if (shiftTowardsEnd) {
        endIndex = Math.min(this.numElement - 1, this.partialViewEndIndex + shiftAmount);
        startIndex = Math.max(0, endIndex - this.windowSize + 1);
      } else {
        startIndex = Math.max(0, this.partialViewStartIndex + shiftAmount);
        endIndex = Math.min(this.numElement - 1, startIndex + this.windowSize - 1);
      }
    } else {
      startIndex = this.partialViewStartIndex + shiftAmount;
      endIndex = startIndex + this.windowSize - 1;
    }
    const previousStartIndex = this.partialViewStartIndex;
    if (this.setWindow(startIndex, endIndex, noEventNotification)) {
      return this.partialViewStartIndex - previousStartIndex;
    } else {
      return 0;
    }
  }
}
