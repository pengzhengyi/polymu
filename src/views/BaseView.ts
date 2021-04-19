/**
 * @module
 *
 * This module provides a `BaseView` which is the backbone of creating a `View`.
 */

import { Collection } from '../collections/Collection';
import { composeFeatures } from '../composition/composition';
import { ChildListChangeEvent } from '../dom/CustomEvents';
import { AbstractViewFunction } from '../view-functions/AbstractViewFunction';
import { AggregateView } from '../view-functions/AggregateView';
import { SyncView, TViewElementLike } from '../view-functions/SyncView';
import { ViewElement } from './ViewElement';
import { TSourceType, ViewElementProvider } from './ViewElementProvider';

/**
 * A union type including all view functions that can be classified as rendering a View. More specifically, these view functions will have direct influence on DOM.
 */
type RenderingViewFunction = /* ScrollView<ViewElement, HTMLElement> | */ SyncView;
/**
 * A union type including all view functions that only transform a `View`. These view functions will have no impact on DOM.
 */
export type ViewTransformation = Exclude<AbstractViewFunction<ViewElement>, RenderingViewFunction>;

/**
 * `BaseView` consists of three parts:
 *
 * + **source**: This part is responsible for providing view elements which will contribute the generation of rendering view and is implemented by a `ViewElementProvider`.
 * + **transformation**: This part is responsible for processing the view elements provided by source to filter, order, select view elements that participate in actual rendering. This part is implemented by an `AggregateView` of `ViewTransformation`.
 * + **rendering**: This part is responsible for using the view elements selected by transformation to update the DOM. This part is implemented by a `RenderingViewFunction`.
 *
 * This process can be viewed as forward propagation -- a rendering view is first produced before it is synced to the DOM. For example, when a new filter function is added to transformations, rendering view will regenerate and DOM will update accordingly.
 *
 * Oppositely, `BaseView` also provides a back propagation -- the relevant DOM region is modified and the mutations are routed back to modify the source. For example, when a new element is inserted at DOM, back propagation will create a corresponding view element at appropriate position in source and reapply forward propagation.
 *
 * Since backward propagation is not always desired, it can be enabled and disabled by `enableBackPropagation` and `disableBackPropagation`.
 */
export class BaseView extends AggregateView<TViewElementLike> {
  /**
   * `viewElementProvider` is responsible for providing the source view elements that will undergo view transformation.
   */
  viewElementProvider: ViewElementProvider;

  /**
   * A `ViewFunction` that will use selected view elements to update the corresponding DOM target.
   */
  renderingView: RenderingViewFunction;

  /**
   * A callback function, if defined, can be used to disable the enabled backward propagation. In other words, if `disableBackPropagation === undefined`, then back propagation is not currently enabled.
   */
  disableBackPropagation: () => void;

  /**
   * Creates a `BaseView` instance.
   *
   * @param source - A source that is used to initialize the `viewElementProvider` to provide view elements.
   * @param target - A DOM element that represents a region of DOM tree that is being watched. It will be the destination where rendering view will mount.
   * @param viewTransformations - A series of transformative view functions that will process the view elements from `source` to produce view elements for rendering.
   * @constructs BaseView
   */
  constructor(
    source: TSourceType,
    target: HTMLElement,
    viewTransformations: Array<ViewTransformation> = []
  ) {
    super(viewTransformations);

    this.initializeViewElementProvider__(source, document.createElement(target.tagName));
    this.initializeRenderingView__(target);

    /**
     * When `this.shouldRegenerateView` is set to true, immediately regenerate view. This is part of forward propagation.
     */
    this.subscribe(this, AbstractViewFunction.shouldRegenerateViewEventName, () =>
      this.view(undefined, true)
    );

    /**
     * This invocation of `composeFeatures` will allow exposed methods in `this.renderingView` to be invoked directly on this `BaseView` instance.
     */
    composeFeatures(this, [this.renderingView]);

    /**
     * Generate and mount the rendering view for first time.
     */
    this.view(undefined, true);
  }

  /**
   * @override
   * @param sourceView - Ignored when `useCache` is `true`. When When `useCache` is `false`, `sourceView` will both provide the view elements and used to update `this.viewElementProvider`.
   * @param useCache - When `useCache` is `true`, `sourceView` is ignored and view elements from `this.viewElementProvider` will be used. When `useCache` is `false`, `sourceView` will both provide the view elements and used to update `this.viewElementProvider`.
   * @returns
   */
  view(
    sourceView: Collection<TViewElementLike>,
    useCache: boolean = true
  ): Collection<TViewElementLike> {
    return super.view(sourceView, useCache);
  }

  /** @override */
  protected regenerateView(
    sourceView: Collection<ViewElement<HTMLElement>>,
    useCache: boolean = true
  ) {
    if (!this.shouldRegenerateView && useCache) {
      return;
    }

    if (useCache) {
      sourceView = this.viewElementProvider.childViewElements;
    } else {
      this.viewElementProvider.consume(sourceView);
    }

    // target view will be generated by piping the source view through the chain
    const transformedView = this.viewFunctions_.reduce(
      (_source, viewFunction) => viewFunction.view(_source, useCache),
      sourceView
    );

    this._targetView_ = this.renderingView.view(transformedView, useCache);

    this.shouldRegenerateView = false;
  }

