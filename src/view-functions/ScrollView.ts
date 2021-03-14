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

import { CircularArray } from '../collections/CircularArray';
import { Collection, LazyCollectionProvider } from '../collections/Collection';
import { Property, PropertyManager, UpdateBehavior } from '../composition/property-management';
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
 * Whether provided scroll direction is towards the first element of the potential view. In other words, whether current displayed elements will be substituted by elements with smaller indices in the potential view.
 *
 * @param scrollDirection - A scroll direction.
 * @returns `true` if the scroll direction is towards start, `false` otherwise.
 */
function isScrollDirectionTowardsStart(scrollDirection: ScrollDirection): boolean {
  switch (scrollDirection) {
    case ScrollDirection.Up:
    case ScrollDirection.Left:
      return true;
    default:
      false;
  }
}

/**
 * Whether provided scroll direction is towards the last element of the potential view. In other words, whether current displayed elements will be substituted by elements with larger indices in the potential view.
 *
 * @param scrollDirection - A scroll direction.
 * @returns `true` if the scroll direction is towards end, `false` otherwise.
 */
function isScrollDirectionTowardsEnd(scrollDirection: ScrollDirection) {
  switch (scrollDirection) {
    case ScrollDirection.Down:
    case ScrollDirection.Right:
      return true;
    default:
      return false;
  }
}

/**
 * An enumeration of possible screen axis.
 */
