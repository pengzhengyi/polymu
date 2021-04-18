/**
 * @module
 *
 * This module provides interface `IViewElementProvider` and some utility classes implementing this interface.
 */

import { Collection, LazyCollectionProvider } from '../collections/Collection';
import { peek } from '../utils/IterableHelper';
import { TViewElementLike } from '../view-functions/SyncView';
import { ViewElement } from './ViewElement';

/**
 * This interface abstracts out a provider that returns parent `ViewElement` and child `ViewElement` on demand. This parent-child relationship can also be viewed as a container-item relationship -- all child `ViewElement` are contained/registered in parent `ViewElement`.
 */
export interface IViewElementProvider {
  /**
   * If exists, `parentViewElement` should provide a `ViewElement` that is parent for all `ViewElement` in `childViewElements`.
   */
  parentViewElement?: ViewElement;
  /**
   * An iterable of `ViewElement`.
   *
   * This iterable should allow multiple times of iteration. If these `ViewElement` can fit inside memory, then an Array or a `LazyCollectionProvider` will be the best choice. If the number of `ViewElement` is too large to fit inside memory, a custom built subclass of `UnmaterializableCollectionProvider` might be a better alternative.
   */
  childViewElements: Iterable<ViewElement>;
}

/**
 * Extend `LazyCollectionProvider` to provide these additional functionalities:
 *
 * + caller can check whether materialization finished through `materialized`.
 * + caller can execute custom logic before materialization through `materializationCallback`.
 */
class LazyCollectionProviderWithMaterializationCallback<TElement> extends LazyCollectionProvider<
  TElement
> {
  /**
   * A callback that when registered will be called before materialization happens. This can be used to define additional actions to execute during materialization.
   *
   * @callback
   * @param index - The index of element to be materialized.
   * @param materializingElement - The element about to be materialized.
   */
  materializationCallback: (index: number, materializingElement: TElement) => void;

  /**
   * Expose `this._materialized`.
   *
   * @alias _materialized
   * @returns Whether the underlying iterable has been fully iterated and materialized.
   */
  get materialized(): boolean {
    return this._materialized;
  }

  /**
   * @override Invoke `materializationCallback` if bound before materialize an element.
   */
  protected materializeElement(index: number, element: TElement) {
    this.materializationCallback && this.materializationCallback(index, element);
    this._materializedCollection[index] = element;
  }
}

/**
 * A union type that contains all types which can be used to initialize `ViewElementProvider`.
 *
 * Since HTMLTemplateElement (`<template>`)'s content is a DocumentFragment and since DocumentFragment implements the ParentNode interface, source can therefore be classified into one of two forms:
 *
 *    + (rooted) a node who will be the parent view element and whose children will be the child view elements
 *    + (unrooted) a collection of elements which will themselves be child view elements
 */
export type TSourceType =
  | HTMLTemplateElement
  | DocumentFragment
  | HTMLCollection
  | HTMLElement
  | Iterable<HTMLElement>
  | ViewElement
  | Iterable<ViewElement>;

/**
 * This class provides the ability to parse DOM constructs like `HTMLCollection`, `HTMLElement`, `HTMLTemplateElement` to provide parent and children `ViewElement`.
 *
 * After creating an instance of `ViewElementProvider`, an invocation of `consume` method is necessary to start parsing DOM constructs and building `ViewElement` hierarchy.
 */
export class ViewElementProvider implements IViewElementProvider {
  /**
   * A threshold above which lazy initialization will be applied. When lazy initialization is applied, children `ViewElement` will not be added to parent `ViewElement` immediately. Rather it will be added before this `ViewElement` is about to be iterated over.
   */
  static LAZY_INITIALIZATION_THRESHOLD: number = 10000;

  /** @override */
  parentViewElement: ViewElement;

  /**
   * Internal implementation to provide children `ViewElement`.
   */
  protected getChildViewElementsInternal: () => Collection<ViewElement>;

  /** @override */
  get childViewElements(): Collection<ViewElement> {
    return this.getChildViewElementsInternal();
  }

