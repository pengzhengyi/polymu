import { Collection } from '../collections/Collection';
import { IFeatureProvider } from '../composition/composition';
import { ChildListChangeEvent } from '../dom/CustomEvents';
import { TaskQueue } from '../TaskQueue';
import { isIterable, peek } from '../utils/IterableHelper';
import { PatchModeForMatch, ViewElement } from '../views/ViewElement';
import { AbstractViewFunction } from './AbstractViewFunction';

/**
 * A union type represents the types that can be treated as a `ViewElement`, which are the types that can be used to initialize the child of `ViewElement`.
 */
export type TViewElementLike = ViewElement<HTMLElement> | HTMLElement;

/**
 * A `SyncView` represents a region of DOM tree that is actively tracked in programmatic level. More specifically, when the DOM tree in this region changes, these DOM mutations will be observed by {@link https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver MutationObserver} and virtual DOM tree in Javascript layer constructed using `ViewElement` will also update appropriately.
 *
 * In other words, `SyncView` provides a virtual DOM tree that will reflect changes in corresponding actual DOM tree region and whose changes will also be reflected in the actual DOM tree.
 *
 * `SyncView` adopts a parent-child two-level virtual tree model in that it observes only DOM mutations happen to DOM elements underlying direct `ViewElement` children of `rootViewElement`.
 *
 * For example, suppose the `rootViewElement`'s DOM element is an ordered list `<ol>` and its children `ViewElement`'s DOM elements are list item `<li>`. If a user adds an additional list item by calling `appendChild` on the ordered list, then the `rootViewElement` will automatically have a new `ViewElement` child for that new list item. On the other hand, if a user append a `ViewElement` as a child of `rootViewElement`, then the DOM tree will also have a corresponding list item appended.
 *
 * Together with other view functions, `SyncView` can create a lot of wonderful automatically-updating views. For example, pairing `SyncView` and `SortedView` where the sorted view is used to update the DOM and virtual DOM updated because of DOM mutations is feed back to `SortedView` as input can create such a product:
 *
 *    @example A list view of employee record is currently sorted by their salary. A HR inserts a new employee and this employee is immediately placed into its correct place.
 */
export class SyncView extends AbstractViewFunction<TViewElementLike> implements IFeatureProvider {
  /** methods that should be exposed since they define the API for `SyncView` */
  protected features: Array<string> = [];

  /**
   * ! @override A queue containing tasks executed before updating DOM tree. This queue is different from normal `beforeViewUpdateTaskQueue` that is executed when target view is about to be updated.
   */
  beforeViewUpdateTaskQueue: TaskQueue = new TaskQueue();
  /**
   * ! @override A queue containing tasks executed after updating DOM tree. This queue is different from normal `afterViewUpdateTaskQueue` that is executed when target view is updated.
   */
  afterViewUpdateTaskQueue: TaskQueue = new TaskQueue();

  /**
   * The root `ViewElement` whose DOM children will be dynamically synced with `ViewElement` children.
   */
  protected rootViewElement_: ViewElement;

  /**
   * @returns The root `ViewElement` whose DOM children will be dynamically synced with `ViewElement` children.
   */
  get rootViewElement(): ViewElement {
    return this.rootViewElement_;
  }

  /**
   * @returns The underlying DOM element for the root `ViewElement`. This is also the observe target for `MutationObserver`.
   */
  get rootDomElement(): HTMLElement {
    return this.rootViewElement_.element_;
  }

  /**
   * @returns An array of children `ViewElement` of `this.rootViewElement_`.
   */
  get childViewElements(): Array<ViewElement> {
    return this.rootViewElement_.children_;
  }

  /**
   * @returns An array of DOM elements that are underlying DOM elements of children `ViewElement` of `this.rootViewElement_`.
   */
  get childDomElements(): Array<HTMLElement> {
    return this.rootViewElement_.operateOnRange__((viewElement) => viewElement.element_);
  }

  /**
   * Create a `SyncView` instance.
   *
   * @param rootDomElement - The underlying root DOM element.
   * @constructs SyncView
   */
  constructor(rootDomElement: HTMLElement) {
    super();

    /**
     * Initialize a `ViewElement` from provided DOM element, since we only care about direct child mutation for provided DOM element, we only provide a factory method for `viewElementFactories`
     */
    this.rootViewElement_ = new ViewElement(rootDomElement, [
      (element) => new ViewElement(element),
    ]);

    this.rootViewElement_.initializeMutationReporter();
    this.initializeMutationHandler__();

    this.initializeTaskQueue_();

    this.observe();
  }

  /**
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
   * @override
   */
  protected regenerateView(sourceView: Collection<TViewElementLike>, useCache: boolean) {
    if (useCache && sourceView === this.lastSourceView && !this.shouldRegenerateView) {
      // source has not change and sorting functions have not changed => we can reuse current view
      return;
    }

    this.sync(sourceView);

    this._targetView = this.childViewElements;

    super.regenerateView(sourceView, useCache);
  }

  /**
   * Initialize the task queues executed before and after DOM changes.
   */
  protected initializeTaskQueue_() {
    this.beforeViewUpdateTaskQueue.tasks.push({
      work: () => this.unobserve(),
      isRecurring: true,
    });
    this.afterViewUpdateTaskQueue.tasks.push({
      work: () => this.observe(),
      isRecurring: true,
    });
  }

