/**
 * @module
 *
 * This module provides a `ViewTransformation` which is able to intake an arbitrary unary function to "transform" view elements.
 */

import { Collection, LazyCollectionProvider } from '../../collections/Collection';
import { AbstractViewFunction } from '../AbstractViewFunction';

/**
 * Denote the type of a view transformation function that processes a single view element.
 */
type Transformation<TViewElement> = (element: TViewElement) => TViewElement;

/**
 * `ViewTransformation` transforms the provided view elements by some arbitrary function. This class is designed to be versatile -- you can register any unary function that process `ViewElement` in some way.
 */
export class Transform<TViewElement> extends AbstractViewFunction<TViewElement> {
  /**
   * @returns The transformation function of this `ViewTransformation` instance.
   */
  get transformation(): Transformation<TViewElement> {
    return this.transformation_;
  }
  /**
   * Change the underlying transformation function.
   *
   * @param transformation - A transformation function used to update this `ViewTransformation` instance. If this transformation function is different from existing one, a view regeneration needed event will be fired.
   */
  set transformation(transformation: Transformation<TViewElement>) {
    if (this.transformation_ !== transformation) {
      this.transformation_ = transformation;
      this.shouldRegenerateView = true;
    }
  }

  /**
   * The underlying transformation function of this `ViewTransformation` instance.
   */
  protected transformation_: Transformation<TViewElement>;

  /**
   * Create a `ViewTransformation` instance.
   *
   * @param transformation - A transformation function used to initialize this `ViewTransformation` instance.
   * @constructs ViewTransformation
   */
  constructor(transformation?: Transformation<TViewElement>) {
    super();
    this.transformation_ = transformation;
  }

  /**
   * @public
   * @override
   * @description Defines methods that should be exposed.
   */
  getFeatures(): IterableIterator<string> | Iterable<string> {
    return [];
  }

  /**
   * @override
   * Regenerates the target view if any of the following conditions are true:
   *
   *    + `useCache` is false
   *    + `source` view changed
   *    + target view should be regenerated -- the transformation function changed
   */
  protected regenerateView(sourceView: Collection<TViewElement>, useCache: boolean): void {
    if (useCache && sourceView === this.lastSourceView && !this.shouldRegenerateView) {
      // we can reuse current view
      return;
    }

    const transformation = this.transformation_;

    if (transformation) {
      const targetView = new LazyCollectionProvider(
        (function* () {
          for (const element of sourceView) {
            yield transformation(element);
          }
        })()
      );

      if (sourceView.length !== undefined) {
        targetView.length = sourceView.length;
      }

      this._targetView_ = targetView;
    } else {
      this._targetView_ = sourceView;
    }

    super.regenerateView(sourceView, useCache);
  }
}