  /**
   * Consume DOM construct so that current `ViewElementProvider` is able to provide corresponding `ViewElement` construct.
   *
   * @param source - A DOM construct provides DOM element(s) to bootstrap corresponding `ViewElement` hierarchy.
   * @param {HTMLElement} [fallbackContainer] - An DOM element which will be used to (re)create parent `ViewElement` if `source` is "unrooted". An error will be raised if this argument is not provided when `source` is "unrooted" and parent `ViewElement` has not been initialized before.
   * @param {boolean} [shouldLazyInitialize = undefined] - Whether children `ViewElement` will be lazily registered to the parent `ViewElement`. Default to `undefined`, which means that lazy initialization is enabled when the number of child DOM elements exceeds the threshold.
   */
  consume(
    source: TSourceType,
    fallbackContainer?: HTMLElement,
    shouldLazyInitialize: boolean = undefined
  ) {
    if (source instanceof ViewElement) {
      this.parentViewElement = source;
      this.getChildViewElementsInternal = () => this.parentViewElement.children_;
      return;
    }

    if (source instanceof HTMLTemplateElement) {
      source = source.content;
    }

    if (source instanceof DocumentFragment) {
      let children: HTMLCollection = source.children;

      if (children.length === 1) {
        source = children[0] as HTMLElement;
      } else {
        source = children;
      }
    }

    if (source instanceof HTMLElement) {
      this.parentViewElement = new ViewElement(source, [(element) => new ViewElement(element)]);
      source = source.children;
    } else {
      // no provided parent DOM element, use the fallback one
      if (fallbackContainer) {
        this.parentViewElement = new ViewElement(fallbackContainer, [
          (element) => new ViewElement(element),
        ]);
      } else if (this.parentViewElement === undefined) {
        throw new ReferenceError('fallbackContainer not provided when needed');
      }
    }

    // source is either an iterable of ViewElement or HTMLElement

    const numDomElement: number = (source as any).length;

    const peekResult = peek(source as Iterable<TViewElementLike>);
    const { done, value } = peekResult.next();
    if (done) {
      this.parentViewElement.children_ = [];
      this.getChildViewElementsInternal = () => this.parentViewElement.children_;
      return;
    }

    if (value instanceof ViewElement) {
      this.parentViewElement.patchChildViewElementsWithViewElements__(
        peekResult as Iterable<ViewElement>
      );
      this.getChildViewElementsInternal = () => this.parentViewElement.children_;
      return;
    }

    if (!Array.isArray(source)) {
      // if source is not Array, peeking the first element will affect the original iterable and we need to reassign it to corrected iterable
      source = peekResult as Iterable<HTMLElement>;
    }

    if (
      shouldLazyInitialize === true ||
      (shouldLazyInitialize === undefined &&
        (numDomElement ===
          undefined /* when we do not know the length, we conservatively choose to lazily initialize */ ||
          numDomElement >= ViewElementProvider.LAZY_INITIALIZATION_THRESHOLD))
    ) {
      const viewElementCollection = new LazyCollectionProviderWithMaterializationCallback<
        ViewElement
      >(
        (function* () {
          for (const element of source) {
            yield new ViewElement(element as HTMLElement);
          }
        })()
      );
      /**
       * Instead of inserting a just-materialized view element at specified index, we append it at the end. This is because (1) materialization happen in order so next materialized element should be added as last view element child of `parentViewElement` (2) mutation of children `ViewElement` might happen during materialization so inserting at original place might create unexpected effect. For example, if a child ViewElement was removed, inserting at original place will create an empty slot.
       */
      viewElementCollection.materializationCallback = (_, child) =>
        this.parentViewElement.insertChild__(child);
      this.getChildViewElementsInternal = () => {
        if (viewElementCollection.materialized) {
          // all ViewElement has been registered under `parentViewElement`
          this.getChildViewElementsInternal = () => this.parentViewElement.children_;
          return this.parentViewElement.children_;
        } else {
          return viewElementCollection;
        }
      };
    } else {
      // create all ViewElement immediately
      this.parentViewElement.patchChildViewElementsWithDOMElements__(source);
      this.getChildViewElementsInternal = () => this.parentViewElement.children_;
    }
  }
}