  /**
   * Ask `this.rootDomElement` to monitor DOM mutations. Only childlist mutations on direct children of `target` will be handled.
   */
  protected observe() {
    // we only need to track childlist change on direct children of `this.rootDomElement`
    this.rootViewElement_.observe__(this.rootDomElement, false, undefined, false, true, false);
  }

  /**
   * Stop monitoring DOM mutations.
   */
  protected unobserve() {
    this.rootViewElement_.unobserve__(this.rootDomElement);
  }

  /**
   * Add `EventListener` for interested mutations to observe. Since events are dispatched at `this.rootDomElement`, these registered event handlers could be considered as triggered at TARGET phase.
   *
   * Currently, this method only register a handler for children mutation of `this.rootDomElement`, where `this.childViewElements` will be updated according to the childList mutations.
   */
  protected initializeMutationHandler__() {
    this.rootDomElement.addEventListener(
      ChildListChangeEvent.typeArg,
      (event: ChildListChangeEvent) => this.onChildListMutation_(event)
    );
  }
  /**
   * Handles ChildList mutation.
   *
   * For example, if a DOM child is removed from `target`, remove the ViewModel child corresponding to that DOM child from `this.sourceViewModel`.
   */
  protected onChildListMutation_(childListChangeEvent: ChildListChangeEvent) {
    if (childListChangeEvent.target !== this.rootDomElement) {
      // only handle mutations to direct children
      return;
    }

    for (const removedNode of childListChangeEvent.detail.removedNodes) {
      const identifier = (removedNode as HTMLElement).dataset[ViewElement.identifierDatasetName_];
      this.rootViewElement_.removeChildByIdentifier__(identifier);
    }

    const addedNodeToChildIndex: Map<Node, number> = new Map();
    for (const addedNode of childListChangeEvent.detail.addedNodes) {
      if (addedNode.nodeType !== Node.ELEMENT_NODE) {
        // ignore mutations of other types of node (for example, text node)
        continue;
      }

      let childIndex = 0;
      let child = addedNode;
      // the following while loop gets the node's index in its parent node's childlist
      while ((child = (child as HTMLElement).previousElementSibling)) {
        childIndex++;
        if (addedNodeToChildIndex.has(child)) {
          childIndex += addedNodeToChildIndex.get(child);
          break;
        }
      }
      addedNodeToChildIndex.set(addedNode, childIndex);
      this.rootViewElement_.insertChild__(addedNode as HTMLElement, childIndex);
    }
  }

  /**
   * Perform an action that will modify the DOM. Perform necessary setup and teardown tasks before and after the action. For example, stop observing DOM tree during DOM mutations to avoid infinite recursion.
   *
   * @param action - An action that will modify the DOM tree.
   * @param beforeViewUpdateTaskQueueArgs - Arguments passed to `beforeViewUpdateTaskQueue` when it executes setup work.
   * @param afterViewUpdateTaskQueueArgs - Arguments passed to `afterViewUpdateTaskQueue` when it executes teardown work.
   */
  modifyDom(
    action: () => void,
    beforeViewUpdateTaskQueueArgs: any[] = [],
    afterViewUpdateTaskQueueArgs: any[] = []
  ) {
    this.beforeViewUpdateTaskQueue.work(this, ...beforeViewUpdateTaskQueueArgs);
    action();
    this.afterViewUpdateTaskQueue.work(this, ...afterViewUpdateTaskQueueArgs);
  }

  /**
   * Update `this.rootViewElement_` and its children `ViewElement` according to provided source.
   *
   * + if `source` is iterable, then children `ViewElement` of `this.rootViewElement_` will be updated accordingly
   * + if `source` is not iterable (should be a single element in this case), then both `this.rootViewElement_` and its children `ViewElement` will be updated accordingly
   *
   * + if `source` itself or elements of `source` are `HTMLElement`, then corresponding underlying element of `ViewElement` will be updated
   * + if `source` itself or elements of `source` are `ViewElement`, then corresponding `ViewElement` will be replaced
   *
   * @param source - Element or elements used to update current `this.rootViewElement_`.
   */
  sync(source: TViewElementLike | Iterable<TViewElementLike>) {
    this.modifyDom(() => {
      if (source instanceof HTMLElement) {
        this.rootViewElement_.patchWithDOM__(source, PatchModeForMatch.CreateAlias, false, false);
      } else if (source instanceof ViewElement) {
        // since `ViewElement` is also iterable, it should come before the check for `isIterable`
        this.rootViewElement_.patchWithViewElement__(
          source,
          PatchModeForMatch.CreateAlias,
          false,
          false
        );
      } else if (isIterable(source)) {
        const peekResult = peek(source as Iterable<TViewElementLike>);
        const { done, value } = peekResult.next();

        if (!done) {
          // iterable is not empty
          if (value instanceof HTMLElement) {
            // first element is `HTMLElement`
            this.rootViewElement_.patchChildViewElementsWithDOMElements__(
              peekResult as Iterable<HTMLElement>,
              PatchModeForMatch.CreateAlias,
              false,
              false
            );
          } else {
            // first element is `ViewElement`
            this.rootViewElement_.patchChildViewElementsWithViewElements__(
              peekResult as Iterable<ViewElement>,
              PatchModeForMatch.CreateAlias,
              false,
              false
            );
          }
        }
      }
    });
  }
}
