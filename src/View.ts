import { Prop } from './Abstraction';
import { Collection, LazyCollectionProvider } from './Collection';
import { MutationReporter } from './MutationReporter';
import { PartialViewScrollHandler, Axis } from './PartialViewScrollHandler';
import { TaskQueue } from './TaskQueue';
import { ViewModel } from './ViewModel';
import { composeFeatures } from './composition/composition';
import {
  AbstractViewFunction,
  FilterFunction,
  FilteredView,
  PartialView,
  SortedView,
  SortingFunction,
  ViewFunctionChain,
} from './ViewFunction';
import { getViewportHeight, getViewportWidth } from './utils/length';
import { debounceWithCooldown } from './utils/debounce';

/**
 * A union type represents the source view.
 *
 * Since HTMLTemplateElement (`<template>`)'s content is a DocumentFragment and since DocumentFragment implements the ParentNode interface, source can therefore be classified into one of two forms:
 *
 *    + (rooted) a node whose children will be the source view elements
 *    + (unrooted) a collection of elements which will themselves be source view elements
 */
type SourceType = HTMLTemplateElement | DocumentFragment | Node | Array<Node>;

/**
 * A View represents a rendering of elements. The source is provided at initialization which, after undergoing a series of transformations, is rendered at a specified DOM target node.
 *
 * Such rendering are responsive in that changes to DOM target will be observed and handled. For example, inserting or deleting a child of DOM target node will cause an insertion or deletion of its abstraction (ViewModel).
 *
 * Being a BasicView, it has following limitations:
 *
 *    + Its representation is a depth one tree (parent-child) and it will only respond to child mutation.
 *    + Its transformation consists of a FilteredView, SortedView, and a PartialView and its renderer is a scroll handler.
 */
export class BasicView {
  /** organizes source view as a ViewModel, this allows source view to include elements from different regions of DOM or not in DOM */
  protected sourceViewModel: ViewModel;
  /**
   * @returns {Array<ViewModel>} Elements of source view.
   */
  get source(): Array<ViewModel> {
    return this.sourceViewModel.children_;
  }

  /** 1st view function: filter source view according to some criterion */
  protected filteredView: FilteredView<ViewModel>;
  /** 2nd view function: reorder previous view according to some criterion */
  protected sortedView: SortedView<ViewModel>;
  /** 3rd view function: partial renders part of previous view */
  protected partialView: PartialView<ViewModel>;
  /** adjusts the partialView -- updates rendered partial view according to scroll position */
  protected scrollHandler: PartialViewScrollHandler<ViewModel>;
  /** provides an aggregate transformation from source view to final target view */
  protected viewFunctionChain: ViewFunctionChain<ViewModel>;

  /** tasks executed before view update */
  beforeScrollUpdateTaskQueue: TaskQueue = new TaskQueue();
  /** tasks executed after view update */
  afterScrollUpdateTaskQueue: TaskQueue = new TaskQueue();

  /**
   * @returns {number} The maximum number of elements to be rendered.
   */
  protected get windowSizeUpperBound(): number {
    return this.partialView.maximumWindowSize;
  }
  /**
   * Changes the maximum number of elements to be rendered. Will cause rendered view change.
   *
   * @param {number} upperBound - A new upper bound for window size.
   */
  protected set windowSizeUpperBound(upperBound: number) {
    this.partialView.maximumWindowSize = upperBound;
  }

  /**
   * Whether target view needs to be generated from scratch and whether cached intermediate view can be reused.
   *
   * A potential scenario where `useCache` should be set to `false` is when the source is modified. Since all previous views are built from previous source, they should be all be outdated.
   */
  protected useCache: boolean = true;

  /**
   * @returns {Collection<ViewModel>} Elements of target view.
   */
  get view(): Collection<ViewModel> {
    const useCache = this.useCache;
    this.useCache = true;
    return this.viewFunctionChain.view(this.source, useCache);
  }

