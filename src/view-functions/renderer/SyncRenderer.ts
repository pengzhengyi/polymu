/**
 * @module
 *
 * This module provides an `SyncView` which represents a view transformation that renders view elements to the DOM and watch for the corresponding DOM region for unmanaged mutations (mutations not initiated from `SyncView`) to update view elements.
 */

import { Collection } from '../../collections/Collection';
import { IFeatureProvider } from '../../composition/composition';
import { ChildListChangeEvent } from '../../dom/CustomEvents';
import { TaskQueue } from '../../collections/TaskQueue';
import { isIterable, peek } from '../../utils/IterableHelper';
import { PatchModeForMatch, ViewElement } from '../../view-element/ViewElement';
import { ViewElementChildListMutationReporter } from '../../views/ViewElementChildListMutationReporter';
import { AbstractViewFunction } from '../AbstractViewFunction';

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
export class SyncRenderer
  extends AbstractViewFunction<TViewElementLike>
  implements IFeatureProvider {
  /**
   * @implements {IFeatureProvider} Methods that should be exposed since they define the API for `SyncView`
   */
  protected features: Array<string> = ['sync'];

  /**
   * ! @override A queue containing tasks executed before updating DOM tree. This queue is different from normal `beforeViewUpdateTaskQueue` that is executed when target view is about to be updated.
   */
  beforeViewUpdateTaskQueue: TaskQueue = new TaskQueue();
  /**
   * ! @override A queue containing tasks executed after updating DOM tree. This queue is different from normal `afterViewUpdateTaskQueue` that is executed when target view is updated.
   */
  afterViewUpdateTaskQueue: TaskQueue = new TaskQueue();

  /**
   * An observer that monitors child list mutations happening to the underlying DOM element of `this.rootViewElement`.
   */
  protected rootViewElementChildListMutationReporter_: ViewElementChildListMutationReporter;

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
   * @param rootElement - The underlying root element. Can either be a `ViewElement` or `HTMLElement`.
   * @param {boolean} [shouldInitializeMutationHandler = true] - If true, DOM mutation in relevant region should be handled by default mutation handler which will update the children ViewElement accordingly. If false, relevant mutation will be reported as event but no event listener will be registered by this instance. Default to true.
   * @constructs SyncView
   */
  constructor(rootElement: TViewElementLike, shouldInitializeMutationHandler = true) {
    super();

    this.initializeRootViewElement__(rootElement);

    if (shouldInitializeMutationHandler) {
      this.initializeMutationHandler__();
    }

    this.rootViewElementChildListMutationReporter_ = new ViewElementChildListMutationReporter(
      this.rootViewElement_
    );

    this.initializeTaskQueue__();

    this.rootViewElementChildListMutationReporter_.observe();
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
  protected regenerateView(sourceView: Collection<TViewElementLike>, useCache: boolean): void {
    if (useCache && sourceView === this.lastSourceView) {
      // source has not change and sorting functions have not changed => we can reuse current view
      return;
    }

    this.sync(sourceView);

    this._targetView = this.childViewElements;

    super.regenerateView(sourceView, useCache);
  }

  /**
   * Initialize `this.rootViewElement_`. This `ViewElement` will be the parent for children `ViewElement`.
   *
   * @param rootElement - The underlying root element. Can either be a `ViewElement` or `HTMLElement`.
   */
  protected initializeRootViewElement__(rootElement: TViewElementLike): void {
    if (rootElement instanceof HTMLElement) {
      /**
       * Initialize a `ViewElement` from provided DOM element, since we only care about direct child mutation for provided DOM element, we only provide a factory method for `viewElementFactories`
       */
      this.rootViewElement_ = new ViewElement(rootElement, [(element) => new ViewElement(element)]);
    } else {
      this.rootViewElement_ = rootElement;
    }
  }

  /**
   * Initialize the task queues executed before and after DOM changes.
   */
  protected initializeTaskQueue__(): void {
    this.beforeViewUpdateTaskQueue.tasks.push({
      work: () => this.rootViewElementChildListMutationReporter_.unobserve(),
      isRecurring: true,
    });
    this.afterViewUpdateTaskQueue.tasks.push({
      work: () => this.rootViewElementChildListMutationReporter_.observe(),
      isRecurring: true,
    });
  }

  /**
   * Add `EventListener` for interested mutations to observe. Since events are dispatched at `this.rootDomElement`, these registered event handlers could be considered as triggered at TARGET phase.
   *
   * Currently, this method only register a handler for children mutation of `this.rootDomElement`, where `this.childViewElements` will be updated according to the childList mutations.
   */
  protected initializeMutationHandler__(): void {
    this.rootDomElement.addEventListener(
      ChildListChangeEvent.typeArg,
      (event: ChildListChangeEvent) => this.onChildListMutation__(event)
    );
  }
  /**
   * Handles ChildList mutation.
   *
   * For example, if a DOM child is removed from `target`, remove the ViewModel child corresponding to that DOM child from `this.sourceViewModel`.
   *
   * @param childListChangeEvent - An event containing information about the childlist mutation that triggered this event.
   */
  protected onChildListMutation__(childListChangeEvent: ChildListChangeEvent): void {
    if (childListChangeEvent.target !== this.rootDomElement) {
      // only handle mutations to direct children
      return;
    }

    for (const removedNode of childListChangeEvent.detail.removedNodes) {
      const identifier = (removedNode as HTMLElement).dataset[ViewElement.identifierDatasetName_];
      this.rootViewElement_.removeChildByIdentifier__(identifier);
    }

    const addedNodeToChildIndex = new Map<Node, number>();
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
  modifyDomInternal__(
    action: () => void,
    beforeViewUpdateTaskQueueArgs: any[] = [],
    afterViewUpdateTaskQueueArgs: any[] = []
  ): void {
    this.beforeViewUpdateTaskQueue.work(this, ...beforeViewUpdateTaskQueueArgs);
    action();
    this.afterViewUpdateTaskQueue.work(this, ...afterViewUpdateTaskQueueArgs);
  }

  /**
   * Perform necessary cleanup tasks.
   */
  dispose(): void {
    this.rootViewElementChildListMutationReporter_.dispose();
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
  sync(source: TViewElementLike | Iterable<TViewElementLike>): void {
    /**
     * + `PatchModeForMatch.ModifyProperties` is too expensive
     * + `PatchModeForMatch.CreateAlias` might alias two `ViewElement` during `replaceWith` and cause unintended altogether deletion of underlying element. @example suppose there are two `ViewElement` where the first `ViewElement`'s underlying element has a id "1" while the second "2". When `sync` is called with only the later ViewElement, if with `PatchModeForMatch.CreateAlias`, then the in-place-patch algorithm will change first `ViewElement`'s underlying element to be the one with id "2". Therefore, during deletion of second ViewElement and detaching of its underlying element, both ViewElement will have their underlying DOM element removed.
     */
    const mode = PatchModeForMatch.CloneNode;

    this.modifyDomInternal__(() => {
      if (source instanceof HTMLElement) {
        // `PatchModeForMatch.CreateAlias` is okay here since `patchWithDOMElement__` will not need to manipulate children DOM elements
        this.rootViewElement_.patchWithDOMElement__(
          source,
          PatchModeForMatch.CreateAlias,
          false,
          false
        );
      } else if (source instanceof ViewElement) {
        // since `ViewElement` is also iterable, it should come before the check for `isIterable`
        this.rootViewElement_.patchWithViewElement__(
          source,
          PatchModeForMatch.CloneNode,
          false,
          false
        );
      } else if (isIterable(source)) {
        const peekResult = peek(source);
        const { done, value } = peekResult.next();

        if (!done) {
          // iterable is not empty
          if (value instanceof HTMLElement) {
            // first element is `HTMLElement`
            this.rootViewElement_.patchChildViewElementsWithDOMElements__(
              peekResult as Iterable<HTMLElement>,
              mode,
              false,
              false
            );
          } else {
            // first element is `ViewElement`
            this.rootViewElement_.patchChildViewElementsWithViewElements__(
              peekResult as Iterable<ViewElement>,
              mode,
              false,
              false
            );
          }
        }
      }
    });
  }
}
