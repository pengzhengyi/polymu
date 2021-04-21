/**
 * @module
 *
 * This module provide a `SortedView` which represents a view transformation that reorders elements in source view according to its existing sorting functions.
 */

import { Collection, LazyCollectionProvider } from '../collections/Collection';
import Heap from '../collections/Heap';
import { IFeatureProvider } from '../composition/composition';
import { quickSort } from '../utils/ArrayHelper';
import { AbstractViewFunction } from './AbstractViewFunction';

/**
 * A function type that orders two elements from source view.
 *
 * @param {TViewElement} e1 - The first element.
 * @param {TViewElement} e2 - The second element.
 * @returns {number} A number indicating the comparison result. {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort}
 */
export type SortingFunction<TViewElement> = (e1: TViewElement, e2: TViewElement) => number;

/**
 * This interface groups a sorting function with its priority.
 *
 * The priority number determines the precedence of sorting functions. The larger the priority number is, the more important it is.
 *
 * @example Suppose in terms of priority, S1 > S2 > S3. Then S1 will be first used to order elements. If there is a tie (two elements are equivalent according to S1), their order will then be determined by S2, and possibly by S3 if the comparison result is still a tie.
 */
export interface SortingFunctionWithPriority<TViewElement> {
  sortingFunction: SortingFunction<TViewElement>;
  priority: number;
}

/**
 * A customized Heap that exposes the underlying array and supports changing the comparator.
 */

class SortedViewHeap<TViewElement> extends Heap<TViewElement> {
  /**
   * Whether the heap is fully sorted.
   *
   * A fully sorted heap will have its array representation equivalent to the breadth first traversal of the heap.
   *
   * In other words, a fully sorted heap's array representation is already in sorted order.
   *
   * @example
   *
   *    `[1, 2, 3, 6, 7, 4, 5]` represents a balanced min heap but not a fully sorted min heap.
   */

  isFullySorted = false;

  /**
   * The underlying array that represents the heap.
   *
   * @returns {Array<TViewElement>} The underlying array of the heap.
   */

  get array(): Array<TViewElement> {
    return this._array;
  }

  /**
   * Changing the comparator of the heap.
   */

  set comparator(newValue: SortingFunction<TViewElement>) {
    if (this._comparator !== newValue) {
      this._comparator = newValue;
      quickSort(this._array, newValue, 0, this._count);
      this.isFullySorted = true;
    }
  }

  /**
   * @override
   */
  push(...elements: Array<TViewElement>) {
    super.push(...elements);
    this.isFullySorted = false;
  }

  /**
   * @override
   */
  pop(): TViewElement {
    this.isFullySorted = false;
    return super.pop();
  }
}

/**
 * Reorders elements according to certain comparison method(s).
 */