export enum ScreenAxis {
  /**
   * Elements on horizontal axis will only have x value differed.
   */
  Horizontal,
  /**
   * Elements on vertical axis will only have y value differed.
   */
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
   *    + T is derived type of HTMLElement (for example, T is `HTMLLIElement`)
   *    + T is implicitly convertible to HTMLElement (for example, T is a proxy for a `HTMLElement`)
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
 * An enumeration of possible strategies of updating rendering view.
 */
enum RenderingStrategy {
  /**
   * The new and existing rendering view have the following relationships:
   *
   * + they have same number of elements `|newView| === |existingView| `
   * + denote the number of elements by `n`, for any pair of element in the new view and element in the existing view at the same index (`0 <= i < n`) in their respective rendering view, they have a same index difference in potential view.
   *
   * Shift rendering strategy often implies room for elements reuse through clever partial updating.
   *
   * For example
   *
   * ```
   * [ X X X X X ]  -- potential view
   *   ↑ - ↥        -- existing rendering view
   *       ↑ - ↥    -- new rendering view
   * ```
   */
  Shift,
  /**
   * The existing rendering view should be substituted by a new rendering view. There is no guaranteed relationship between these two views.
   */
  Replace,
  /**
   * The existing rendering view does not need to be modified.
   */
  NoAction,
}

/**
 * A `ScrollView` renders a partial window of source view while making other region of the source view accessible through scrolling. The rendering window can also be adjusted programmatically through `setWindow` and `shiftWindow`.
 *
 * @typedef TDomElement - A element type that should subclass {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement HTMLElement}.
 */
export class ScrollView<TViewElement, TDomElement extends HTMLElement> extends PartialView<
  TViewElement
> {
  /** denotes the event that will be emitted before rendering view update, it will supply the current `ScrollView` */
  static readonly beforeRenderingViewUpdateEventName = 'beforeRenderingViewUpdate';
  /** denotes the event that will be emitted after rendering view update, it will supply the current `ScrollView` */
  static readonly afterRenderingViewUpdateEventName = 'afterRenderingViewUpdate';

  // a collection of property names to facilitate renaming by reducing raw string appearances
  protected static readonly _renderingViewPropertyName = '_renderingView';
  protected static readonly _targetPropertyName = '_target';
  protected static readonly _startFillerElementPropertyName = '_startFillerElement';
  protected static readonly _startFillerLengthPropertyName = '_startFillerLength';
  protected static readonly _startFillerOffsetPropertyName = '_startFillerOffset';
  protected static readonly _endFillerElementPropertyName = '_endFillerElement';
  protected static readonly _endFillerLengthPropertyName = '_endFillerLength';
  protected static readonly _scrollAxisPropertyName = '_scrollAxis';
  protected static readonly _elementLengthPropertyName = '_elementLength';
  protected static readonly _scrollTargetPropertyName = '_scrollTarget';
  protected static readonly _renderingStrategyPropertyName = '_renderingStrategy';
  protected static readonly _shiftAmountPropertyName = '_shiftAmount';
  protected static readonly _lastScrollPositionPropertyName = '_lastScrollPosition';
  protected static readonly _shouldPartialRenderPropertyName = '_shouldPartialRender';

  /**
   * A ` PropertyManager` that manages the interdependencies of ScrollView properties.
   *
   * For example, it updates rendering view when the target view changes.
   */
  protected _propertyManager: PropertyManager;

  protected _renderingStrategy: RenderingStrategy;
  protected _renderingStrategyProperty: Property<RenderingStrategy> = new Property(
    ScrollView._renderingStrategyPropertyName,
    (thisValue, manager) => {
      const snapshotValue: RenderingStrategy = manager.getPropertyValueSnapshot(thisValue);
      if (snapshotValue === undefined) {
        // lazily initializes `RenderingStrategy` to `NoAction`
        manager.propertyValueSnapshot.set(thisValue, RenderingStrategy.NoAction);
        return RenderingStrategy.NoAction;
      } else {
        return snapshotValue;
      }
    },
    UpdateBehavior.Lazy
  );

  protected _shiftAmount: number;
  protected _shiftAmountProperty: Property<number> = new Property(
    ScrollView._shiftAmountPropertyName,
    (thisValue, manager) => manager.getPropertyValueSnapshot(thisValue),
    UpdateBehavior.Lazy,
    (oldValue, newValue, thisValue, manager) => {
      if (newValue) {
        // `newValue !== undefined && newValue !== 0`
        if (this._renderingStrategy === RenderingStrategy.NoAction) {
          this._renderingStrategy = RenderingStrategy.Shift;
        }
      }

      manager.notifyValueChange(thisValue);
    }
  );

  private __circularArray: CircularArray<TDomElement>;
  protected _renderingView: Collection<TDomElement>;
  protected _renderingViewProperty: Property<Collection<TDomElement>> = new Property(
    ScrollView._renderingViewPropertyName,
    (thisValue, manager) => {
      let targetView: Collection<TViewElement>;
      let target: HTMLElement;
      const convert = this._convert;
      const renderingStrategy: RenderingStrategy = manager.getPropertyValue('_renderingStrategy');

      switch (renderingStrategy) {
        case RenderingStrategy.NoAction:
          break;
        case RenderingStrategy.Replace:
          this._modifyRenderingView(() => {
            targetView = this._targetView;
            const scrollPosition = this._scrollPosition;

            if (this.__circularArray === undefined) {
              // a heuristic to set the initial capacity for circular array
              const capacity =
                targetView.length || (targetView as any).materializationLength || 1000;
              this.__circularArray = new CircularArray(capacity);
            }

            target = manager.getPropertyValue('_target');
            const existingElements = Array.from(this._target.children);
            let existingElementCount = existingElements.length;
            this.__circularArray.fit(
              (function* () {
                for (const viewElement of targetView) {
                  yield convert(viewElement);
                }
              })(),
              undefined,
              (element, index) => {
                if (existingElementCount > 0) {
                  const existingElement = existingElements[index];
                  existingElement.replaceWith(element);
                  existingElementCount--;
                } else {
                  target.appendChild(element);
                }
              }
            );

            // remove surplus elements
            for (; existingElementCount > 0; existingElementCount--) {
              target.lastElementChild.remove();
            }

            this._scrollPosition = scrollPosition;
          });
          break;
        case RenderingStrategy.Shift:
          this._modifyRenderingView(() => {
            targetView = this._targetView;
            const shiftAmount: number = manager.getPropertyValue('_shiftAmount');
            target = manager.getPropertyValue('_target');

            console.assert(
              this.__circularArray === undefined || !this.__circularArray.isFull,
              'invalid circular array state when performing shift in target view'
            );

            const shiftTowardsEnd = shiftAmount > 0;
            let onEnter: (element: TDomElement, windowIndex: number) => void;
            if (shiftTowardsEnd) {
              onEnter = (element) => target.appendChild(element);
            } else {
              let lastInsertedElement: TDomElement;
              onEnter = (element, windowIndex) => {
                if (windowIndex === 0) {
                  // inserting first element
                  target.prepend(element);
                } else {
                  // inserting other element
                  lastInsertedElement.after(element);
                }
                lastInsertedElement = element;
              };
            }
            // update circular array based on `shiftAmount`
            this.__circularArray.shift(
              shiftAmount,
              (function* () {
                if (shiftTowardsEnd) {
                  // shift towards end
                  let numViewElement = targetView.length;
                  if (numViewElement === undefined) {
                    const viewElements = Array.from(targetView);
                    numViewElement = viewElements.length;
                    for (let i = numViewElement - shiftAmount; i < numViewElement; i++) {
                      yield convert(viewElements[i]);
                    }
                  } else {
                    for (const viewElement of targetView.slice(
                      numViewElement - shiftAmount,
                      numViewElement
                    )) {
                      yield convert(viewElement);
                    }
                  }
                } else {
                  // shift towards start, first `shiftAmount` elements of `targetView` will be inserted
                  for (const viewElement of targetView.slice(0, -shiftAmount)) {
                    yield convert(viewElement);
                  }
                }
              })(),
              (element) => element.remove(),
              onEnter
            );
          });
          break;
      }
      return this.__circularArray;
    },
    UpdateBehavior.Immediate
  );

  /**
   * The DOM container that holds the rendered view elements.
   *
   * @see {@link ScrollViewConfiguration#target}
   */
  protected _target: HTMLElement;
  protected _targetProperty: Property<HTMLElement> = new Property(
    ScrollView._targetPropertyName,
    // `_target` is "prerequisite free": it is a leaf node in prerequisite graph as its value is modified through exposed setter
    (_, manager) => manager.getPropertyValueSnapshotWithName(ScrollView._targetPropertyName),
    UpdateBehavior.Lazy
  );

  /** A HTMLElement that constitutes the scrolling area, inside which the scroll bar will be rendered */
  protected _scrollTarget: HTMLElement;
  protected _scrollTargetProperty: Property<HTMLElement> = new Property(
    ScrollView._scrollTargetPropertyName,
    (thisValue, manager) => {
      const target: HTMLElement = manager.getPropertyValue('_target');
      const targetVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._targetPropertyName
      );
      thisValue.shouldReuseLastValue = (_, manager) =>
        manager.isSnapshotVersionUpToDate(ScrollView._targetPropertyName, targetVersion);

      if (target === undefined) {
        return undefined;
      }

      return getScrollParent(target) as HTMLElement;
    },
    UpdateBehavior.Immediate
  );

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
   * @returns {ScreenAxis} The monitoring axis of current scroll handler. It is computed from the coordinate alignment of first rendered element and second rendered element or the direction of scrollbar.
   */
  protected _scrollAxisProperty: Property<ScreenAxis> = new Property(
    ScrollView._scrollAxisPropertyName,
    (thisValue, manager) => {
      const scrollTarget: HTMLElement = manager.getPropertyValue('_scrollTarget');
      const scrollTargetVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._scrollTargetPropertyName
      );

      let screenAxis: ScreenAxis;

      // check existence of scrollbar
      if (scrollTarget.scrollHeight > scrollTarget.clientHeight) {
        screenAxis = ScreenAxis.Vertical;
      } else if (scrollTarget.scrollWidth > scrollTarget.clientWidth) {
        screenAxis = ScreenAxis.Horizontal;
      } else {
        // default vertical
        screenAxis = ScreenAxis.Vertical;
      }
      thisValue.shouldReuseLastValue = (_, manager) =>
        manager.isSnapshotVersionUpToDate(
          ScrollView._scrollTargetPropertyName,
          scrollTargetVersion
        );
      return screenAxis;
    },
    UpdateBehavior.Immediate
  );

  /** previous scroll position, used to determine the scroll direction */
  protected _lastScrollPosition: number = 0;
  protected _lastScrollPositionProperty: Property<number> = new Property(
    ScrollView._lastScrollPositionPropertyName,
    (thisValue, manager) => {
      // `__getValue` will be called for first-time retrieval and every time scroll axis has changed to reset scroll position. In other cases, `shouldReuseLastValue` should evaluate to true and set value from `_scrollDirection` will be used

      // Dependency Injection: manager.getPropertyValue('_scrollAxis');
      const scrollAxisVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._scrollAxisPropertyName
      );

      thisValue.shouldReuseLastValue = (_, manager) =>
        manager.isSnapshotVersionUpToDate(ScrollView._scrollAxisPropertyName, scrollAxisVersion);
      return 0;
    },
    UpdateBehavior.Immediate
  );

  /**
   * @returns {number} The current scroll position.
   */
  protected get _scrollPosition(): number {
    if (this._scrollAxis === ScreenAxis.Vertical) {
      return this._scrollTarget.scrollTop;
    } else {
      /* horizontal */
      return this._scrollTarget.scrollLeft;
    }
  }
  protected set _scrollPosition(position: number) {
    if (this._scrollAxis === ScreenAxis.Vertical) {
      this._scrollTarget.scrollTop = position;
    } else {
      /* horizontal */
      this._scrollTarget.scrollLeft = position;
    }
  }

  /**
   * Reports the direction of current scroll.
   *
   * As a side effect, `this.lastScrollPosition` will be updated to current scroll position.
   *
   * @return {ScrollDirection} The direction of current scroll.
   */
  protected get _scrollDirection(): ScrollDirection {
    const scrollAxis = this._scrollAxis;
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
   * @returns {number} How many pixels an element occupies in the rendering axis. It is measured as the first rendered view element's `clientWidth` or `clientHeight` depending on `scrollAxis`.
   */
  protected _elementLengthProperty: Property<number> = new Property(
    ScrollView._elementLengthPropertyName,
    (thisValue, manager) => {
      const renderingView: CircularArray<TDomElement> = manager.getPropertyValue('_renderingView');
      const scrollAxis: ScreenAxis = manager.getPropertyValue('_scrollAxis');
      const scrollAxisVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._scrollAxisPropertyName
      );

      if (scrollAxis === undefined || renderingView === undefined || renderingView.isEmpty) {
        return undefined;
      } else {
        const firstRenderedElement: TDomElement = renderingView.get(0);
        const propName = scrollAxis === ScreenAxis.Vertical ? 'clientHeight' : 'clientWidth';
        const elementLength = firstRenderedElement[propName];
        // reuse same element length unless scroll axis has changed
        thisValue.shouldReuseLastValue = (_, manager) =>
          manager.isSnapshotVersionUpToDate(ScrollView._scrollAxisPropertyName, scrollAxisVersion);
        return elementLength;
      }
    },
    UpdateBehavior.Lazy
  );

  /**
   * Whether the source view should be partially rendered -- a fixed window of the source view is rendered while other regions of the source view is accessible through scrolling.
   *
   * Source view will not be partially rendered if the number of elements in source view is smaller than the window size. In other words, source view can entirely fit in the window. In this scenario, scrolling will not result substitution of elements in the window (scroll monitoring will be turned off).
   *
   * @returns {boolean} Whether partial rendering should be performed. If this predicate is not meaningful (for example, no source view has been passed in for view generation), `undefined` will be returned. Otherwise, partial rendering will happen unless the source view is known to fit in the window. That is, if `_shouldPartialRender` returns `false`, then the source view can be entirely rendered in the window and scrolling will not result in replacement of window.
   */
  protected _shouldPartialRender: boolean;
  protected _shouldPartialRenderProperty: Property<boolean> = new Property(
    ScrollView._shouldPartialRenderPropertyName,
    (thisValue, manager) => {
      const renderingView: CircularArray<TDomElement> = manager.getPropertyValue('_renderingView');
      const renderingViewVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._renderingViewPropertyName
      );
      thisValue.shouldReuseLastValue = (_, manager) =>
        manager.isSnapshotVersionUpToDate(
          ScrollView._renderingViewPropertyName,
          renderingViewVersion
        );

      return renderingView && renderingView.isFull;
    },
    UpdateBehavior.Lazy
  );

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
  protected _startFillerElementProperty: Property<HTMLElement> = new Property(
    ScrollView._startFillerElementPropertyName,
    (thisValue, manager) => {
      const target: HTMLElement = manager.getPropertyValue('_target');
      const targetVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._targetPropertyName
      );

      thisValue.shouldReuseLastValue = (_, manager) =>
        manager.isSnapshotVersionUpToDate(ScrollView._targetPropertyName, targetVersion);

      if (target === undefined) {
        return undefined;
      }

      const tagName = this.__guessFillerTagName(target.parentElement.tagName);
      const startFillerElement = document.createElement(tagName);
      startFillerElement.classList.add(fillerClass, startFillerClass);
      target.before(this._startFillerElement);
      return startFillerElement;
    },
    UpdateBehavior.Immediate,
    (oldValue, _, thisValue, manager) => {
      // cleanup
      if (oldValue !== undefined) {
        oldValue.remove();
      }

      manager.notifyValueChange(thisValue);
    }
  );

  protected _startFillerLength: number;

  /**
   * @returns {number} The length of the start filler in `this.scrollAxis`.
   */
  protected _startFillerLengthProperty: Property<number> = new Property(
    ScrollView._startFillerLengthPropertyName,
    (thisValue, manager) => {
      // Dependency Injection: manager.getPropertyValue('_startFillerElement');
      const startFillerElementVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._startFillerElementPropertyName
      );

      const elementLength: number = manager.getPropertyValue('_elementLength');
      const elementLengthVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._elementLengthPropertyName
      );

      thisValue.shouldReuseLastValue = (_, manager) =>
        manager.isSnapshotVersionUpToDate(
          ScrollView._startFillerElementPropertyName,
          startFillerElementVersion
        ) &&
        manager.isSnapshotVersionUpToDate(
          ScrollView._elementLengthPropertyName,
          elementLengthVersion
        );

      return this.numElementBefore * elementLength || 0;
    },
    UpdateBehavior.Immediate,
    (_, newValue, thisValue, manager) => {
      if (newValue !== undefined && newValue !== null) {
        const propName = this._scrollAxis === ScreenAxis.Vertical ? 'height' : 'width';
        this._startFillerElement.style[propName] = `${newValue}px`;
      }

      manager.notifyValueChange(thisValue);
    }
  );

  /**
   * How far the start filler is from the beginning of the `this.scrollTarget` in `this.ScrollAxis`.
   *
   * @example Suppose `this.scrollTarget` is a table which has a table head and table body. Then `this.startFillerElement` is separated from the table top by the length of the table head.
   */
  protected _startFillerOffset: number;
  /**
   * @returns {number} The offset by which the start filler is separated from the beginning of the `this.scrollTarget` in the axis indicated by `this.scrollAxis`.
   */
  protected _startFillerOffsetProperty: Property<number> = new Property(
    ScrollView._startFillerOffsetPropertyName,
    (thisValue, manager) => {
      const scrollAxis: ScreenAxis = manager.getPropertyValue('_scrollAxis');
      const scrollAxisVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._scrollAxisPropertyName
      );
      const startFillerElement: HTMLElement = manager.getPropertyValue('_startFillerElement');
      const startFillerElementVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._startFillerElementPropertyName
      );
      const scrollTarget: HTMLElement = manager.getPropertyValue('_scrollTarget');
      const scrollTargetVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._scrollTargetPropertyName
      );

      thisValue.shouldReuseLastValue = (_, manager) =>
        manager.isSnapshotVersionUpToDate(ScrollView._scrollAxisPropertyName, scrollAxisVersion) &&
        manager.isSnapshotVersionUpToDate(
          ScrollView._startFillerElementPropertyName,
          startFillerElementVersion
        ) &&
        manager.isSnapshotVersionUpToDate(
          ScrollView._scrollTargetPropertyName,
          scrollTargetVersion
        );

      if (startFillerElement === undefined || scrollTarget === undefined) {
        return undefined;
      }

      const getOffset = (element: HTMLElement) =>
        scrollAxis === ScreenAxis.Horizontal ? element.offsetLeft : element.offsetTop;

      let offset: number = getOffset(startFillerElement);
      let offsetParent = startFillerElement.offsetParent as HTMLElement;
      while (offsetParent && offsetParent !== this._scrollTarget) {
        offset += getOffset(offsetParent);
        offsetParent = offsetParent.offsetParent as HTMLElement;
      }
      return offset;
    },
    UpdateBehavior.Lazy
  );

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

  /**
   * Initializes the filler elements.
   *
   * Filler elements serves as special guard nodes: when they appear in view -- blank section is appearing in the viewport, a target view update is necessary to refill the viewport with content.
   */

  protected _endFillerElementProperty: Property<HTMLElement> = new Property(
    ScrollView._endFillerElementPropertyName,
    (thisValue, manager) => {
      const target: HTMLElement = manager.getPropertyValue('_target');
      const targetVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._targetPropertyName
      );

      thisValue.shouldReuseLastValue = (_, manager) =>
        manager.isSnapshotVersionUpToDate(ScrollView._targetPropertyName, targetVersion);

      if (target === undefined) {
        return undefined;
      }

      const tagName = this.__guessFillerTagName(target.parentElement.tagName);
      const endFillerElement = document.createElement(tagName);
      endFillerElement.classList.add(fillerClass, endFillerClass);
      return endFillerElement;
    },
    UpdateBehavior.Immediate,
    (oldValue, _, thisValue, manager) => {
      // cleanup
      if (oldValue !== undefined) {
        oldValue.remove();
      }

      manager.notifyValueChange(thisValue);
    }
  );

  protected _endFillerLength: number;
  /**
   * @returns {number} The length of the end filler in `this.scrollAxis`.
   */
  protected _endFillerLengthProperty: Property<number> = new Property(
    ScrollView._endFillerLengthPropertyName,
    (thisValue, manager) => {
      const endFillerElement: HTMLElement = manager.getPropertyValue('_endFillerElement');
      const endFillerElementVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._endFillerElementPropertyName
      );
      const elementLength: number = manager.getPropertyValue('_elementLength');
      const elementLengthVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._elementLengthPropertyName
      );

      thisValue.shouldReuseLastValue = (_thisValue, manager) =>
        manager.isSnapshotVersionUpToDate(
          ScrollView._endFillerElementPropertyName,
          endFillerElementVersion
        ) &&
        manager.isSnapshotVersionUpToDate(
          ScrollView._elementLengthPropertyName,
          elementLengthVersion
        );

      let numElementAfter = this.numElementAfter;
      if (numElementAfter === undefined) {
        return undefined;
      } else if (numElementAfter === null) {
        const lastSourceView = this.lastSourceView;
        if (lastSourceView instanceof LazyCollectionProvider) {
          numElementAfter = Collection.getMaterializationLength(lastSourceView) - this.endIndex - 1;
        } else {
          numElementAfter = null;
        }
      }
      return numElementAfter * elementLength;
    },
    UpdateBehavior.Immediate,
    (_oldValue, newValue, _thisValue, _manager) => {
      if (newValue !== undefined) {
        if (newValue === null) {
          // TODO use a magic number
          newValue = 1000;
        }

        const propName = this._scrollAxis === ScreenAxis.Vertical ? 'height' : 'width';
        this._endFillerElement.style[propName] = `${newValue}px`;
      }
    }
  );
  /**
   * An intersection observer to watch whether `this.startFillerElement` entered into view
   */
  protected _startFillerObserver: IntersectionObserver;
  /**
   * An intersection observer to watch whether `this.endFillerElement` entered into view
   */
  protected _endFillerObserver: IntersectionObserver;

  /**
   * Current formula chooses the start sentinel nears the 1/4 of the target window.
   *
   * @returns {number} The index of the start sentinel in the target window.
   */
  get startSentinelIndex(): number {
    if (this.windowSize === undefined) {
      return undefined;
    }

    return bound(Math.floor(this.windowSize / 4) - 1, 0, this.windowSize);
  }
  /**
   * @returns {TDomElement} A start sentinel is a DOM element in the target window that signals a landmark: a earlier view should be loaded.
   */
  protected get _startSentinelElement(): TDomElement {
    const renderingView = this._renderingView;
    if (!renderingView) {
      return undefined;
    }
    return renderingView.get(this.startSentinelIndex);
  }
  /**
   * Current formula chooses the end sentinel nears the 3/4 of the target window.
   *
   * @returns {number} The index of the end sentinel in the target window.
   */
  get endSentinelIndex(): number {
    if (this.windowSize === undefined) {
      return undefined;
    }

    return bound(Math.floor((this.windowSize / 4) * 3) - 1, 0, this.windowSize);
  }
  /**
   * @returns {TDomElement} A end sentinel is a DOM element in the target window that signals a landmark: a later view should be loaded.
   */
  protected get _endSentinelElement(): TDomElement {
    const renderingView = this._renderingView;
    if (!renderingView) {
      return undefined;
    }
    return renderingView.get(this.endSentinelIndex);
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
    this._propertyManager = new PropertyManager([
      this._renderingStrategyProperty,
      this._shiftAmountProperty,
      this._renderingViewProperty,
      this._targetProperty,
      this._scrollTargetProperty,
      this._scrollAxisProperty,
      this._lastScrollPositionProperty,
      this._elementLengthProperty,
      this._shouldPartialRenderProperty,
      this._startFillerElementProperty,
      this._startFillerLengthProperty,
      this._startFillerOffsetProperty,
      this._endFillerElementProperty,
      this._endFillerLengthProperty,
    ]);
    this._propertyManager.bind(this);

    // initial values should be set after properties are bound to avoid overwriting during property binding
    this._convert_ = options.convert;
    this._target = options.target;

    this.initializeScrollEventListener();
    this._initializeFillerObservers(
      options.startFillerObserverOptions,
      options.endFillerObserverOptions
    );
    this.initializeSentinelObservers(
      options.startSentinelObserverOptions,
      options.endSentinelObserverOptions
    );

    this.activateObservers();
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

  protected __guessFillerTagName(containerTagName: string) {
    let tagName: string = 'div';
    switch (containerTagName) {
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
    return tagName;
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
      this._startSentinelObserver.observe(this._startSentinelElement);
      this._endSentinelObserver.observe(this._endSentinelElement);
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
   * Called when a filler is reached, which indicates a view update might be necessary as the user has scrolled past all rendered view elements.
   *
   * @callback
   * @param {Array<IntersectionObserverEntry>} entries - An array of IntersectionObserver entries.
   */
  protected fillerReachedHandler(entries: Array<IntersectionObserverEntry>) {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.intersectionRect.height > 0) {
        const newStartIndex = this.getElementIndexFromScrollAmount();
        this._shiftAmount = newStartIndex - this.startIndex;
      }
    });
  }

  /**
   * Called when a sentinel is reached, which indicates a view update might be necessary as the user has scrolled past most of rendered view elements.
   *
   * @callback
   * @param {Array<IntersectionObserverEntry>} entries - An array of IntersectionObserver entries.
   */
  protected sentinelReachedHandler(entries: Array<IntersectionObserverEntry>) {
    const shiftAmount = Math.floor(this.windowSize / 2);
    const scrollDirection: ScrollDirection = this._scrollDirection;

    entries.forEach((entry) => {
      const shiftTowardsStart: boolean = this._startSentinelElement === entry.target;
      if (
        entry.isIntersecting &&
        entry.intersectionRect.height > 0 &&
        (shiftTowardsStart
          ? isScrollDirectionTowardsStart(scrollDirection)
          : isScrollDirectionTowardsEnd(scrollDirection))
      ) {
        // the last element of the first data section is appearing into view
        this._shiftAmount = shiftTowardsStart ? -shiftAmount : shiftAmount;
      }
    });
  }

  protected _regenerateViewIfNeeded(oldStartIndex: number, oldEndIndex: number) {
    const startIndexShiftAmount: number = this.startIndex - oldStartIndex;
    const endIndexShiftAmount: number = this.endIndex - oldEndIndex;
    const hasSameShiftAmount: boolean =
      Number.isInteger(startIndexShiftAmount) && startIndexShiftAmount === endIndexShiftAmount;
    if (hasSameShiftAmount && this._renderingStrategy === RenderingStrategy.NoAction) {
      // can be considered a shift operation
      this._propertyManager.setPropertyValueSnapshotSilently(
        this._renderingStrategyProperty,
        RenderingStrategy.Shift
      );
      this._propertyManager.setPropertyValueSnapshotSilently(
        this._shiftAmountProperty,
        startIndexShiftAmount
      );
    } else {
      this._propertyManager.setPropertyValueSnapshotSilently(
        this._renderingStrategyProperty,
        RenderingStrategy.Replace
      );
    }

    // triggering target view regeneration and consequently rendering view regeneration
    this.regenerateView(this.lastSourceView, true);
  }

  protected regenerateView(sourceView: Collection<TViewElement>, useCache: boolean) {
    if (!useCache || sourceView !== this.lastSourceView) {
      this._propertyManager.setPropertyValueSnapshotSilently(
        this._renderingStrategyProperty,
        RenderingStrategy.Replace
      );
    }

    super.regenerateView(sourceView, useCache);

    // target view has been updated, use updated target view to update rendering view if necessary
    if (this._renderingStrategy !== RenderingStrategy.NoAction) {
      /**
       * When rendering view is up to date, rendering strategy will be `NoAction`. Since there exists an unsymmetry between these two values, this implies a necessary rendering view update is suppressed with silent updating of rendering strategy and the delayed update should occur here
       */
      this._propertyManager.notifyValueChange(this._renderingStrategyProperty);
    }
  }

  setWindow(
    startIndex: number = this.startIndex,
    endIndex: number = this.endIndex,
    noEventNotification: boolean = false
  ): boolean {
    const oldStartIndex = this.startIndex;
    const oldEndIndex = this.endIndex;

    if (super.setWindow(startIndex, endIndex, noEventNotification)) {
      this._regenerateViewIfNeeded(oldStartIndex, oldEndIndex);
      return true;
    } else {
      return false;
    }
  }

  shiftWindow(shiftAmount: number, noEventNotification: boolean = false): boolean {
    const oldStartIndex = this.startIndex;
    const oldEndIndex = this.endIndex;

    if (super.shiftWindow(shiftAmount, noEventNotification)) {
      this._regenerateViewIfNeeded(oldStartIndex, oldEndIndex);
      return true;
    } else {
      return false;
    }
  }

  protected _modifyRenderingView(modification: () => void) {
    this.deactivateObservers();
    this.invoke(ScrollView.beforeRenderingViewUpdateEventName, this);

    modification();

    // allow current rendering view to be reused when RenderingStrategy has remained `NoAction`
    this._propertyManager.setPropertyValueSnapshotSilently(
      this._renderingStrategyProperty,
      RenderingStrategy.NoAction
    );
    this._propertyManager.setPropertyValueSnapshotSilently(this._shiftAmountProperty, 0);
    this._propertyManager.incrementPropertyValueSnapshotVersion(this._renderingViewProperty);
    this.invoke(ScrollView.afterRenderingViewUpdateEventName, this);
    this.activateObservers();
  }

  /**
   * Calculate element index from a scroll amount.
   *
   *    (scrollAmount - this.startFillerOffsetTop) / elementLength
   *
   * @param {number} [scrollAmount = this.scrollPosition] - How far scrolled from page top.
   */
  protected getElementIndexFromScrollAmount(scrollAmount: number = this._scrollPosition) {
    const position = Math.max(scrollAmount - this._startFillerOffset, 0);
    return bound(Math.floor(position / this._elementLength), 0, this._renderingView.length - 1);
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
    this._scrollPosition = this._elementLength * elementIndex + this._startFillerOffset + offset;
  }
}
