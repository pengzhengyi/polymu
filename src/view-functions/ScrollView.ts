/**
 * @module
 *
 * This module provides a `ScrollView` which represents a view transformation which selects a "window" of the source view while other region of the source view can be accessible through scrolling on the screen.
 *
 * This `ScrollView` extends upon `PartialView` by establishing a synergy between elements that are rendered in the window (inside the DOM tree) and elements in target view.
 *
 *      + When scrolling happens, the window will be shifted accordingly
 *      + When the window is updated, rendered elements will be replaced accordingly
 */

import { Collection, LazyCollectionProvider } from '../collections/Collection';
import { fillerClass, startFillerClass, endFillerClass } from '../constants/css-classes';
import { IntersectionObserverOptions } from '../dom/IntersectionObserver';
import { getScrollParent } from '../dom/scroll';
import { debounceWithCooldown } from '../utils/debounce';
import { bound } from '../utils/math';
import { ViewModel } from '../ViewModel';
import { PartialView } from './PartialView';

/**
 * An enumeration of possible scroll directions.
 */
enum ScrollDirection {
  Up,
  Down,
  Left,
  Right,
  /** Indicates no scrolling happened */
  Stay,
}

/**
 * An enumeration of possible screen axis.
 */
export enum ScreenAxis {
  /**
   * Elements on horizontal axis will only have x value difference..
   */
  Horizontal,
  /** Elements on vertical axis will only have y value difference */
  Vertical,
}

/**
 * The configuration options used to initialize {@link ScrollView}
 */
interface ScrollViewConfiguration<TViewElement, TDomElement extends HTMLElement> {
  /**
   * A function to convert a view element (of type T) to a DOM element (subtypes HTMLElement).
   *
   * For example, if view element is already is a DOM element, return itself would be sufficient.
   *
   * There is no need to supply convert function when
   *
   *    + T is convertible to HTMLElement (for example, T is `HTMLLIElement`)
   *    + T is `ViewModel`
   */
  convert?: (viewElement: TViewElement) => TDomElement;
  /**
   * Where the target view is mounted on. In other words, `target` is a HTML element that serves as a container for rendered view elements.
   *
   * Moreover, the filler elements will be inserted before and after the `target`.
   */
  target: HTMLElement;
  /** IntersectionObserverOptions for top filler */
  startFillerObserverOptions?: IntersectionObserverOptions;
  /** IntersectionObserverOptions for bottom filler */
  endFillerObserverOptions?: IntersectionObserverOptions;
  /** IntersectionObserverOptions for top sentinel */
  startSentinelObserverOptions?: IntersectionObserverOptions;
  /** IntersectionObserverOptions for bottom sentinel */
  endSentinelObserverOptions?: IntersectionObserverOptions;
}

/**
 * A `ScrollView` renders a partial window of source view while making other region of the source view accessible through scrolling. The rendering window can also be adjusted programmatically through `setWindow` and `shiftWindow`.
 *
 * TODO @todo use CircularArray to hold a temporary cache
 *
 * @typedef TDomElement - A element type that should subclass {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement HTMLElement}.
 */
export class ScrollView<TViewElement, TDomElement extends HTMLElement> extends PartialView<
  TViewElement