  /**
   * Creates a BasicView instance.
   *
   * @public
   * @param {SourceType} source - Provides the source view.
   * @param {HTMLElement} target - Where to mount the target view.
   * @constructs BasicView
   */
  constructor(source: SourceType, target: HTMLElement) {
    this.sourceViewModel = new ViewModel(
      target,
      this.onMutation.bind(this),
      undefined,
      undefined,
      // model only children of `target`
      [(element: HTMLElement) => new ViewModel(element)]
    );
    this.parseSource(source);
    this.initializeViewFunction();
    this.initializeTaskQueue();
    this.initializeScrollHandler();
    // updates to a window size appropriate for viewport
    this.adjustWindowSizeUpperBound();
    this.refreshView();
    this.initializeResizeHandler();
    this.monitor();

    composeFeatures(this, [this.viewFunctionChain]);
  }

  /**
   * Parses source into `this.sourceViewModel`.
   *
   * Source can be one of two forms:
   *
   *    + (rooted) an element that has same tagName as `target` whose children will be the source view elements
   *    + (unrooted) a collection of elements which will themselves be source view elements
   *
   * @param {SourceType} source - Contains the source view elements.
   */
  protected parseSource(source: SourceType) {
    if (source instanceof HTMLTemplateElement) {
      source = source.content;
    }

    if (source instanceof DocumentFragment) {
      const children = source.children;
      if (children.length === 1) {
        source = children[0] as Node;
      } else {
        this.sourceViewModel.patchChildViewModelsWithDOMElements__(children);
        return;
      }
    }

    if (Array.isArray(source)) {
      this.sourceViewModel.patchChildViewModelsWithDOMElements__(source as Array<HTMLElement>);
    } else {
      this.sourceViewModel.patchWithDOM__(source as HTMLElement);
    }
  }

  /**
   * Set up a handler for the {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/resize_event resize} event. This handler will adjust the maximum window size so that a smaller screen has a smaller window size while a larger screen has a larger window size.
   */
  protected initializeResizeHandler() {
    window.addEventListener(
      'resize',
      debounceWithCooldown(() => this.adjustWindowSizeUpperBound(), 1000)
    );
  }

  /**
   * Adjust `this.windowSizeUpperBound` according to the viewport length.
   */
  protected adjustWindowSizeUpperBound() {
    const elementLength = this.scrollHandler.elementLength;
    const viewportLength =
      this.scrollHandler.scrollAxis === Axis.Horizontal ? getViewportWidth() : getViewportHeight();
    // four times the current viewport height
    let numElements = Math.max(1, Math.floor(viewportLength / elementLength)) * 4;
    // round to next number divisible by 10
    numElements = Math.ceil(numElements / 10) * 10;
    if (numElements !== this.windowSizeUpperBound) {
      this.windowSizeUpperBound = numElements;
    }
  }

  /**
   * Initializes the transformation that converts a source view into a target view.
   */
  protected initializeViewFunction() {
    this.filteredView = new FilteredView<ViewModel>();
    // initially only render one element
    this.partialView = new PartialView<ViewModel>(this.source, 0, 1, 2);
    this.sortedView = new SortedView<ViewModel>();
    this.viewFunctionChain = new ViewFunctionChain<ViewModel>([
      this.filteredView,
      this.sortedView,
      this.partialView,
    ]);
    // if the view function chain needs to regenerate target view, refresh and render target view immediately. A potential scenario could be a filter function is added to the `FilteredView`
    this.viewFunctionChain.subscribe(this, AbstractViewFunction.shouldRegenerateViewEventName, () =>
      this.refreshView()
    );
    // set up the first target view
    this.view;
  }

  protected initializeTaskQueue() {
    this.beforeScrollUpdateTaskQueue.tasks.push({
      work: () => this.unmonitor(),
      isRecurring: true,
    });
    this.afterScrollUpdateTaskQueue.tasks.push({
      work: () => this.monitor(),
      isRecurring: true,
    });
  }