  /**
   * Initialize provider for view elements.
   *
   * @param source - A construct used to initialize `this.viewElementProvider`.
   * @param fallbackContainer - A fallback DOM container which will be used to create parent `ViewElement` if such `ViewElement` is not present in `source` -- `source` is unrooted.
   */
  protected initializeViewElementProvider__(source: TSourceType, fallbackContainer: HTMLElement) {
    this.viewElementProvider = new ViewElementProvider();
    this.viewElementProvider.consume(source, fallbackContainer);
  }

  /**
   * Initialize a RenderingView which will sync view elements to DOM.
   *
   * @param target - A DOM element which reflects a region of DOM that is synced with `ViewElement` hierarchy.
   */
  protected initializeRenderingView__(target: HTMLElement) {
    this.renderingView = new SyncView(target, false);
  }

  /**
   * Handles ChildList mutation.
   *
   * For example, if a DOM child is removed from `target`, remove the ViewModel child corresponding to that DOM child from `this.viewElementProvider`.
   *
   * @param childListChangeEvent - An event containing information about the childlist mutation that triggered this event.
   */
  protected onChildListMutation_(childListChangeEvent: ChildListChangeEvent) {
    if (childListChangeEvent.target !== this.renderingView.rootDomElement) {
      // only handle mutations to direct children
      return;
    }

    let shouldRegenerateView: boolean = false;

    // handle nodes removed from DOM
    for (const removedNode of childListChangeEvent.detail.removedNodes) {
      const identifier = (removedNode as HTMLElement).dataset[ViewElement.identifierDatasetName_];
      this.viewElementProvider.parentViewElement.removeChildByIdentifier__(identifier);
      shouldRegenerateView = true;
    }

    // handle nodes inserted to DOM
    /* This map maps `HTMLElement` to the index of the child `ViewElement` containing this `HTMLElement` in `this.viewElementProvider` */
    const domElementToViewElementIndex: Map<HTMLElement, number> = new Map();
    let lastChildViewElementIndex: number = 0;
    const parentViewElement: ViewElement = this.viewElementProvider.parentViewElement;
    for (const addedNode of childListChangeEvent.detail.addedNodes) {
      if (addedNode.nodeType !== Node.ELEMENT_NODE) {
        // ignore mutations of other types of node (for example, text node)
        continue;
      }

      shouldRegenerateView = true;

      let childIndex = 1;
      /**
       * Previous DOM element of an added node is:
       *
       * + either another added node, which is already processed and we know index of
       * + an already-existing `HTMLElement`. Since there is a one-to-one relationship between `HTMLElement` in `target` and child `ViewElement` for `this.renderingView.rootViewElement` and `this.renderingView.rootViewElement.children_` is subset of `this.viewElementProvider.childViewElements`, we can find corresponding `ViewElement`'s identifier, get the corresponding child `ViewElement` in `this.viewElementProvider`, locate its index with `indexOf`.
       */
      const previousDomElement = (addedNode as HTMLElement).previousElementSibling as HTMLElement;

      if (domElementToViewElementIndex.has(previousDomElement)) {
        childIndex += domElementToViewElementIndex.get(previousDomElement);
      } else {
        const identifier = previousDomElement.dataset[ViewElement.identifierDatasetName_];
        const childViewElement = parentViewElement.getChildByIdentifier__(identifier);

        /**
         * use `indexOf` to compute the `ViewElement` index, also speed up the linear search by starting from last computed `ViewElement` index.
         */
        const childViewElementIndex = (lastChildViewElementIndex = parentViewElement.children_.indexOf(
          childViewElement,
          lastChildViewElementIndex
        ));
        domElementToViewElementIndex.set(previousDomElement, childViewElementIndex);
        childIndex += childViewElementIndex;
      }

      domElementToViewElementIndex.set(addedNode as HTMLElement, childIndex);
      parentViewElement.insertChild__(addedNode as HTMLElement, childIndex);
    }
  }

  /**
   * @override
   * @description Defines methods that should be exposed.
   */
  *getFeatures(): IterableIterator<string> | Iterable<string> {
    for (const viewFunction of this.viewFunctions_) {
      yield* viewFunction.getFeatures();
    }

    yield* this.renderingView.getFeatures();

    yield 'enableBackPropagation';
  }

  /**
   * Back propagation describes a process where DOM mutations in monitored region will be reflected into `this.viewElementProvider`. This method is used to enable such process.
   *
   * After a call to `enableBackPropagation`, `disableBackPropagation` will be defined and can be called to stop this process.
   */
  enableBackPropagation() {
    const eventHandler = (event: ChildListChangeEvent) => this.onChildListMutation_(event);

    this.renderingView.rootDomElement.addEventListener(ChildListChangeEvent.typeArg, eventHandler);

    this.disableBackPropagation = () => {
      this.renderingView.rootDomElement.removeEventListener(
        ChildListChangeEvent.typeArg,
        eventHandler
      );
      this.disableBackPropagation = undefined;
    };
  }
}
