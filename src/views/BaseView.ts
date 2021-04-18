import { Collection } from '../collections/Collection';
import { composeFeatures } from '../composition/composition';
import { ChildListChangeEvent } from '../dom/CustomEvents';
import { AbstractViewFunction } from '../view-functions/AbstractViewFunction';
import { AggregateView } from '../view-functions/AggregateView';
import { SyncView as _SyncView, TViewElementLike } from '../view-functions/SyncView';
import { ViewElement } from './ViewElement';
import { TSourceType, ViewElementProvider } from './ViewElementProvider';

class SyncView extends _SyncView {
  /** @override Use custom mutation handling logic */
  protected initializeMutationHandler__() {}
}

type RenderingViewFunction = /* ScrollView<ViewElement, HTMLElement> | */ SyncView;
export type ViewTransformation = Exclude<AbstractViewFunction<ViewElement>, RenderingViewFunction>;

export class BaseView extends AggregateView<TViewElementLike> {
  viewElementProvider: ViewElementProvider;

  renderingView: RenderingViewFunction;

  constructor(
    source: TSourceType,
    target: HTMLElement,
    viewTransformations: Array<ViewTransformation> = []
  ) {
    super(viewTransformations);

    this.initializeViewElementProvider__(source, document.createElement(target.tagName));
    this.initializeRenderingView__(target);

    /**
     * When `this.shouldRegenerateView` is set to true, immediately regenerate view
     */
    this.subscribe(this, AbstractViewFunction.shouldRegenerateViewEventName, () =>
      this.view(undefined, true)
    );

    composeFeatures(this, [this.renderingView]);

    this.view(undefined, true);
  }

  protected initializeViewElementProvider__(source: TSourceType, fallbackContainer: HTMLElement) {
    this.viewElementProvider = new ViewElementProvider();
    this.viewElementProvider.consume(source, fallbackContainer);
  }

  protected initializeRenderingView__(target: HTMLElement) {
    this.renderingView = new SyncView(target);
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
   * @public
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

  enableBackPropagation() {
    this.renderingView.rootDomElement.addEventListener(
      ChildListChangeEvent.typeArg,
      (event: ChildListChangeEvent) => this.onChildListMutation_(event)
    );
  }
}