  /**
   * Initializes the scroll handler that renders the partial view according to scroll position.
   */
  protected initializeScrollHandler() {
    this.scrollHandler = new PartialViewScrollHandler<ViewModel>({
      partialView: this.partialView,
      target: this.sourceViewModel.element_,
    });
    this.scrollHandler.subscribe(this, PartialViewScrollHandler.beforeViewUpdateEventName, () =>
      this.beforeScrollUpdateTaskQueue.work()
    );
    this.scrollHandler.subscribe(this, PartialViewScrollHandler.afterViewUpdateEventName, () =>
      this.afterScrollUpdateTaskQueue.work()
    );
  }

  /**
   * Ask `target` to monitor mutations. Only childlist mutations on direct children of `target` will be handled.
   */
  protected monitor() {
    this.sourceViewModel.observe__(
      this.sourceViewModel.element_,
      false,
      undefined,
      false,
      true,
      false
    );
  }

  /**
   * Stops monitoring mutations.
   */
  protected unmonitor() {
    this.sourceViewModel.unobserve__(this.sourceViewModel.element_);
  }

  /**
   * Handler for observed mutations. It will only handle direct children mutation of `target`.
   */
  protected onMutation(
    mutations: Array<MutationRecord>,
    observer: MutationObserver,
    originalMutations: Array<MutationRecord>,
    reporter: MutationReporter
  ) {
    reporter.report(mutations);

    this.scrollHandler.deactivateObservers();
    this.sourceViewModel.reconnectToExecute__(() => {
      for (const mutation of mutations) {
        if (mutation.target !== this.sourceViewModel.element_) {
          continue;
        }

        if (mutation.type === 'childList') {
          this.onChildListMutation(mutation);
        }
      }
    });
    this.scrollHandler.activateObservers();
  }

  /**
   * Handles ChildList mutation.
   *
   * If a DOM child is removed from `target`, remove the ViewModel child corresponding to that DOM child from `this.sourceViewModel`.
   */
  protected onChildListMutation(mutation: MutationRecord) {
    for (const removedNode of mutation.removedNodes) {
      const identifier = (removedNode as HTMLElement).dataset[ViewModel.identifierDatasetName_];
      this.sourceViewModel.removeChildByIdentifier__(identifier);
    }

    const addedNodeToChildIndex: Map<Node, number> = new Map();
    for (const addedNode of mutation.addedNodes) {
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
      this.sourceViewModel.insertChild__(addedNode as HTMLElement, childIndex);
    }

    // indicates that a full rebuild is necessary to generate target view
    this.useCache = false;
  }

  /**
   * Manipulate `this.source` and refresh the view.
   *
   * @param {() => void} manipulation - An function that modifies the source.
   */
  protected manipulateSource(manipulation: () => void) {
    this.scrollHandler.deactivateObservers();
    this.sourceViewModel.reconnectToExecute__(manipulation);
    this.scrollHandler.activateObservers();
    this.useCache = false;
    this.refreshView();
  }

  /**
   * Adds a view element into `this.source`  and refresh the current view.
   *
   * @see {@link BasicView#manipulateSource}
   *
   * @param {HTMLElement | ViewModel} element - A view element to be added.
   */
  addElement(element: HTMLElement | ViewModel) {
    this.manipulateSource(() => this.sourceViewModel.insertChild__(element));
  }

  /**
   * Removes a view element from `this.source` and refresh the current view.
   *
   * @see {@link BasicView#manipulateSource}
   *
   * @param {HTMLElement | ViewModel} element - A view element to be removed.
   */
  removeElement(element: HTMLElement) {
    this.manipulateSource(() =>
      this.sourceViewModel.removeChildByIdentifier__(
        element.dataset[ViewModel.identifierDatasetName_]
      )
    );
  }

  /**
   * Renders current target view to the page.
   *
   * 1. It regenerates the target view to ensure updates (like adding a filter function) are considered
   * 2. It tries to maximize the window in case the window is decreased due to there wasn't sufficient number of elements previously
   * 3. It updates the view (target view is regenerated because the window might have changed.
   */
  protected refreshView() {
    let view = this.view;
    // tries to maximize the window
    if (this.partialView.setWindow(this.partialView.partialViewStartIndex, undefined, true)) {
      // we prevent `shouldRegenerateViewEventName` event triggered from the call to `setWindow`
    }
    this.scrollHandler.setView(() => view);
  }
}
