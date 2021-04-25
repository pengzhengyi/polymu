/**
 * @module
 *
 * This module provides an `AggregateView` which represents a view transformation that combines other view functions together. In other words, `AggregateView` can be seen as a grouping or boxing of view functions.
 */

import { Prop } from '../../view-element/Abstraction';
import { Collection } from '../../collections/Collection';
import { IFeatureProvider, composeFeatures } from '../../composition/composition';
import { NotSupported } from '../../utils/errors';
import { AbstractViewFunction } from '../AbstractViewFunction';

/**
 * Combines several view functions into an aggregate view function.
 *
 * When target view needs to be generated from a source view, the source view will be provided to first view function, whose target view will be provided as source view to the second view function, and so on, where the last view function's target view be returned as the final target view.
 */
export class Aggregate<TViewElement>
  extends AbstractViewFunction<TViewElement>
  implements IFeatureProvider {
  /** an array of view functions that consist the chain */
  protected viewFunctions_: Array<AbstractViewFunction<TViewElement>>;
  protected viewFunctionsProxy_: Array<AbstractViewFunction<TViewElement>>;

  /**
   * Obtains a reference to the `_viewFunctions` defining this chain which could be used to add new view function or manipulate existing view function. Since `_viewFunctions` will potentially be changed, this function also conservatively notifies the chain that target view regeneration is necessary for next time (by setting `this.shouldRegenerateView` to `true`.
   * @returns {Array<AbstractViewFunction<TViewElement>>} An array of view functions where each view function's index determines its order in transforming the source view.
   */

  get viewFunctions(): Array<AbstractViewFunction<TViewElement>> {
    this.shouldRegenerateView = true;
    return this.viewFunctionsProxy_;
  }

  /**
   * @param {Array<AbstractViewFunction<TViewElement>>} [viewFunctions = []] - An array of view function that transforms source view elements of specified type to target view elements of same type.
   * @constructs {ViewFunctionChain<TViewElement>} A pipeline (chain) of view functions.
   */
  constructor(viewFunctions: Array<AbstractViewFunction<TViewElement>> = []) {
    super();

    const self = this;
    this.viewFunctions_ = viewFunctions;
    for (const viewFunction of viewFunctions) {
      // subscribe chain to target view regeneration of newly added view function
      viewFunction.subscribe(self, AbstractViewFunction.shouldRegenerateViewEventName, () =>
        self.onViewFunctionWillRegenerateView()
      );
    }
    this.viewFunctionsProxy_ = new Proxy(this.viewFunctions_, {
      /**
       * A trap for getting a property value.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/get}
       */
      get(target: Array<AbstractViewFunction<TViewElement>>, prop: Prop, receiver: any) {
        const numViewFunction: number = target.length;
        switch (prop) {
          case 'copyWithin':
            throw new NotSupported(
              'copyWithin is not supported on view function chain as it might cause one view to appear multiple times in chain'
            );
          case 'fill':
            throw new NotSupported(
              'fill is not supported on view function chain as it might cause one view to appear multiple times in chain'
            );
          case 'pop':
            // unsubscribe chain from last view function if exists
            if (numViewFunction > 0) {
              target[numViewFunction - 1].unsubscribe(
                self,
                AbstractViewFunction.shouldRegenerateViewEventName
              );
            }
            break;
          case 'push':
            // return a wrapper function of `Array.push`
            return function (...items: Array<AbstractViewFunction<TViewElement>>) {
              const newNumViewFunction: number = Reflect.apply(target.push, target, items);
              // for loop is used after a call to `Array.push` to avoid the rare case where a TypeError is thrown because the array will become too large
              for (const item of items) {
                // subscribe chain to target view regeneration of newly added view function
                item.subscribe(self, AbstractViewFunction.shouldRegenerateViewEventName, () =>
                  self.onViewFunctionWillRegenerateView()
                );
              }

              return newNumViewFunction;
            };
          case 'shift':
            // unsubscribes chain from first view function if exists
            if (numViewFunction > 0) {
              target[0].unsubscribe(self, AbstractViewFunction.shouldRegenerateViewEventName);
            }
            break;
          case 'splice':
            return function (
              start: number,
              deleteCount: number = numViewFunction - start,
              ...items: Array<AbstractViewFunction<TViewElement>>
            ) {
              const deletedViewFunctions = Reflect.apply(target.splice, target, [
                start,
                deleteCount,
                ...items,
              ]);

              for (const viewFunction of items) {
                // subscribe chain to target view regeneration of newly added view function
                viewFunction.subscribe(
                  self,
                  AbstractViewFunction.shouldRegenerateViewEventName,
                  () => self.onViewFunctionWillRegenerateView()
                );
              }
              for (const deletedViewFunction of deletedViewFunctions) {
                // unsubscribe from deleted view functions
                deletedViewFunction.unsubscribe(
                  self,
                  AbstractViewFunction.shouldRegenerateViewEventName
                );
              }

              return deletedViewFunctions;
            };
          case 'unshift':
            // return a wrapper function of `Array.unshift`
            return function (...items: Array<AbstractViewFunction<TViewElement>>) {
              const newNumViewFunction: number = Reflect.apply(target.unshift, target, items);
              // for loop is used after a call to `Array.push` to avoid the rare case where a TypeError is thrown because the array will become too large
              for (const item of items) {
                // subscribe chain to target view regeneration of newly added view function
                item.subscribe(self, AbstractViewFunction.shouldRegenerateViewEventName, () =>
                  self.onViewFunctionWillRegenerateView()
                );
              }

              return newNumViewFunction;
            };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    composeFeatures(this, viewFunctions as Array<IFeatureProvider>);
  }

  /**
   * @public
   * @override
   * @description Defines methods that should be exposed.
   */
  *getFeatures(): IterableIterator<string> | Iterable<string> {
    for (const viewFunction of this.viewFunctions_) {
      yield* viewFunction.getFeatures();
    }
  }

  /**
   * @override
   * Regenerates the target view if any of the following conditions are true:
   *
   *    + `source` view changed
   *    + target view should be regenerated -- any view function is inserted, modified, removed. In other words, whether the aggregate view function changed.
   */
  protected regenerateView(sourceView: Collection<TViewElement>, useCache: boolean): void {
    if (useCache && sourceView === this.lastSourceView && !this.shouldRegenerateView) {
      return;
    }

    // target view will be generated by piping the source view through the chain
    this._targetView_ = this.viewFunctions_.reduce(
      (_source, viewFunction) => viewFunction.view(_source, useCache),
      sourceView
    );

    super.regenerateView(sourceView, useCache);
  }

  /**
   * If a registered view function will need to regenerate target view, this function will be called to signal a target view regeneration is also necessary for the view function chain.
   */
  protected onViewFunctionWillRegenerateView(): void {
    this.shouldRegenerateView = true;
  }
}
