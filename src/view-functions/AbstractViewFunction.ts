/**
 * @module
 *
 * This module provides a basic abstract class `AbstractViewFunction` that is useful in implementing ViewFunction interface.
 *
 * It provides the following features:
 *
 *      + contains `beforeViewUpdateTaskQueue` and `afterViewUpdateTaskQueue` that can be used to add one-time/recurring tasks to execute before and after view update.
 *      + requires an implementation of `getFeatures` that exposes features that should be surfaced
 *      + will post `shouldRegenerateViewEventName` events when a view generation is necessary
 */

import { ViewFunction } from './ViewFunction';
import { TaskQueue } from '../collections/TaskQueue';
import { IFeatureProvider } from '../composition/composition';
import { Collection } from '../collections/Collection';
import { EventNotifier } from '../composition/EventNotification';

/**
 * The basic prototype for creating an efficient implementation of ViewFunction.
 *
 * This prototype provides two core properties:
 *
 *    + `targetView`: contains the output view. The `view` function will first call `regenerateView` to recreate the `targetView` if necessary and then return the modified `targetView` as output.
 *    + `lastSourceView`: contains a previous snapshot of `sourceView` that was passed as argument in last invocation of `view` function. This property could be combined with `shouldRegenerateView` to create a way to determine whether the target view should be regenerated in `regenerateView`.
 *
 * In addition, `AbstractViewFunction` provides two task queues to add tasks that should be executed before/after updating target view one-off/every-time.
 *
 * To extend `AbstractViewFunction`, derived classes should override `regenerateView` to create target view efficiently.
 */

export abstract class AbstractViewFunction<TViewElement>
  extends EventNotifier
  implements ViewFunction<TViewElement>, IFeatureProvider {
  /** a queue containing tasks executed before view update */
  beforeViewUpdateTaskQueue: TaskQueue = new TaskQueue();
  /** a queue containing tasks executed after view update */
  afterViewUpdateTaskQueue: TaskQueue = new TaskQueue();

  /**
   * When `shouldRegenerateView` is set to `false` from `true`, this implies target view needs to be regenerated. In this case, an event will be raised signaling to any potential subscribers that a view regeneration is immediate.
   *
   * For example, consider a `SortedView` that reorders a collection of item and a renderer which returns the top N items. When a new sorting function is added to the `SortedView`, in other words, the `SortedView` needs to generate a different list of recommendation, the renderer will be notified through the event and it can request an actual generation of target view through `SortedView`'s `view` function. After the new target view is produced, the renderer can then returns a different set of top N items.
   */
  static shouldRegenerateViewEventName = 'willRegenerateView';

  /**
   * Whether target view should be regenerated even if source view is the same as `lastSourceView`
   *
   * This property is not in effect, but derived classes could make use of this property to devise a way to determine whether a regeneration of target view is necessary.
   *
   * `_shouldRegenerateView` is `true` initially since target view must be `regenerated` as there is no meaningful reference to prior target view for first time.
   */
  protected _shouldRegenerateView = true;

  protected get shouldRegenerateView(): boolean {
    return this._shouldRegenerateView;
  }
  protected set shouldRegenerateView(newValue: boolean) {
    const shouldInvokeEvent: boolean = newValue && !this._shouldRegenerateView;
    this._shouldRegenerateView = newValue;
    if (shouldInvokeEvent) {
      // `_shouldRegenerateView` is set to `true` from `false`
      this.invoke(AbstractViewFunction.shouldRegenerateViewEventName);
    }
  }

  /** previous source view, could be used to determine whether source view is the same */
  protected _lastSourceView: Collection<TViewElement>;

  /**
   * @returns {Collection<TViewElement>} The last source view that has been passed in for view generation.
   */
  get lastSourceView(): Collection<TViewElement> {
    return this._lastSourceView;
  }

  /** holds target view */
  protected _targetView: Collection<TViewElement>;

  get targetView(): Collection<TViewElement> {
    return this._targetView;
  }
  protected set _targetView_(view: Collection<TViewElement>) {
    this.beforeViewUpdateTaskQueue.work(this);
    this._targetView = view;
    this.afterViewUpdateTaskQueue.work(this);
  }

  /**
   * @public
   * @abstract
   * @description Defines methods that should be exposed.
   */

  abstract getFeatures(): IterableIterator<string> | Iterable<string>;

  /**
   * @public
   * @override
   * @description View is lazily generated. In other words, last target view is cached and reused if possible.
   */
  view(sourceView: Collection<TViewElement>, useCache = true): Collection<TViewElement> {
    this.regenerateView(sourceView, useCache);
    return this.targetView;
  }

  /**
   * Generates the target view.
   *
   * This function should be overridden in derived classes to provide actual implementation of target view generation.
   *
   * Usually, consider to regenerate target view if any of the following conditions are true:
   *
   *    + `source` view changed
   *    + target view should be regenerated -- indicated by the `shouldRegenerateView` boolean property.
   *
   * Consider to reuse the target view from last time if both conditions are false -- same target view will be returned.
   *
   * @param {Collection<TViewElement>} sourceView - An Collection of elements of certain type representing the source view.
   * @param {boolean} useCache - Whether previous target view (cache) can be reused giving same source view and same transformation. A `true` value for `useCache` should force a view generation.
   */
  protected regenerateView(sourceView: Collection<TViewElement>, useCache: boolean): void {
    this.shouldRegenerateView = false;
    this._lastSourceView = sourceView;
  }
}
