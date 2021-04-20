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
import { ScrollView as _ScrollView } from '../view-functions/ScrollView';
import { SyncView, TViewElementLike } from '../view-functions/SyncView';
import { ViewElement } from '../view-element/ViewElement';
import { TSourceType, ViewElementProvider } from './ViewElementProvider';

/**
 * A customized ScrollView which provides `rootDomElement` and type arguments.
 */
class ScrollView extends _ScrollView<TViewElementLike, HTMLElement> {
  /**
   * Exposes `this._target`.
   * @returns The target DOM element where rendering view will be mounted.
   */
  get rootDomElement(): HTMLElement {
    return this._target;
  }

  /**
   * @override
   * Create an instance of `ScrollView`.
   * @param target - The target DOM element where rendering view will be mounted.
   * @constructs ScrollView
   */
  constructor(target: HTMLElement) {
    super({
      convert: (viewElementLike: TViewElementLike) => {
        if (viewElementLike instanceof ViewElement) {
          return viewElementLike.element_;
        } else {
          return viewElementLike;
        }
      },
      target,
    });
  }
}

/**
 * A union type including all view functions that can be classified as rendering a View. More specifically, these view functions will have direct influence on DOM.
 */
type RenderingViewFunction = ScrollView | SyncView;
/**
 * Denotes the type of a callback that constructs a `RenderingViewFunction` from an `HTMLElement`.
 */