> {
  /** denotes the event that will be emitted before view update, it will supply the target view */
  static readonly beforeViewUpdateEventName = 'beforeViewUpdate';
  /** denotes the event that will be emitted after view update, it will supply the target view */
  static readonly afterViewUpdateEventName = 'afterViewUpdate';

  /**
   * The DOM container that holds the rendered view elements.
   *
   * @see {@link ScrollViewConfiguration#target}
   */
  protected _target: HTMLElement;

  /** A HTMLElement that constitutes the scrolling area, inside which the scroll bar will be rendered */
  protected _scrollTarget: HTMLElement;

  /**
   * An axis to monitor for scrolling alongside which elements will be rendered
   * **ASSUMPTION**
   * One `target` should only consist of one scroll axis.
   *
   *    + Horizontal:
   *      ( X X X X X )
   *    + Vertical
   *      | X |
   *      | X |
   *      | X |
   *      | X |
   *      | X |
   *
   * If both axis need to be monitored, a nesting (hierarchical) approach should be preferred than a free-form approach, where outermost `target` handles the vertical scroll axis and each "row" (direct children of outermost target) should be a target handles the horizontal scroll axis.
   *
   *    + @example nesting (encouraged):
   *      | ( X X X X X ) |
   *      | ( X X X X X ) |
   *      | ( X X X X X ) |
   *      | ( X X X X X ) |
   *      | ( X X X X X ) |
   *    + @example free-form (discouraged):
   *          X X X X X
   *          X X X X X
   *          X X X X X
   *          X X X X X
   *          X X X X X
   * @requires {@link ScrollView#targetView}
   */
  protected _scrollAxis: ScreenAxis;
  /**
   * A version of `this.targetView` kept for `_scrollAxis`. When `_elementLength__targetView` disagrees with `targetView`, `_scrollAxis` will be recalculated.
   * @see {@link ScrollView#targetView}
   */
  private _scrollAxis__targetView: Collection<TViewElement>;
  /**
   * @returns {ScreenAxis} The monitoring axis of current scroll handler. It is computed from the coordinate alignment of first rendered element and second rendered element or the direction of scrollbar.
   */
  get scrollAxis(): ScreenAxis {
    const targetView = this.targetView;
    if (Object.is(targetView, this._scrollAxis__targetView)) {
      // reuse `_scrollAxis` as target view have not changed
      return this._scrollAxis;
    } else {
      this._scrollAxis__targetView = targetView;
      if (this.length >= 2) {
        // TODO retrieve rendered element from CircularArray cache
        // check element placement relationship
        const firstElement = this._convert(this.targetView[0]);
        const secondElement = this._convert(this.targetView[1]);
        const { x: firstX, y: firstY } = firstElement.getBoundingClientRect();
        const { x: secondX, y: secondY } = secondElement.getBoundingClientRect();

        if (firstX === secondX && firstY < secondY) {
          return (this._scrollAxis = ScreenAxis.Vertical);
        } else if (firstX < secondX && firstY === secondY) {
          return (this._scrollAxis = ScreenAxis.Horizontal);
        }
      }

      // check existence of scrollbar
      if (this._scrollTarget.scrollHeight > this._scrollTarget.clientHeight) {
        return (this._scrollAxis = ScreenAxis.Vertical);
      } else if (this._scrollTarget.scrollWidth > this._scrollTarget.clientWidth) {
        return (this._scrollAxis = ScreenAxis.Horizontal);
      } else {
        // default vertical
        return (this._scrollAxis = ScreenAxis.Vertical);
      }
    }
  }

  /** previous scroll position, used to determine the scroll direction */
  protected _lastScrollPosition: number = 0;
  /**
   * @returns {number} The current scroll position.
   */
  protected get _scrollPosition(): number {
    if (this.scrollAxis === ScreenAxis.Vertical) {
      return this._scrollTarget.scrollTop;
    } else {
      /* horizontal */
      return this._scrollTarget.scrollLeft;
    }
  }
  protected set _scrollPosition(position: number) {
    if (this.scrollAxis === ScreenAxis.Vertical) {
      this._scrollTarget.scrollTop = position;
    } else {
      /* horizontal */
      this._scrollTarget.scrollLeft = position;
    }
  }

  /**
   * A version of `this.scrollAxis` kept for `_scrollDirection`. When `_scrollDirection__scrollAxis` disagrees with `this.scrollAxis`, `this._lastSourcePosition` will be set to zero.
   * @see {@link ScrollView#targetView}
   */
  private _scrollDirection__scrollAxis: ScreenAxis;
  /**
   * Reports the direction of current scroll.
   *
   * As a side effect, `this.lastScrollPosition` will be updated to current scroll position.
   *
   * @return {ScrollDirection} The direction of current scroll.
   */
  protected get _scrollDirection(): ScrollDirection {
    const scrollAxis = this.scrollAxis;
    if (!Object.is(scrollAxis, this._scrollDirection__scrollAxis)) {
      // axis change, reset recorded scroll position
      this._scrollDirection__scrollAxis = scrollAxis;
      this._lastScrollPosition = 0;
    }

    const scrollPosition = this._scrollPosition;
    let scrollDirection;
    if (scrollPosition > this._lastScrollPosition) {
      scrollDirection =
        scrollAxis === ScreenAxis.Vertical ? ScrollDirection.Down : ScrollDirection.Right;
    } else if (scrollPosition === this._lastScrollPosition) {
      scrollDirection = ScrollDirection.Stay;
    } else {
      scrollDirection =
        scrollAxis === ScreenAxis.Vertical ? ScrollDirection.Up : ScrollDirection.Left;
    }
    this._lastScrollPosition = scrollPosition;
    return scrollDirection;
  }

  /**
   * This function will be used to convert view elements to DOM elements before rendering them.
   *
   * @see {@link ScrollViewConfiguration#convert}
   */
  protected _convert: (viewElement: TViewElement) => TDomElement;

  /**
   * Used to initialize `_convert` internally at construction time.
   *
   * If `convertFunction` is provided, then it will be the `_convert`'s value. Otherwise, a universal conversion function will be used.
   *
   * @param {(viewElement: TViewElement) => TDomElement} [convert] - A conversion function that transforms a view element of type `TViewElement` to a DOM element of type `TDomElement` that subclasses `HTMLElement`.
   */
  protected set _convert_(convertFunction: (viewElement: TViewElement) => TDomElement) {
    if (convertFunction) {
      this._convert = convertFunction;
    } else {
      this._convert = (viewElement) => {
        if (viewElement instanceof ViewModel) {
          return viewElement.element_;
        }
        return (viewElement as unknown) as TDomElement;
      };
    }
  }

  /**
   * How many pixels an element occupies in the rendering axis. It is measured as the first rendered view element's `clientWidth` or `clientHeight` depending on `scrollAxis`.
   *
   * @example If the partial rendering happens on the vertical axis, then `elementLength` denotes the element height.
   *
   * @requires {@link ScrollView#targetView}
   * **ASSUMPTION**
   * Using one concrete value to designate the length assumes all elements have same length. If elements have different lengths, a possible compromise is to use an average length.
   * TODO @todo Measure element width individually.
   */
  protected _elementLength: number;
  /**
   * A version of `this.targetView` kept for `_elementLength`. When `_elementLength__targetView` disagrees with `this.targetView`, `_elementLength` will be recalculated.
   * @see {@link ScrollView#targetView}
   */
  private _elementLength__targetView: Collection<TViewElement>;
  /**
   * @returns {number} How many pixels an element occupies in the rendering axis. It is measured as the first rendered view element's `clientWidth` or `clientHeight` depending on `scrollAxis`.
   */
  get elementLength(): number {
    const targetView = this.targetView;
    if (Object.is(targetView, this._elementLength__targetView)) {
      // reuse `_elementLength` as target view have not changed
      return this._elementLength;
    } else {
      this._elementLength__targetView = targetView;
      if (this.isWindowEmpty === false) {
        // measure first rendered view element length
        // TODO firstRenderedElement should come from CircularArray cache
        const firstRenderedElement: TDomElement = this._target.firstElementChild as TDomElement;
        const propName = this.scrollAxis === ScreenAxis.Vertical ? 'clientHeight' : 'clientWidth';
        return (this._elementLength = firstRenderedElement[propName]);
      } else {
        return (this._elementLength = undefined);
      }
    }
  }

  /**
   * Whether the source view should be partially rendered -- a fixed window of the source view is rendered while other regions of the source view is accessible through scrolling.
   *
   * Source view will not be partially rendered if the number of elements in source view is smaller than the window size. In other words, source view can entirely fit in the window. In this scenario, scrolling will not result substitution of elements in the window (scroll monitoring will be turned off).
   *
   * @returns {boolean} Whether partial rendering should be performed. If this predicate is not meaningful (for example, no source view has been passed in for view generation), `undefined` will be returned. Otherwise, partial rendering will happen unless the source view is known to fit in the window. That is, if `_shouldPartialRender` returns `false`, then the source view can be entirely rendered in the window and scrolling will not result in replacement of window.
   */
  protected get _shouldPartialRender(): boolean | undefined {
    const windowSize = this.windowSize;
    const lastSourceView = this.lastSourceView;
    if (windowSize === undefined || lastSourceView) {
      return undefined;
    }

    const sourceViewLength = lastSourceView.length;
    if (sourceViewLength === undefined) {
      /**
       * Assumptions:
       *      + if an index is defined in source view, it will not be `undefined`
       *
       * If `this._lastSourceView.length is `undefined`, then the collection is either a `LazyCollectionProvider` or a `UnmaterializableCollectionProvider`.
       *
       * Element at `this.windowSize - 1` is accessed rather than `this.endIndex` since for a partially materialized collection, there can be a scenario where collection's actual length is greater than the window size but because window start index is larger than 0, end index is greater than the actual length as resize does not happen for partially materialized collection even when shifting the window can make the window fully filled.
       *
       * + `LazyCollectionProvider` has a cache for materialized element. If its length is not defined, then this collection is partially materialized. We can directly fetching the element at index at `this.windowSize - 1` (equivalent to `this.endIndex` when `this.startIndex === 0).
       *      + If the element at this index is already materialized, fetching it takes O(1) time.
       *      + If the element at this index is not materialized, accessing it will force the collection to materialize up to this index. This is efficient since
       *          + window size is by nature small
       *          + if collection real length is smaller than the index, it will stop when real length is figured out
       *          + iterated elements will be cached and they are always needed for rendering
       * + For `UnmaterializableCollectionProvider`, fetching the element at this index incurs a higher but acceptable cost since
       *      + window size is by nature small
       *      + if collection real length is smaller than the index, it will stop when real length is figured out
       */
      const lastElement = lastSourceView[this.windowSize - 1];
      if (lastSourceView instanceof LazyCollectionProvider) {
        return lastSourceView.materializationLength >= windowSize;
      } else {
        return lastElement !== undefined;
      }
    } else {
      return sourceViewLength >= windowSize;
    }
  }

  /**
   * A filler element to
   *
   *    + emulate full length of the target view
   *    + detect whether a window update is necessary (an update is necessary when filler appears within view)
   *
   * As the start filler (first, topmost or leftmost), it will emulate the length of elements not rendered before the target view.
   */
  protected _startFillerElement: HTMLElement;
  /**
   * @returns {HTMLElement} The inserted start filler element which is used to emulate full height.
   */
  get startFillerElement(): HTMLElement {
    return this._startFillerElement;
  }
  /**
   * A version of `this.scrollAxis` kept for `_startFillerOffset`. When `_startFillerOffset__scrollAxis` disagrees with `this.scrollAxis`, `this._startFillerOffset` will be re-computed.
   * @see {@link ScrollView#targetView}
   */
  private _startFillerOffset__scrollAxis: ScreenAxis;
  /**
   * How far the start filler is from the beginning of the `this.scrollTarget` in `this.ScrollAxis`.
   *
   * @example Suppose `this.scrollTarget` is a table which has a table head and table body. Then `this.startFillerElement` is separated from the table top by the length of the table head.
   */
  protected _startFillerOffset: number;
  /**
   * @returns {number} The offset by which the start filler is separated from the beginning of the `this.scrollTarget` in the axis indicated by `this.scrollAxis`.
   */
  get startFillerOffset(): number | undefined {
    if (Object.is(this._startFillerOffset__scrollAxis, this.scrollAxis)) {
      return this._startFillerOffset;
    }

    this._startFillerOffset__scrollAxis = this.scrollAxis;

    const getOffset = (element: HTMLElement) =>
      this.scrollAxis === ScreenAxis.Horizontal ? element.offsetLeft : element.offsetTop;

    let offset: number = getOffset(this._startFillerElement);
    let offsetParent = this._startFillerElement.offsetParent as HTMLElement;
    while (offsetParent && offsetParent !== this._scrollTarget) {
      offset += getOffset(offsetParent);
      offsetParent = offsetParent.offsetParent as HTMLElement;
    }
    this._startFillerOffset = offset;
  }

  /**
   * A filler element to
   *
   *    + emulate full length of the target view
   *    + detect whether a window update is necessary (an update is necessary when filler appears within view)
   *
   * As the end filler (last, bottommost or rightmost), it will emulate the length of elements not rendered after the target view.
   */
  protected _endFillerElement: HTMLElement;
  /**
   * @returns {HTMLElement} The inserted end filler element used to emulate full height.
   */
  get endFillerElement(): HTMLElement {
    return this._endFillerElement;
  }
  /**
   * An intersection observer to watch whether `this.startFillerElement` entered into view
   */
  protected _startFillerObserver: IntersectionObserver;
  /**
   * An intersection observer to watch whether `this.endFillerElement` entered into view
   */
  protected _endFillerObserver: IntersectionObserver;
  /**
   * @returns {number} The length of the start filler in `this.scrollAxis`.
   */
  get startFillerLength(): number | undefined | null {
    let numElementBefore = this.numElementBefore;
    if (numElementBefore === undefined) {
      return undefined;
    } else if (numElementBefore === null) {
      const firstWindowElement = this.targetView[0];
      if (firstWindowElement === undefined) {
        return null;
      } else {
        numElementBefore = this.startIndex;
      }
    }
    return numElementBefore * this.elementLength;
  }
  /**
   * @returns {number} The length of the end filler in `this.scrollAxis`.
   */
  get endFillerLength(): number | undefined {
    const numElementAfter = this.numElementAfter;
    if (numElementAfter === undefined || numElementAfter === null) {
      return numElementAfter;
    }
    return this.numElementAfter * this.elementLength;
  }

  /**
   * Current formula chooses the start sentinel nears the 1/4 of the target window.
   *
   * @returns {number} The index of the start sentinel in the target window.
   */
  get startSentinelIndex(): number {
    return bound(Math.floor(this.windowSize / 4) - 1, 0, this.windowSize);
  }
  /**
   * @returns {TViewElement} The view element of the start sentinel in the target window.
   */
  get startSentinel(): TViewElement {
    return this.targetView[this.startSentinelIndex];
  }
  /**
   * @returns {TDomElement} A start sentinel is a DOM element in the target window that signals a landmark: a earlier view should be loaded.
   */
  get startSentinelElement(): TDomElement {
    return this._convert(this.startSentinel);
  }
  /**
   * Current formula chooses the end sentinel nears the 3/4 of the target window.
   *
   * @returns {number} The index of the end sentinel in the target window.
   */
  get endSentinelIndex(): number {
    return bound(Math.floor(this.windowSize / 4) * 3 - 1, 0, this.windowSize);
  }
  /**
   * @returns {TViewElement} The view element of the end sentinel in the target window.
   */
  get endSentinel(): TViewElement {
    return this.targetView[this.endSentinelIndex];
  }
  /**
   * @returns {TDomElement} A end sentinel is a DOM element in the target window that signals a landmark: a later view should be loaded.
   */
  get endSentinelElement(): TDomElement {
    return this._convert(this.endSentinel);
  }
  /**
   * An intersection observer to watch `this.startSentinelElement`: if it enters into view
   */
  protected _startSentinelObserver: IntersectionObserver;
  /**
   * An intersection observer to watch `this.endSentinelElement`: if it enters into view
   */
  protected _endSentinelObserver: IntersectionObserver;

  /**
   * Creates a ScrollView instance.
   *
   * At minimal, the `option` object should contain:
   *
   *    + a `target`: where to render the target view
   *
   * @see {@link ScrollViewConfiguration} for more details on initialization configuration.
   *
   * @public
   * @param {ScrollViewConfiguration<TViewElement, TDomElement>} options - An option object to initialize the scroll view.
   * @constructs ScrollView
   */
  constructor(options: ScrollViewConfiguration<TViewElement, TDomElement>) {
    super();
    this._convert_ = options.convert;
    this._target = options.target;
    this._initializeScrollTarget();
    this.initializeScrollEventListener();
    this._initializeFillers();
    this._initializeFillerObservers(
      options.startFillerObserverOptions,
      options.endFillerObserverOptions
    );
    this.initializeSentinelObservers(
      options.startSentinelObserverOptions,
      options.endSentinelObserverOptions
    );

    this.syncView();
    // depends on `this.scrollAxis` and `this.elementLength`
    this._setFillerLengths();
    this.activateObservers();
  }

  protected _initializeScrollTarget() {
    this._scrollTarget = getScrollParent(this._target) as HTMLElement;
  }

  /**
   * Initializes a scroll event listener bounds to `this.scrollTarget`.
   *
   * This listener will calculate the index that **should** appear in current target view using the scroll position. If the index does not appear in current target view, reset the window to update the target view.
   *
   * @listens ScrollEvent
   */
  private initializeScrollEventListener() {
    const observeTarget =
      this._scrollTarget === document.documentElement ? window : this._scrollTarget;

    observeTarget.addEventListener(
      'scroll',
      debounceWithCooldown((event) => {
        if (
          event.target === this._scrollTarget ||
          (document === event.target && document.documentElement === this._scrollTarget)
        ) {
          // only handle scroll event happening on observed scroll container
          const startIndex = this.getElementIndexFromScrollAmount();
          if (startIndex < this.startIndex || this.endIndex < startIndex) {
            // view out of sync
            this.setWindow(startIndex);
          }
        }
      }, 400),
      { passive: true }
    );
  }

  /**
   * Initializes the filler elements.
   *
   * Filler elements serves as special guard nodes: when they appear in view -- blank section is appearing in the viewport, a target view update is necessary to refill the viewport with content.
   */
  protected _initializeFillers() {
    let tagName: string = 'div';
    switch (this._target.parentElement.tagName) {
      case 'ol':
      case 'ul':
        tagName = 'li';
        break;
      case 'dl':
        tagName = 'dt';
        break;
      case 'table':
      case 'tbody':
        tagName = 'tr';
        break;
      case 'tr':
        tagName = 'td';
        break;
    }

    this._startFillerElement = document.createElement(tagName);
    this._startFillerElement.classList.add(fillerClass, startFillerClass);
    this._target.before(this._startFillerElement);

    this._endFillerElement = document.createElement(tagName);
    this._endFillerElement.classList.add(fillerClass, endFillerClass);
    this._target.after(this._endFillerElement);
  }

  /**
   * Sets the display length (width or height depending on `this.scrollAxis`) of filler elements.
   *
   * @param {number} [startFillerLength = this.startFillerLength] - The length for start filler.
   * @param {number} [endFillerLength = this.endFillerLength] - The length for end filler.
   */
  protected _setFillerLengths(
    startFillerLength: number = this.startFillerLength,
    endFillerLength: number = this.endFillerLength
  ) {
    const propName = this.scrollAxis === ScreenAxis.Vertical ? 'height' : 'width';
    this._startFillerElement.style[propName] = `${startFillerLength}px`;
    this._endFillerElement.style[propName] = `${endFillerLength}px`;
  }

  /**
   * Initializes the IntersectionObserver for both fillers.
   *
   * @param {IntersectionObserverOptions} [startFillerOptions] - A configuration object for start filler's IntersectionObserver.
   * @param {IntersectionObserverOptions} [endFillerOptions] - A configuration object for end filler's IntersectionObserver.
   */
  protected _initializeFillerObservers(
    startFillerOptions?: IntersectionObserverOptions,
    endFillerOptions?: IntersectionObserverOptions
  ) {
    this._startFillerObserver = new IntersectionObserver(
      (entries) => this.fillerReachedHandler(entries),
      startFillerOptions
    );
    this._endFillerObserver = new IntersectionObserver(
      (entries) => this.fillerReachedHandler(entries),
      endFillerOptions
    );
  }

  /**
   * Initializes the IntersectionObserver for both sentinels.
   *
   * @param {IntersectionObserverOptions} [startSentinelOptions] - A configuration object for start sentinel's IntersectionObserver.
   * @param {IntersectionObserverOptions} [endSentinelOptions] - A configuration object for end sentinel's IntersectionObserver.
   */
  protected initializeSentinelObservers(
    startSentinelOptions?: IntersectionObserverOptions,
    endSentinelOptions?: IntersectionObserverOptions
  ) {
    this._startSentinelObserver = new IntersectionObserver(
      (entries) => this.sentinelReachedHandler(entries),
      startSentinelOptions
    );
    this._endSentinelObserver = new IntersectionObserver(
      (entries) => this.sentinelReachedHandler(entries),
      endSentinelOptions
    );
  }

  /**
   * Activates all IntersectionObserver to detect whether the target view needs to be updated.
   *
   * If the source view can fit within a window (`this.shouldPartialRender` is true), then IntersectionObserver will not be activated.
   * @public
   */
  activateObservers() {
    if (this._shouldPartialRender) {
      this._startFillerObserver.observe(this._startFillerElement);
      this._endFillerObserver.observe(this._endFillerElement);
      this._startSentinelObserver.observe(this.startSentinelElement);
      this._endSentinelObserver.observe(this.endSentinelElement);
    }
  }

  /**
   * Deactivates all IntersectionObserver. Usually called when a view update is taking place.
   * @public
   */
  deactivateObservers() {
    this._startFillerObserver.disconnect();
    this._endFillerObserver.disconnect();
    this._startSentinelObserver.disconnect();
    this._endSentinelObserver.disconnect();
  }

  /**
   * @override
   * Regenerates the target view if any of the following conditions are true:
   *
   *    + `source` view changed
   *    + target view should be regenerated -- window changed
   *
   * If both conditions are false, nothing will be done -- same target view will be returned.
   */
  protected regenerateView(sourceView: Collection<TViewElement>, useCache: boolean) {
    if (useCache && sourceView === this.lastSourceView && !this.shouldRegenerateView) {
      return;
    }

    this._slidingWindow.iterable = sourceView;
    // `SlidingWindow` is a lazy generator of window elements, by wrapping the `SlidingWindow` in a `LazyCollectionProvider`, the elements are cached
    this._targetView_ = new LazyCollectionProvider(this._slidingWindow);

    this.shouldRegenerateView = false;
  }

  /**
   * Invokes `this.partialView.setWindow` to change the section of source view that enters into the target view. Window is defined by two indices -- a start index and an end index. The elements with indices between (inclusive) these two window boundaries will be included in the target view.
   *
   * @public
   * @param {number} startIndex - The start index of the new window.
   * @param {number} [endIndex = startIndex + this.partialView.maximumWindowSize] - The end index of the window.
   */
  setWindow(
    startIndex: number = this.startIndex,
    endIndex: number = this.endIndex,
    noEventNotification: boolean = false
  ): boolean {
    if (super.setWindow(startIndex, endIndex)) {
      this.setView(() => this.view(this.lastSourceView));
      return true;
    }
    return false;
  }

  /**
   * Updates the rendered view.
   *
   * The following steps will be taken in order:
   *
   *    + deactivate all IntersectionObserver
   *    + invoke beforeViewUpdate callback if defined
   *    + update the view
   *    + update the DOM
   *    + invoke afterViewUpdate callback if defined
   *    + activate all IntersectionObserver
   *
   * @param {() => Collection<T>} viewFunction - A callback function to generate the new view.
   */
  setView(viewFunction: () => Collection<TViewElement>) {
    this.deactivateObservers();

    // view generation will happen
    this.invoke(ScrollView.beforeViewUpdateEventName, this.targetView);

    const newView = viewFunction();
    const scrollPosition = this._scrollPosition;
    this._setFillerLengths();
    this.syncView(newView);
    this._scrollPosition = scrollPosition;
    this.invoke(ScrollView.afterViewUpdateEventName, this.targetView);

    this.activateObservers();
  }

  /**
   * Syncing the DOM with a new view. In effect, the child nodes in `this.target` will be replaced with current view.
   *
   * @param {Collection<T>} [newView = this.partialView.targetView] - A new view to update the rendered view.
   */
  private syncView(newView: Collection<TViewElement> = this.targetView) {
    const viewIterator = newView[Symbol.iterator]();
    const elements = this._target.children;
    let elementIndex = 0;
    while (true) {
      let { value, done } = viewIterator.next();
      if (done) {
        break;
      }

      const viewElement = this._convert(value);
      const element = elements[elementIndex++];
      if (element) {
        if (element === viewElement) {
          continue;
        }
        // has corresponding view element: one-to-one replacement
        element.replaceWith(viewElement);
      } else {
        // if there are more view elements than corresponding DOM elements from old view
        this._target.appendChild(viewElement);
      }
    }

    const numElements = elements.length;
    for (; elementIndex < numElements; elementIndex++) {
      // element has corresponding view element: detach element from DOM
      this._target.lastElementChild.remove();
    }
  }

  private shiftView(shiftAmount: number) {
    // shiftAmount will be rectified to the actual window shift amount
    if (this.shiftWindow(shiftAmount, true)) {
      return;
    }

    this.deactivateObservers();
    this.invoke(ScrollView.beforeViewUpdateEventName, this.targetView);

    const view = this.view(this.lastSourceView);
    const isShiftTowardsEnd = shiftAmount > 0;
    // `length` is retrieved from `this.partialView` since `view` is a Collection and might not have `length` defined
    const numViewElement = this.length;

    // the number of elements in current view to be removed, upper bounded by the number of existing elements
    const numElementToRemove = Math.min(this.windowSize, Math.abs(shiftAmount));
    if (isShiftTowardsEnd) {
      for (let i = 0; i < numElementToRemove; i++) {
        this._target.firstElementChild.remove();
      }
      this._setFillerLengths();
      // use 0 as lower bound since there can be at most 0 overlapping elements (windowSize distinct elements)
      for (
        let viewElementIndex = Math.max(0, numViewElement - shiftAmount);
        viewElementIndex < numViewElement;
        viewElementIndex++
      ) {
        const viewElement = this._convert(view[viewElementIndex]);
        this._target.appendChild(viewElement);
      }
    } else {
      shiftAmount = -shiftAmount;
      for (let i = 0; i < numElementToRemove; i++) {
        this._target.lastElementChild.remove();
      }
      const referenceNode = this._target.firstElementChild;
      // at most there can be 0 overlapping elements (windowSize distinct elements)
      const numViewElementToAdd = Math.min(numViewElement, shiftAmount);
      for (let viewElementIndex = 0; viewElementIndex < numViewElementToAdd; viewElementIndex++) {
        const viewElement = this._convert(view[viewElementIndex]);
        this._target.insertBefore(viewElement, referenceNode);
      }
      this._setFillerLengths();
    }

    this.invoke(ScrollView.afterViewUpdateEventName, this.targetView);
    this.activateObservers();
  }

  /**
   * Calculate element index from a scroll amount.
   *
   *    (scrollAmount - this.startFillerOffsetTop) / elementLength
   *
   * @param {number} [scrollAmount = this.scrollPosition] - How far scrolled from page top.
   */
  private getElementIndexFromScrollAmount(scrollAmount: number = this._scrollPosition) {
    const position = Math.max(scrollAmount - this.startFillerOffset, 0);
    return bound(Math.floor(position / this.elementLength), 0, this.targetView.length - 1);
  }

  /**
   * Scrolls to the start of an element at specified index.
   *
   * An optional offset can be specified to adjust the final scroll position.
   *
   * The position is calculated by:
   *
   *    elementIndex * elementLength + startFillerOffsetTop + offset
   *
   * @param {number} elementIndex - The index of an element to scroll to. It should be a safe index: neither less than 0 nor equal or greater than the number of elements.
   * @param {number} offset - The amount to adjust the final scroll position. See the formula.
   */
  scrollToElementIndex(elementIndex: number, offset: number = 0) {
    this._scrollPosition = this.elementLength * elementIndex + this.startFillerOffset + offset;
  }

  /**
   * Called when a filler is reached, which indicates a view update might be necessary as the user has scrolled past all rendered view elements.
   *
   * @callback
   * @param {Array<IntersectionObserverEntry>} entries - An array of IntersectionObserver entries.
   */
  private fillerReachedHandler(entries: Array<IntersectionObserverEntry>) {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.intersectionRect.height > 0) {
        const newStartIndex = this.getElementIndexFromScrollAmount();
        const shiftAmount = newStartIndex - this.startIndex;
        this.shiftView(shiftAmount);
      }
    });
  }

  /**
   * Called when a sentinel is reached, which indicates a view update might be necessary as the user has scrolled past most of rendered view elements.
   *
   * @callback
   * @param {Array<IntersectionObserverEntry>} entries - An array of IntersectionObserver entries.
   */
  private sentinelReachedHandler(entries: Array<IntersectionObserverEntry>) {
    const shiftAmount = Math.floor(this.windowSize / 2);
    const scrollDirection: ScrollDirection = this._scrollDirection;

    entries.forEach((entry) => {
      const desiredDirection: ScrollDirection =
        this.startSentinelElement === entry.target ? ScrollDirection.Up : ScrollDirection.Down;
      if (
        entry.isIntersecting &&
        entry.intersectionRect.height > 0 &&
        scrollDirection === desiredDirection
      ) {
        // the last element of the first data section is appearing into view
        const shift = scrollDirection === ScrollDirection.Up ? -shiftAmount : shiftAmount;
        this.shiftView(shift);
      }
    });
  }
}
