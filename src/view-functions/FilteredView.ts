/**
 * @module
 *
 * This module provides a `FilteredView` which represents a view transformation that conditionally select certain elements of the source view.
 */

import { Collection, LazyCollectionProvider } from '../collections/Collection';
import { IFeatureProvider } from '../composition/composition';
import { AbstractViewFunction } from './AbstractViewFunction';

/**
 * A function type that determines whether an element from the source view should retain in the target view.
 *
 * @param {TViewElement} element - An element to be filtered.
 * @returns {boolean} True if this element should be kept in the target view.
 */
export type FilterFunction<TViewElement> = (element: TViewElement) => boolean;

/**
 * Selects elements meeting certain condition(s).
 */
export class FilteredView<TViewElement>
  extends AbstractViewFunction<TViewElement>
  implements IFeatureProvider {
  /** methods that should be exposed since they define the API for `FilteredView` */
  protected features: Array<string> = [
    'addFilterFunction',
    'deleteFilterFunction',
    'clearFilterFunction',
  ];

  /** when target view needs to be regenerated, whether it can be regenerated by making refinement (further filtering) to the last target view which is referenced by `this.currentView` */
  private shouldRefineView = true;

  /** A mapping from identifier to filter function */
  private filterFunctions = new Map<unknown, FilterFunction<TViewElement>>();

  /** The aggregate filter function -- combining all filter functions */
  get filter(): FilterFunction<TViewElement> {
    const numFilterFunction: number = this.filterFunctions.size;
    if (numFilterFunction === 0) {
      return null;
    }

    return (item) => {
      for (const filterFunction of this.filterFunctions.values()) {
        if (!filterFunction(item)) {
          return false;
        }
      }
      return true;
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
   * Regenerates the target view if any of the following conditions are true:
   *
   *   + `source` view changed
   *   + target view should be regenerated -- the filter functions changed
   *
   * If both conditions are false, nothing will be done -- same target view will be returned.
   *
   * If `source` view does not change and only new filter functions have been added, target view will be generated from last target view. In other words, previous target view will be refined to reduce computation.
   * @override
   */
  protected regenerateView(sourceView: Collection<TViewElement>, useCache: boolean): void {
    if (useCache && sourceView === this.lastSourceView) {
      if (this.shouldRegenerateView) {
        if (this.shouldRefineView) {
          // make refinement to last target view
          sourceView = this.targetView;
        }
      } else {
        // `shouldRegenerateView` is false, no need to modify target view
        return;
      }
    }

    const filter = this.filter;
    if (filter) {
      this._targetView_ = new LazyCollectionProvider(
        (function* () {
          for (const viewElement of sourceView) {
            if (filter(viewElement)) {
              yield viewElement;
            }
          }
        })()
      );
    } else {
      // no filter is applied, do not modify the source view
      this._targetView_ = sourceView;
    }

    // since `shouldRefineView` is defined specially for `FilteredView`, it needs to be reset here
    this.shouldRefineView = true;
    super.regenerateView(sourceView, useCache);
  }

  /**
   * Binds a filter function under a key.
   *
   * Will trigger a regeneration of view if different filter function was bound to the key.
   *
   * Will cause **refinement** if only filter functions have been added `this.filterFunctions`.
   *
   * @public
   * @param key - An identifier.
   * @param {FilterFunction<TViewElement>} filterFunction - A function to determine whether an element in the source view should be kept in the target view.
   * @returns Whether this operation will cause a regeneration of view. Even this operation does not cause view regeneration, a view regeneration might still happen because of other operations.
   */
  addFilterFunction(key: unknown, filterFunction: FilterFunction<TViewElement>): boolean {
    if (this.filterFunctions.get(key) === filterFunction) {
      // no action is taken when same filter function is registered
      return false;
    }

    if (this.filterFunctions.has(key)) {
      // when there is already an existing different filter function registered under the same key, the view needs to be regenerated rather than refined
      this.shouldRefineView = false;
    }

    this.filterFunctions.set(key, filterFunction);
    return (this.shouldRegenerateView = true);
  }

  /**
   * Deletes a filter function bound under given key.
   *
   * Will trigger a non-refinement regeneration of view if a filter function is actually deleted.
   *
   * @public
   * @param key - An identifier.
   * @returns Whether this operation will cause a regeneration of view. Even this operation does not cause view regeneration, a view regeneration might still happen because of other operations.
   */
  deleteFilterFunction(key: unknown): boolean {
    if (this.filterFunctions.delete(key)) {
      this.shouldRefineView = false;
      return (this.shouldRegenerateView = true);
    }
    return false;
  }

  /**
   * Clears all filter functions.
   *
   * Will trigger a non-refinement regeneration of view if there are filter functions removed.
   *
   * @public
   * @returns Whether this operation will cause a regeneration of view. Even this operation does not cause view regeneration, a view regeneration might still happen because of other operations.
   */
  clearFilterFunction(): boolean {
    if (this.filterFunctions.size === 0) {
      return false;
    }
    this.filterFunctions.clear();
    this.shouldRefineView = false;
    return (this.shouldRegenerateView = true);
  }
}