type RenderingViewFunctionProvider = (element: HTMLElement) => RenderingViewFunction;
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
   * Provide a `RenderingViewFunction` by creating a `SyncView` instance.
   *
   * @param element - An element where rendering view is mounted.
   * @returns A rendering view implementation which is responsible for syncing rendering view elements to the DOM.
   */
  static readonly SYNC_VIEW_FACTORY: RenderingViewFunctionProvider = (element: HTMLElement) =>
    new SyncView(element, false);
  /**
   * Provide a `RenderingViewFunction` by creating a `ScrollView` instance.
   *
   * @param element - An element where rendering view is mounted.
   * @returns A rendering view implementation which is responsible for syncing rendering view elements to the DOM.
   */
  static readonly SCROLL_VIEW_FACTORY: RenderingViewFunctionProvider = (element: HTMLElement) =>
    new ScrollView(element);

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
   * @param renderingViewFunctionProvider - A callback to create a `RenderingViewFunction` from a DOM element. Can be either `BaseView.SCROLL_VIEW_FACTORY` or `BaseView.SYNC_VIEW_FACTORY`. Default to `undefined`, which will choose the former if source contains a lot of `ViewElement`.
   * @constructs BaseView
   */
  constructor(
    source: TSourceType,
    target: HTMLElement,
    viewTransformations: Array<ViewTransformation> = [],
    renderingViewFunctionProvider: RenderingViewFunctionProvider = undefined
  ) {
    super(viewTransformations);

    this.initializeViewElementProvider__(source, document.createElement(target.tagName));
    this.initializeRenderingView__(target, renderingViewFunctionProvider);

    /**
     * This invocation of `composeFeatures` will allow exposed methods in `this.renderingView` to be invoked directly on this `BaseView` instance.
     */
    composeFeatures(this, [this.renderingView]);

    /**
     * Generate and mount the rendering view for first time.
     */
    this.view(undefined, true);

    /**
     * Trigger view regeneration when needed.
     */
    this.initializeAutomaticViewRegeneration__();
  }

  /**
   * @override
   * @param sourceView - Ignored when `useCache` is `true`. When When `useCache` is `false`, `sourceView` will both provide the view elements and used to update `this.viewElementProvider`.
   * @param useCache - When `useCache` is `true`, `sourceView` is ignored and view elements from `this.viewElementProvider` will be used. When `useCache` is `false`, `sourceView` will both provide the view elements and used to update `this.viewElementProvider`.
   * @returns
   */
  view(sourceView: Collection<TViewElementLike>, useCache = true): Collection<TViewElementLike> {
    return super.view(sourceView, useCache);
  }

  /** @override */
  protected regenerateView(sourceView: Collection<ViewElement<HTMLElement>>, useCache = true) {
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
   * When no explicit `RenderingViewFunctionProvider` is chosen, pick an appropriate one.
   *
   * @returns A `RenderingViewFunctionProvider` used to generate `this.renderingView`.
   */
  protected provideFallbackViewFunctionProvider__(): RenderingViewFunctionProvider {
    return this.viewElementProvider.hasLargeNumberOfChildViewElement
      ? BaseView.SCROLL_VIEW_FACTORY
      : BaseView.SYNC_VIEW_FACTORY;
  }

  /**
   * Initialize a RenderingView which will sync view elements to DOM.
   *
   * @param target - A DOM element which reflects a region of DOM that is synced with `ViewElement` hierarchy.
   * @param renderingViewFunctionProvider - A callback to create a `RenderingViewFunction` from a DOM element.
   */
  protected initializeRenderingView__(
    target: HTMLElement,
    renderingViewFunctionProvider: RenderingViewFunctionProvider
  ) {
    if (renderingViewFunctionProvider === undefined) {
      renderingViewFunctionProvider = this.provideFallbackViewFunctionProvider__();
    }

    this.renderingView = renderingViewFunctionProvider(target);
  }

  /**
   * Initialize automatic view regeneration mechanism -- when an `shouldRegenerateViewEventName` event notification is sent to current instance, immediately handle it by regenerating view. In other words, such event is dispatched to current instance when a view regeneration is needed.
   */
  protected initializeAutomaticViewRegeneration__() {
    /**
     * When `this.shouldRegenerateView` is set to true, immediately regenerate view. This is part of forward propagation.
     */
    this.subscribe(this, AbstractViewFunction.shouldRegenerateViewEventName, () =>
      this.view(undefined, true)
    );
  }

  /**
   * Handles ChildList mutation.
   *
   * For example, if a DOM child is removed from `target`, remove the ViewModel child corresponding to that DOM child from `this.viewElementProvider`.
   *
   * @param childListChangeEvent - An event containing information about the childlist mutation that triggered this event.
   */
  protected onChildListMutation__(childListChangeEvent: ChildListChangeEvent) {
    if (childListChangeEvent.target !== this.renderingView.rootDomElement) {
      // only handle mutations to direct children
      return;
    }

    const shouldRegenerateView: boolean =
      this.tryRemoveViewElementFromNodeList__(childListChangeEvent.detail.removedNodes) ||
      this.tryInsertViewElementFromNodeList(childListChangeEvent.detail.addedNodes);

    if (shouldRegenerateView) {
      this.shouldRegenerateView = shouldRegenerateView;
    }
  }

  /**
   * Insert a new `ViewElement` as a child of `this.viewElementProvider`.
   *
   * @param addedNodeList - A NodeList containing nodes that are added from DOM in the triggering mutation.
   * @returns True if a child `ViewElement` was added into `this.viewElementProvider`. False if none was added.
   */
  protected tryInsertViewElementFromNodeList(addedNodeList: NodeList): boolean {
    // handle nodes inserted to DOM
    let hasInsertedAny = false;

    /* This map maps `HTMLElement` to the index of the child `ViewElement` containing this `HTMLElement` in `this.viewElementProvider` */
    const domElementToViewElementIndex: Map<HTMLElement, number> = new Map();
    let lastChildViewElementIndex = 0;
    const parentViewElement: ViewElement = this.viewElementProvider.parentViewElement;
    for (const addedNode of addedNodeList) {
      if (addedNode.nodeType !== Node.ELEMENT_NODE) {
        // ignore mutations of other types of node (for example, text node)
        continue;
      }

      hasInsertedAny = true;

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

    return hasInsertedAny;
  }

  /**
   * Remove a corresponding child `ViewElement` in `this.viewElementProvider` if provided node list contains its underlying element.
   *
   * @param removedNodeList - A NodeList containing nodes that are deleted from DOM in the triggering mutation.
   * @returns True if a child `ViewElement` in `this.viewElementProvider` was removed because its underlying element is included in the nodelist. False if none of children `ViewElement` was removed because of this.
   */
  protected tryRemoveViewElementFromNodeList__(removedNodeList: NodeList) {
    let hasRemovedAny = false;

    // handle nodes removed from DOM
    for (const node of removedNodeList) {
      const identifier = (node as HTMLElement).dataset[ViewElement.identifierDatasetName_];
      const hasOneRemoved =
        this.viewElementProvider.parentViewElement.removeChildByIdentifier__(identifier) !== null;
      hasRemovedAny = hasRemovedAny || hasOneRemoved;
    }

    return hasRemovedAny;
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
    const eventHandler = (event: ChildListChangeEvent) => this.onChildListMutation__(event);

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