export class SortedView<TViewElement>
  extends AbstractViewFunction<TViewElement>
  implements IFeatureProvider {
  /** methods that should be exposed since they define the API for `SortedView` */
  features: Array<string> = [
    'addSortingFunction',
    'deleteSortingFunction',
    'clearSortingFunction',
    'reorderSortingFunction',
  ];

  /** a mapping from identifier to a sorting function and its priority */
  sortingFunctions = new Map<unknown, SortingFunctionWithPriority<TViewElement>>();

  /** denotes the current smallest priority associated with sorting function */
  private smallestPriority = 0;

  private heap: SortedViewHeap<TViewElement>;

  /**
   * Existing sorting functions will be applied in order of priority -- higher priority sorting function will be used first, lower priority sorting function will be used when the higher priority ones result in tie.
   * @returns The aggregate sorting function.
   */
  get sorter(): SortingFunction<TViewElement> {
    const numSortingFunction: number = this.sortingFunctions.size;
    if (numSortingFunction === 0) {
      return null;
    }

    const sortingFunctions = Array.from(this.sortingFunctions);
    // higher priority sorting function comes first
    sortingFunctions.sort((s1, s2) => s2[1].priority - s1[1].priority);

    return (e1, e2) => {
      let sortingFunctionIndex = 0;
      while (sortingFunctionIndex < numSortingFunction) {
        const { sortingFunction } = sortingFunctions[sortingFunctionIndex][1];
        const result: number = sortingFunction(e1, e2);
        if (result !== 0) {
          return result;
        }

        sortingFunctionIndex++;
      }
      return 0;
    };
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
   *    + target view should be regenerated -- the sorting function changed
   */
  protected regenerateView(sourceView: Collection<TViewElement>, useCache: boolean): void {
    if (useCache && sourceView === this.lastSourceView && !this.shouldRegenerateView) {
      // source has not change and sorting functions have not changed => we can reuse current view
      return;
    }

    const sorter = this.sorter;

    if (sorter) {
      if (
        !this.heap || // heap is constructed
        sourceView !== this.lastSourceView || // source view changed
        !useCache /* source view is not reuseable */
      ) {
        this.heap = new SortedViewHeap<TViewElement>(sorter);
        this.heap.extend(sourceView);
      }

      this.heap.comparator = sorter;
      if (this.heap.isFullySorted) {
        this._targetView_ = this.heap.array;
      } else {
        this._targetView_ = new LazyCollectionProvider(this.heap);
      }
    } else {
      this._targetView_ = sourceView;
    }

    super.regenerateView(sourceView, useCache);
  }

  /**
   * Binds a sorting function with given priority under a key.
   *
   * Will trigger a regeneration of view if different sorting function or same sorting function with a different priority was bound to the key.
   *
   * @public
   * @param key - An identifier.
   * @param {SortingFunction<TViewElement>} sortingFunction - A function to determine how elements from source view should be ordered in the target view.
   * @param {number} [priority = this.smallestPriority - 1] - The priority of newly-bound sorting function. The higher the priority, the more important the sorting function. Default to add a least important sorting function.
   * @returns Whether this operation will cause a regeneration of view. Even this operation does not cause view regeneration, a view regeneration might still happen because of other operations.
   */
  addSortingFunction(
    key: unknown,
    sortingFunction: SortingFunction<TViewElement>,
    priority: number = this.smallestPriority - 1
  ): boolean {
    const existingSortingFunction = this.sortingFunctions.get(key);
    if (
      existingSortingFunction &&
      existingSortingFunction.priority === priority &&
      existingSortingFunction.sortingFunction === sortingFunction
    ) {
      return false;
    }

    this.smallestPriority = Math.min(this.smallestPriority, priority);
    this.sortingFunctions.set(key, { sortingFunction, priority });
    return (this.shouldRegenerateView = true);
  }

  /**
   * Deletes a sorting function bound under given key.
   *
   * Will trigger a regeneration of view if a sorting function is actually deleted.
   *
   * @public
   * @param key - An identifier.
   * @returns Whether this operation will cause a regeneration of view. Even this operation does not cause view regeneration, a view regeneration might still happen because of other operations.
   */
  deleteSortingFunction(key: string): boolean {
    if (this.sortingFunctions.delete(key)) {
      return (this.shouldRegenerateView = true);
    }
    return false;
  }

  /**
   * Clears all sorting functions.
   *
   * Will trigger a regeneration of view if there are filter functions removed.
   *
   * @public
   * @returns Whether this operation will cause a regeneration of view. Even this operation does not cause view regeneration, a view regeneration might still happen because of other operations.
   */
  clearSortingFunction(): boolean {
    if (this.sortingFunctions.size === 0) {
      return false;
    }

    this.sortingFunctions.clear();
    this.smallestPriority = 0;
    return (this.shouldRegenerateView = true);
  }

  /**
   * Assigns a set of sorting function different priority numbers.
   *
   * If any sorting function priority is changed, a regeneration of view will be triggered.
   *
   * @public
   * @param {Map<unknown, number} reordering - A mapping from identifier to new priority number.
   * @returns Whether this operation will cause a regeneration of view. Even this operation does not cause view regeneration, a view regeneration might still happen because of other operations.
   */
  reorderSortingFunction(reordering: Map<unknown, number>): boolean {
    let shouldRegenerateView = false;

    for (const [key, newPriority] of reordering) {
      this.smallestPriority = Math.min(this.smallestPriority, newPriority);
      const { priority, sortingFunction } = this.sortingFunctions.get(key);
      if (priority !== newPriority) {
        this.sortingFunctions.set(key, { priority: newPriority, sortingFunction });
        shouldRegenerateView = true;
      }
    }

    if (shouldRegenerateView) {
      return (this.shouldRegenerateView = shouldRegenerateView);
    }
    return false;
  }
}
