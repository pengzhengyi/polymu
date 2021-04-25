/**
 * @module
 *
 * This module provides interface `IViewElementProvider` and some utility classes implementing this interface.
 */

import { Collection, LazyCollectionProvider } from '../collections/Collection';
import { peek } from '../utils/IterableHelper';
import { TViewElementLike } from '../view-functions/renderer/SyncRenderer';
import { ViewElement } from '../view-element/ViewElement';

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
class LazyCollectionProviderWithMaterializationCallback<
  TElement
> extends LazyCollectionProvider<TElement> {
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
  | HTMLElement
  | ViewElement
  | Iterable<HTMLElement>
  | HTMLCollection
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
  static LAZY_INITIALIZATION_THRESHOLD = 1000;

  /** @override */
  parentViewElement: ViewElement;

  /**
   * Whether this `ViewElementProvider` provides a large number of children `ViewElement`.
   *
   * ! When the number of child `ViewElement` cannot be determined, it will be assumed to be large.
   */
  hasLargeNumberOfChildViewElement: boolean;

  /**
   * Internal implementation to provide children `ViewElement`.
   */
  protected getChildViewElementsImplementation: () => Collection<ViewElement>;

  /** @override */
  get childViewElements(): Collection<ViewElement> {
    return this.getChildViewElementsImplementation();
  }

  /**
   * Consume a `ViewElement` to update current `ViewElementProvider`.
   *
   * @param viewElement - A `ViewElement` which is used to substitute current `parentViewElement` and provide children `ViewElement`.
   */
  protected consumeViewElement(viewElement: ViewElement): void {
    this.parentViewElement = viewElement;
    this.getChildViewElementsImplementation = () => this.parentViewElement.children_;
  }

  /**
   * Consume a `HTMLTemplateElement` ({@link https://developer.mozilla.org/en-US/docs/Web/HTML/Element/template `<template>`}) to update current `ViewElementProvider`.
   *
   * @param templateElement - A template element whose content should be used to update current `ViewElementProvider`.
   * @param fallbackContainer - {@alias this.consume#fallbackContainer}
   * @param shouldLazyInitialize - {@alias this.consume#shouldLazyInitialize}
   */
  protected consumeHTMLTemplateElement(
    templateElement: HTMLTemplateElement,
    fallbackContainer: HTMLElement,
    shouldLazyInitialize: boolean
  ): void {
    this.consumeDocumentFragment(templateElement.content, fallbackContainer, shouldLazyInitialize);
  }

  /**
   * Consume a {@link https://developer.mozilla.org/en-US/docs/Web/API/DocumentFragment `DocumentFragment`} to update current `ViewElementProvider`.
   *
   * @param documentFragment - A document fragment whose children should be used to update current `ViewElementProvider`.
   * @param fallbackContainer - {@alias this.consume#fallbackContainer}
   * @param shouldLazyInitialize - {@alias this.consume#shouldLazyInitialize}
   */
  protected consumeDocumentFragment(
    documentFragment: DocumentFragment,
    fallbackContainer: HTMLElement,
    shouldLazyInitialize: boolean
  ): void {
    const children: HTMLCollection = documentFragment.children;

    if (children.length === 1) {
      this.consumeHTMLElement(children[0] as HTMLElement, fallbackContainer, shouldLazyInitialize);
    } else {
      this.consumeIterable(children, fallbackContainer, shouldLazyInitialize);
    }
  }

  /**
   * Consume a `HTMLElement` to update current `ViewElementProvider`.
   *
   * @param htmlElement - A `HTMLElement` which itself will become the new parent `ViewElement` and whose children will become the new children `ViewElement`.
   * @param fallbackContainer - {@alias this.consume#fallbackContainer} This parameter is ignored as `htmlElement` itself will become the container.
   * @param shouldLazyInitialize - {@alias this.consume#shouldLazyInitialize}
   */
  protected consumeHTMLElement(
    htmlElement: HTMLElement,
    fallbackContainer: HTMLElement,
    shouldLazyInitialize: boolean
  ): void {
    this.consumeIterable(htmlElement.children, htmlElement, shouldLazyInitialize);
  }

  /**
   * Create `this.parentViewElement` using provided `HTMLElement`.
   *
   * @param container - A `HTMLElement` which will be used to create `this.parentViewElement`, which will contain all children `ViewElement`.
   * @throws {ReferenceError} When `this.parentViewElement` will be uninitialized.
   */
  protected createParentViewElement(container: HTMLElement): void {
    if (container) {
      this.parentViewElement = new ViewElement(container, [(element) => new ViewElement(element)]);
    } else if (this.parentViewElement === undefined) {
      // throw an error if `parentViewElement` will left uninitialized
      throw new ReferenceError('fallbackContainer not provided when needed');
    }
  }

  /**
   * Consume a `HTMLElement` to update current `ViewElementProvider`.
   *
   * @param htmlElement - A `HTMLElement` which itself will become the new parent `ViewElement` and whose children will become the new children `ViewElement`.
   * @param container - {@alias this.consume#fallbackContainer} A `HTMLElement` which will be used to initialize `this.parentViewElement`.
   * @param shouldLazyInitialize - {@alias this.consume#shouldLazyInitialize}
   */
  protected consumeIterable(
    iterable: Iterable<HTMLElement> | HTMLCollection | Iterable<ViewElement>,
    container: HTMLElement,
    shouldLazyInitialize: boolean
  ): void {
    this.createParentViewElement(container);

    // source is either an iterable of ViewElement or HTMLElement
    this.setupChildViewElementsFromIterableOfUnknownType(iterable, shouldLazyInitialize);
  }

  /**
   * Determine whether children ViewElement of `this.parentViewElement` should be initialized lazily.
   *
   * @param iterableLength - The length of iterable. Can be undefined if iterable does not have a defined `length`.
   * @param initialDecision - An initial decision for whether lazy initialization is needed. If `initialDecision` is either `true` of `false`, this will become the final decision. If it is `undefined`, then the decision will be made based on the `iterableLength`.
   * @returns Whether Children ViewElement should be initialized lazily.
   */
  protected shouldLazyInitializeChildViewElements(
    initialDecision: boolean,
    iterableLength: number
  ): boolean {
    let shouldLazyInitialize = initialDecision;
    if (initialDecision === undefined) {
      if (iterableLength === undefined) {
        // when we do not know the length, we conservatively choose to lazily initialize
        shouldLazyInitialize = true;
      } else if (iterableLength >= ViewElementProvider.LAZY_INITIALIZATION_THRESHOLD) {
        shouldLazyInitialize = true;
      } else {
        shouldLazyInitialize = false;
      }
    }

    if (shouldLazyInitialize) {
      this.hasLargeNumberOfChildViewElement = true;
    }

    return shouldLazyInitialize;
  }

  /**
   * Setup the children `ViewElement` of `this.parentViewElement` from an iterable of element whose type is either `HTMLElement` or `ViewElement`.
   *
   * @param iterable - An iterable of either `HTMLElement` or `ViewElement`. This iterable will be used to properly setup `this.childViewElements`.
   * @param shouldLazyInitialize - {@alias this.consume#shouldLazyInitialize}
   */
  protected setupChildViewElementsFromIterableOfUnknownType(
    iterable: Iterable<HTMLElement> | HTMLCollection | Iterable<ViewElement>,
    shouldLazyInitialize: boolean
  ): void {
    // iterable is either an iterable of ViewElement or HTMLElement
    const iterableLength: number = (iterable as any).length;
    // use `iterableLength` to determine whether lazy initialization is preferred
    shouldLazyInitialize = this.shouldLazyInitializeChildViewElements(
      shouldLazyInitialize,
      iterableLength
    );

    const peekResult = peek(iterable as Iterable<TViewElementLike>);
    const { done, value } = peekResult.next();
    if (done) {
      this.setupChildViewElementsFromEmptyIterable();
      return;
    }

    if (value instanceof ViewElement) {
      this.setupChildViewElementsFromIterableOfViewElement(
        peekResult as Iterable<ViewElement>,
        shouldLazyInitialize
      );
      return;
    }

    if (!Array.isArray(iterable)) {
      // if source is not Array, peeking the first element will affect the original iterable and we need to reassign it to corrected iterable
      iterable = peekResult as Iterable<HTMLElement>;
    }

    this.setupChildViewElementsFromIterableOfHTMLElement(iterable, shouldLazyInitialize);
  }

  /**
   * Setup the children `ViewElement` of `this.parentViewElement` from an empty iterable.
   */
  protected setupChildViewElementsFromEmptyIterable(): void {
    this.parentViewElement.children_ = [];
    this.getChildViewElementsImplementation = () => this.parentViewElement.children_;
  }

  /**
   * Setup the children `ViewElement` of `this.parentViewElement` from an iterable of `ViewElement`.
   *
   * @param iterable - An iterable of `ViewElement` used to properly setup `this.childViewElements`.
   * @param shouldLazyInitialize - Whether children `ViewElement` of `this.parentViewElement` should be lazily initialized. This value is either `true` or `false`.
   */
  protected setupChildViewElementsFromIterableOfViewElement(
    iterable: Iterable<ViewElement>,
    shouldLazyInitialize: boolean
  ): void {
    // TODO: utilize `shouldLazyInitialize`
    this.parentViewElement.patchChildViewElementsWithViewElements__(iterable);
    this.getChildViewElementsImplementation = () => this.parentViewElement.children_;
  }

  /**
   * Setup the children `ViewElement` of `this.parentViewElement` from an iterable of `HTMLElement`.
   *
   * @param iterable - An iterable of `HTMLElement` used to properly setup `this.childViewElements`.
   * @param shouldLazyInitialize - Whether children `ViewElement` of `this.parentViewElement` should be lazily initialized. This value is either `true` or `false`.
   */
  protected setupChildViewElementsFromIterableOfHTMLElement(
    iterable: Iterable<HTMLElement>,
    shouldLazyInitialize: boolean
  ): void {
    if (shouldLazyInitialize) {
      // clear previous children `ViewElement`
      this.parentViewElement.children_ = [];
      const viewElementCollection = new LazyCollectionProviderWithMaterializationCallback<ViewElement>(
        (function* () {
          for (const element of iterable) {
            yield new ViewElement(element);
          }
        })()
      );
      /**
       * Instead of inserting a just-materialized view element at specified index, we append it at the end. This is because (1) materialization happen in order so next materialized element should be added as last view element child of `parentViewElement` (2) mutation of children `ViewElement` might happen during materialization so inserting at original place might create unexpected effect. For example, if a child ViewElement was removed, inserting at original place will create an empty slot.
       */
      viewElementCollection.materializationCallback = (_, child) =>
        this.parentViewElement.insertChild__(child);
      this.getChildViewElementsImplementation = () => {
        if (viewElementCollection.materialized) {
          // all ViewElement has been registered under `parentViewElement`
          this.getChildViewElementsImplementation = () => this.parentViewElement.children_;
          return this.parentViewElement.children_;
        } else {
          return viewElementCollection;
        }
      };
    } else {
      // create all ViewElement immediately
      this.parentViewElement.patchChildViewElementsWithDOMElements__(iterable);
      this.getChildViewElementsImplementation = () => this.parentViewElement.children_;
    }
  }

  /**
   * Consume construct so that current `ViewElementProvider` is able to provide corresponding `ViewElement` construct.
   *
   * @param source - A construct provides element(s) to bootstrap corresponding `ViewElement` hierarchy.
   * @param {HTMLElement} [fallbackContainer] - An DOM element which will be used to (re)create parent `ViewElement` if `source` is "unrooted". An error will be raised if this argument is not provided when `source` is "unrooted" and parent `ViewElement` has not been initialized before.
   * @param {boolean} [shouldLazyInitialize = undefined] - Whether children `ViewElement` will be lazily registered to the parent `ViewElement`. Default to `undefined`, which means that lazy initialization is enabled when the number of child DOM elements exceeds the threshold.
   */
  consume(
    source: TSourceType,
    fallbackContainer?: HTMLElement,
    shouldLazyInitialize: boolean = undefined
  ): void {
    // override this flag when there is actually a large number of children ViewElement
    this.hasLargeNumberOfChildViewElement = false;

    if (source instanceof ViewElement) {
      this.consumeViewElement(source);
    } else if (source instanceof HTMLTemplateElement) {
      this.consumeHTMLTemplateElement(source, fallbackContainer, shouldLazyInitialize);
    } else if (source instanceof DocumentFragment) {
      this.consumeDocumentFragment(source, fallbackContainer, shouldLazyInitialize);
    } else if (source instanceof HTMLElement) {
      this.consumeHTMLElement(source, undefined, shouldLazyInitialize);
    } else {
      this.consumeIterable(source, fallbackContainer, shouldLazyInitialize);
    }
  }
}
