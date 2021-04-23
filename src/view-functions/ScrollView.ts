/**
 * @module
 *
 * This module provides a `ScrollView` which represents a view transformation which selects a "window" of the source view while other region of the source view can be accessible through scrolling on the screen.
 *
 * This `ScrollView` extends upon `PartialView` by establishing a synergy between elements that are rendered in the window (inside the DOM tree) and elements in target view.
 *
 *      + When scrolling happens, the window will be shifted accordingly
 *      + When the window is updated, rendered elements will be replaced accordingly
 *
 * From another perspective, `ScrollView` can be split into a `SyncView` and a `ScrollHandler`.
 *
 *    + The former updates the DOM tree whenever its target view changes: for example, if its target view updates from empty to 100 elements, all 100 elements will be appended to the target node.
 *    + The latter responds to Scroll Event so that whenever page is scrolled and different content should be displayed, it appropriately updates the target view for `SyncView` which will then refresh the rendering view.
 */

import { CircularArray } from '../collections/CircularArray';
import { Collection } from '../collections/Collection';
import { IFeatureProvider } from '../composition/composition';
import { Property, PropertyManager, UpdateBehavior } from '../composition/property-management';
import { fillerClass, startFillerClass, endFillerClass } from '../constants/css-classes';
import { IntersectionObserverOptions } from '../dom/IntersectionObserver';
import {
  getScrollParent,
  isScrollDirectionTowardsStart,
  isScrollDirectionTowardsEnd,
  ScrollDirection,
} from '../dom/scroll';
import { debounceWithCooldown } from '../utils/debounce';
import { bound } from '../utils/math';
import { ViewElement } from '../view-element/ViewElement';
import { ViewElementChildListMutationReporter } from '../views/ViewElementChildListMutationReporter';
import { PartialView } from './PartialView';

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
export class ScrollView<TViewElement, TDomElement extends HTMLElement>
  extends PartialView<TViewElement>
  implements IFeatureProvider {
  /** denotes the event that will be emitted before rendering view update, it will supply the current `ScrollView` */
  static readonly beforeRenderingViewUpdateEventName = 'beforeRenderingViewUpdate';
  /** denotes the event that will be emitted after rendering view update, it will supply the current `ScrollView` */
  static readonly afterRenderingViewUpdateEventName = 'afterRenderingViewUpdate';

  // a collection of property names to facilitate renaming by reducing appearances of raw string

  /** The property name for `_renderingStrategy` */
  protected static readonly _renderingStrategyPropertyName = '_renderingStrategy';
  /** The property name for `_shiftAmount` */
  protected static readonly _shiftAmountPropertyName = '_shiftAmount';
  /** The property name for `_renderingView` */
  protected static readonly _renderingViewPropertyName = '_renderingView';
  /** The property name for `_target` */
  protected static readonly _targetPropertyName = '_target';
  /** The property name for `_targetViewElement` */
  protected static readonly _targetViewElementPropertyName = '_targetViewElement';
  /** The property name for `_scrollTarget` */
  protected static readonly _scrollTargetPropertyName = '_scrollTarget';
  /** The property name for `_scrollAxis` */
  protected static readonly _scrollAxisPropertyName = '_scrollAxis';
  /** The property name for `_lastScrollPosition` */
  protected static readonly _lastScrollPositionPropertyName = '_lastScrollPosition';
  /** The property name for `_elementLength` */
  protected static readonly _elementLengthPropertyName = '_elementLength';
  /** The property name for `_startFillerElement` */
  protected static readonly _startFillerElementPropertyName = '_startFillerElement';
  /** The property name for `_startFillerLength` */
  protected static readonly _startFillerLengthPropertyName = '_startFillerLength';
  /** The property name for `_startFillerOffset` */
  protected static readonly _startFillerOffsetPropertyName = '_startFillerOffset';
  /** The property name for `_endFillerElement */
  protected static readonly _endFillerElementPropertyName = '_endFillerElement';
  /** The property name for `_endFillerLength` */
  protected static readonly _endFillerLengthPropertyName = '_endFillerLength';

  /** @implements {IFeatureProvider} Methods that should be exposed since they define the API for `PartialView` */
  features: Array<string> = ['setWindow', 'shiftWindow', 'scrollToElementIndex'];

  /**
   * A ` PropertyManager` that manages the interdependencies of ScrollView properties.
   *
   * For example, it updates rendering view when the target view changes.
   */
  protected _propertyManager: PropertyManager;

  /**
   * Decides whether it is necessary and how this `ScrollView` will update its rendering view.
   */
  protected _renderingStrategy: RenderingStrategy;
  /**
   * A property that describes `_renderingStrategy`.
   */
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

  /**
   * Provides supportive information indicating how far the hypothetical new rendering view has deviated from the current rendering view. For example, a `_shiftAmount` of 5 indicates the new rendering view's first element is the current rendering view's fifth element.
   *
   * `_shiftAmount` is only meaningful when `_renderingStrategy` is Shift.
   */
  protected _shiftAmount: number;
  protected _shiftAmountProperty: Property<number> = new Property(
    ScrollView._shiftAmountPropertyName,
    (thisValue, manager) => manager.getPropertyValueSnapshot(thisValue),
    UpdateBehavior.Lazy,
    (oldValue, newValue, thisValue, manager) => {
      if (newValue) {
        if (this._renderingStrategy === RenderingStrategy.NoAction) {
          this._renderingStrategy = RenderingStrategy.Shift;
        }
      }

      manager.notifyValueChange(thisValue);
    }
  );

  /**
   * An underlying data structure that contain the rendering view.
   *
   * A circular array is used since it supports efficient implementation of shifting -- add/remove some elements from one end while remove/add same number of elements at the other end.
   */
  protected __circularArray: CircularArray<TDomElement>;
  /**
   * A collection of elements that consist of rendering view. These elements are also actual DOM elements that are children of `this._target`.
   *
   * Consequently, changes made to elements in this collection, for example, setting background color of second element in the collection to red, will be  equivalent to setting that of the second child of `this._target`.
   */
  protected _renderingView: Collection<TDomElement>;
  /**
   * A property that describes `_renderingView`. It decides how new rendering view will be generated and how the DOM tree is updated consequently.
   */
  protected _renderingViewProperty: Property<Collection<TDomElement>> = new Property(
    ScrollView._renderingViewPropertyName,
    (thisValue, manager) => {
      // The following dependencies are used in delegating calls to `handleReplaceRenderingStrategy__` and `handleShiftRenderingStrategy__` so they need to be hoisted here
      // Dependency Injection: manager.getPropertyValue('_shiftAmount');
      // Dependency Injection: manager.getPropertyValue('_target');
      const renderingStrategy: RenderingStrategy = manager.getPropertyValue('_renderingStrategy');

      switch (renderingStrategy) {
        case RenderingStrategy.NoAction:
          break;
        case RenderingStrategy.Replace:
          this.modifyRenderingView__(() => {
            this.handleReplaceRenderingStrategy__();
          });
          break;
        case RenderingStrategy.Shift:
          this.modifyRenderingView__(() => {
            this.handleShiftRenderingStrategy__();
          });
          break;
      }
      return this.__circularArray;
    },
    UpdateBehavior.Immediate
  );

  /**
   * The DOM container that holds the elements in rendering view .
   *
   * @see {@link ScrollViewConfiguration#target}
   */
  protected _target: HTMLElement;
  /**
   * A property that describes `_target`.
   */
  protected _targetProperty: Property<HTMLElement> = new Property(
    ScrollView._targetPropertyName,
    // `_target` is "prerequisite free": it is a leaf node in prerequisite graph as its value is modified through exposed setter
    (_, manager) => manager.getPropertyValueSnapshotWithName(ScrollView._targetPropertyName),
    UpdateBehavior.Lazy
  );

  /**
   * An observer that monitors child list mutations happening to the `this._target`.
   */
  protected _targetChildListMutationReporter: ViewElementChildListMutationReporter;

  /**
   * A `ViewElement` whose underlying element is `this._target`
   */
  protected _targetViewElement: ViewElement;
  /**
   * A property that describes `_targetViewElement`. Its value is dependent on `_target`.
   */
  protected _targetViewElementProperty: Property<ViewElement> = new Property(
    ScrollView._targetViewElementPropertyName,
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

      return new ViewElement(target, [(element) => new ViewElement(element)]);
    },
    UpdateBehavior.Immediate,
    (oldValue, newValue, thisValue, manager) => {
      if (oldValue) {
        this._targetChildListMutationReporter.dispose();
      }

      if (newValue) {
        this._targetChildListMutationReporter = new ViewElementChildListMutationReporter(newValue);
        this._targetChildListMutationReporter.observe();
      }

      manager.notifyValueChange(thisValue);
    }
  );

  /** A HTMLElement that constitutes the scrolling area, inside which the scroll bar will be rendered */
  protected _scrollTarget: HTMLElement;
  /**
   * A property that describes `_scrollTarget`. Its value is dependent on `_target`.
   */
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
   * A property that describes `_scrollAxis` -- The monitoring axis of current scroll handler. When scroll target changes, it will be decided by detecting the presence of scrollbar.
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
  protected _lastScrollPosition = 0;
  /**
   * A property describes `_lastScrollPosition`. For first-time retrieval and every time scroll axis has changed, 0 will be returned. In other cases, `shouldReuseLastValue` will evaluate to true and the value set in `_scrollDirection` will be used.
   */
  protected _lastScrollPositionProperty: Property<number> = new Property(
    ScrollView._lastScrollPositionPropertyName,
    (thisValue, manager) => {
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
  /**
   * Change the current scroll position. Page will be scrolled as a result.
   *
   * @param {number} position - A new scroll position.
   */
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
        if (viewElement instanceof ViewElement) {
          return viewElement.element_ as TDomElement;
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
   *
   * TODO @todo Measure element width individually.
   */
  protected _elementLength: number;
  /**
   * A property that describes the behavior of `_elementLength`. It describes how `_elementLength` will be computed from rendered view and scroll axis.
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
        const propName = scrollAxis === ScreenAxis.Vertical ? 'offsetHeight' : 'offsetWidth';
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
   * A filler element to
   *
   *    + emulate full length of the target view
   *    + detect whether a window update is necessary (an update is necessary when filler appears within view)
   *
   * As the start filler (first, topmost or leftmost), it will emulate the length of elements not rendered before the target view.
   *
   * Filler elements serves as special guard nodes: when they appear in view -- blank section is appearing in the viewport, a target view update is necessary to refill the viewport with content.
   */
  protected _startFillerElement: HTMLElement;
  /**
   * A property that describes the behavior of `_startFillerElement`.
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

      return this.createFillerElementIfTargetIsDefined__(target, true);
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

  /**
   * The length of the start filler in `this.scrollAxis`.
   */
  protected _startFillerLength: number;
  /**
   * A property that describes the behavior of `_startFillerLength`.
   */
  protected _startFillerLengthProperty: Property<number> = new Property(
    ScrollView._startFillerLengthPropertyName,
    (thisValue, manager) => {
      // Dependency Injection: manager.getPropertyValue('_renderingView');
      const renderingViewVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._renderingViewPropertyName
      );
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
          ScrollView._renderingViewPropertyName,
          renderingViewVersion
        ) &&
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
   * A property that describes the behavior of `_startFillerOffset`.
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

      // offset is computed as cumulative offset of all scroll parents until the desired scroll target of start filler element
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
   *
   * Filler elements serves as special guard nodes: when they appear in view -- blank section is appearing in the viewport, a target view update is necessary to refill the viewport with content.
   */
  protected _endFillerElement: HTMLElement;
  /**
   * A property that describes the behavior of `_endFillerElement`.
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

      return this.createFillerElementIfTargetIsDefined__(target, false);
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

  /**
   * The length of the end filler in `this.scrollAxis`.
   */
  protected _endFillerLength: number;
  /**
   * A property that describes the behavior of `_endFillerLength`.
   */
  protected _endFillerLengthProperty: Property<number> = new Property(
    ScrollView._endFillerLengthPropertyName,
    (thisValue, manager) => {
      // Dependency Injection: manager.getPropertyValue('_renderingView');
      const renderingViewVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._renderingViewPropertyName
      );
      // Dependency Injection: manager.getPropertyValue('_endFillerElement');
      const endFillerElementVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._endFillerElementPropertyName
      );
      // Dependency Injection: manager.getPropertyValue('_elementLength');
      const elementLengthVersion = manager.getPropertyValueSnapshotVersionWithName(
        ScrollView._elementLengthPropertyName
      );

      thisValue.shouldReuseLastValue = (_thisValue, manager) =>
        manager.isSnapshotVersionUpToDate(
          ScrollView._renderingViewPropertyName,
          renderingViewVersion
        ) &&
        manager.isSnapshotVersionUpToDate(
          ScrollView._endFillerElementPropertyName,
          endFillerElementVersion
        ) &&
        manager.isSnapshotVersionUpToDate(
          ScrollView._elementLengthPropertyName,
          elementLengthVersion
        );

      return this.estimateEndFillerLength__();
    },
    UpdateBehavior.Immediate,
    (_, newValue, thisValue, _manager) => {
      if (newValue !== undefined && newValue !== null) {
        const propName = this._scrollAxis === ScreenAxis.Vertical ? 'height' : 'width';
        this._endFillerElement.style[propName] = `${newValue}px`;
      }

      _manager.notifyValueChange(thisValue);
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
      this._targetViewElementProperty,
      this._scrollTargetProperty,
      this._scrollAxisProperty,
      this._lastScrollPositionProperty,
      this._elementLengthProperty,
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

    this.initializeScrollEventListener__();
    this.initializeFillerObservers__(
      options.startFillerObserverOptions,
      options.endFillerObserverOptions
    );
    this.initializeSentinelObservers__(
      options.startSentinelObserverOptions,
      options.endSentinelObserverOptions
    );

    this.activateObservers__();
  }

  /**
   * Initializes a scroll event listener bounds to `this.scrollTarget`.
   *
   * This listener will calculate the index that **should** appear in current target view using the scroll position. If the index does not appear in current target view, reset the window to update the target view.
   *
   * @listens ScrollEvent
   */
  protected initializeScrollEventListener__(): void {
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
          const startIndex = this.getElementIndexFromScrollAmount__();
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
   * Guess the HTML tag name for filler element given its container's HTML tag name.
   *
   * @param containerTagName - The HTML tag name for filler element's container.
   * @returns Guessed tag name for filler element.
   * @example If the container of filler element is a ordered list (ol), then filler element will be a list item (li).
   */
  protected guessFillerTagName__(containerTagName: string): string {
    let tagName = 'div';
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
  protected initializeFillerObservers__(
    startFillerOptions?: IntersectionObserverOptions,
    endFillerOptions?: IntersectionObserverOptions
  ): void {
    this._startFillerObserver = new IntersectionObserver(
      (entries) => this.fillerReachedHandler__(entries),
      startFillerOptions
    );
    this._endFillerObserver = new IntersectionObserver(
      (entries) => this.fillerReachedHandler__(entries),
      endFillerOptions
    );
  }

  /**
   * Initializes the IntersectionObserver for both sentinels.
   *
   * @param {IntersectionObserverOptions} [startSentinelOptions] - A configuration object for start sentinel's IntersectionObserver.
   * @param {IntersectionObserverOptions} [endSentinelOptions] - A configuration object for end sentinel's IntersectionObserver.
   */
  protected initializeSentinelObservers__(
    startSentinelOptions?: IntersectionObserverOptions,
    endSentinelOptions?: IntersectionObserverOptions
  ): void {
    this._startSentinelObserver = new IntersectionObserver(
      (entries) => this.sentinelReachedHandler__(entries),
      startSentinelOptions
    );
    this._endSentinelObserver = new IntersectionObserver(
      (entries) => this.sentinelReachedHandler__(entries),
      endSentinelOptions
    );
  }

  /**
   * Create a filler element if target is defined.
   *
   * @param target - A DOM target used to hold mounted view elements. Filler element will be inserted as its previous/next sibling. When `target` is `undefined`, no filler element will be created.
   * @param isStartFiller - If true, start filler element will be created which will be inserted before the target. Otherwise, end filler element will be created which will be inserted after the target.
   * @returns - The created filler element.
   */
  protected createFillerElementIfTargetIsDefined__(
    target: HTMLElement,
    isStartFiller: boolean
  ): HTMLElement {
    if (target === undefined) {
      return undefined;
    }

    return this.createFillerElement__(target, isStartFiller);
  }

  /**
   * Create a filler element.
   *
   * @param target - A DOM target used to hold mounted view elements. Filler element will be inserted as its previous/next sibling.
   * @param isStartFiller - If true, start filler element will be created which will be inserted before the target. Otherwise, end filler element will be created which will be inserted after the target.
   * @returns - The created filler element.
   */
  protected createFillerElement__(target: HTMLElement, isStartFiller: boolean): HTMLElement {
    const tagName = this.guessFillerTagName__(target.parentElement.tagName);
    const fillerElement = document.createElement(tagName);

    const additionalFillerClass = isStartFiller ? startFillerClass : endFillerClass;
    fillerElement.classList.add(fillerClass, additionalFillerClass);

    // insert filler element as a sibling of target
    if (isStartFiller) {
      target.before(fillerElement);
    } else {
      target.after(fillerElement);
    }

    return fillerElement;
  }

  /**
   * Estimate the length of end filler. This length is used to emulate full scroll height.
   *
   * @returns The estimated length for the end filler.
   */
  protected estimateEndFillerLength__(): number {
    const elementLength = this._elementLength;

    if (elementLength === undefined || elementLength === null) {
      return 0;
    }

    let numElementAfter = this.numElementAfter;
    if (numElementAfter === undefined || numElementAfter === null) {
      // though we do not know whether there are any elements after rendered view, since there might be elements, we still reserve some area for scroll.
      numElementAfter = 2 * this.windowSize;
    }

    return elementLength * numElementAfter;
  }

  /**
   * When rendering strategy is `Replace`, new rendering view should be generated from target view without utilizing previous rendering view.
   *
   * `handleReplaceRenderingStrategy__` will be responsible for creating the new rendering view and mount it to the DOM.
   */
  protected handleReplaceRenderingStrategy__(): void {
    const targetView: Collection<TViewElement> = this._targetView;
    const target: HTMLElement = this._propertyManager.getPropertyValue('_target');
    const convert = this._convert;
    const scrollPosition = this._scrollPosition;

    if (this.__circularArray === undefined) {
      // a heuristic to set the initial capacity for circular array
      const capacity =
        targetView.length || ((targetView as any).materializationLength as number) || 1000;
      this.__circularArray = new CircularArray(capacity);
    }

    /**
     * Since `replaceWith` might be called to replace a child of target with another child of target, `target.childElementCount` might change unexpectedly
     */
    const existingElements = target.children;
    let newElementCount = 0;
    this.__circularArray.fit(
      (function* () {
        for (const viewElement of targetView) {
          yield convert(viewElement);
        }
      })(),
      undefined,
      (element, index) => {
        newElementCount++;
        const existingElement = existingElements[index];
        if (existingElement) {
          existingElement.replaceWith(element);
        } else {
          target.appendChild(element);
        }
      }
    );

    // remove surplus elements
    const existingElementCount = target.childElementCount;
    let numSurplusElementCount = existingElementCount - newElementCount;
    for (; numSurplusElementCount > 0; numSurplusElementCount--) {
      target.lastElementChild.remove();
    }

    this._scrollPosition = scrollPosition;
  }

  /**
   * When rendering strategy is `Shift`, new rendering view can be generated by "shifting" the previous rendering view -- replacing some elements at the beginning or end with some new elements added to the end or beginning.
   *
   * `handleShiftRenderingStrategy__` will be responsible for creating the new rendering view and mount it to the DOM.
   */
  protected handleShiftRenderingStrategy__(): void {
    console.assert(
      this.__circularArray === undefined || !this.__circularArray.isFull,
      'invalid circular array state when performing shift in target view'
    );
    const shiftAmount: number = this._propertyManager.getPropertyValue('_shiftAmount');

    if (shiftAmount > 0) {
      this.handleShiftRenderingStrategyWhenShiftTowardsEnd__(shiftAmount);
    } else if (shiftAmount < 0) {
      this.handleShiftRenderingStrategyWhenShiftTowardsStart__(shiftAmount);
    }
  }

  /**
   * @param shiftAmount - A negative shift amount indicating by how many elements the current view window should shift towards the start. More specifically, it indicates how many elements should be inserted up front and how many elements should be removed from the end.
   */
  protected handleShiftRenderingStrategyWhenShiftTowardsStart__(shiftAmount: number): void {
    const targetView: Collection<TViewElement> = this._targetView;
    const target: HTMLElement = this._propertyManager.getPropertyValue('_target');
    const convert = this._convert;

    let lastInsertedElement: TDomElement;
    const onEnter = (element: TDomElement, windowIndex: number) => {
      if (windowIndex === 0) {
        // inserting first element
        target.prepend(element);
      } else {
        // inserting other element
        lastInsertedElement.after(element);
      }
      lastInsertedElement = element;
    };

    // update circular array based on `shiftAmount`
    this.__circularArray.shift(
      shiftAmount,
      (function* () {
        // shift towards start, first `shiftAmount` elements of `targetView` will be inserted
        for (const viewElement of targetView.slice(0, -shiftAmount)) {
          yield convert(viewElement);
        }
      })(),
      (element) => element.remove(),
      onEnter
    );
  }

  /**
   * @param shiftAmount - A positive shift amount indicating by how many elements the current view window should shift towards the end. More specifically, it indicates how many elements should be inserted at the end and how many elements should be removed from the start.
   */
  protected handleShiftRenderingStrategyWhenShiftTowardsEnd__(shiftAmount: number): void {
    const targetView: Collection<TViewElement> = this._targetView;
    const target: HTMLElement = this._propertyManager.getPropertyValue('_target');
    const convert = this._convert;

    const elementsToAppend: Array<TDomElement> = [];
    const onEnter = (element: TDomElement) => elementsToAppend.push(element);

    // update circular array based on `shiftAmount`
    this.__circularArray.shift(
      shiftAmount,
      (function* () {
        // shift towards end
        let numViewElement = targetView.length;
        if (numViewElement === undefined || numViewElement === null) {
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
      })(),
      (element) => element.remove(),
      onEnter
    );

    // force update on filler length here so that scroll position is correctly restored
    this._propertyManager.incrementPropertyValueSnapshotVersion(this._renderingViewProperty);
    this._startFillerLength;
    this._endFillerLength;

    elementsToAppend.forEach((element) => target.appendChild(element));
  }

  /**
   * Activates all IntersectionObserver to detect whether the target view needs to be updated.
   *
   * If the source view can fit within a window (`this.shouldPartialRender` is true), then IntersectionObserver will not be activated.
   * @public
   */
  protected activateObservers__(): void {
    /**
     * Whether the source view should be partially rendered -- a fixed window of the source view is rendered while other regions of the source view is accessible through scrolling.
     *
     * Source view will not be partially rendered if the number of elements in rendering view is smaller than the window size. In other words, source view can entirely fit in the window. In this scenario, scrolling will not result substitution of elements in the window (scroll monitoring will be turned off).
     */
    if (this.isWindowFull) {
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
  protected deactivateObservers__(): void {
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
  protected fillerReachedHandler__(entries: Array<IntersectionObserverEntry>): void {
    entries.forEach((entry) => {
      if (
        entry.isIntersecting &&
        /* short circuit scenario when at the container top */ entry.intersectionRect.height > 0
      ) {
        const newStartIndex = this.getElementIndexFromScrollAmount__();
        const shiftAmount = newStartIndex - this.startIndex;
        this.shiftWindow(shiftAmount);
      }
    });
  }

  /**
   * Called when a sentinel is reached, which indicates a view update might be necessary as the user has scrolled past most of rendered view elements.
   *
   * @callback
   * @param {Array<IntersectionObserverEntry>} entries - An array of IntersectionObserver entries.
   */
  protected sentinelReachedHandler__(entries: Array<IntersectionObserverEntry>): void {
    let shiftAmount = Math.floor(this.windowSize / 2);
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
        shiftAmount = shiftTowardsStart ? -shiftAmount : shiftAmount;
        this.shiftWindow(shiftAmount);
      }
    });
  }

  /**
   * Regenerate rendering view if needed. This method will choose to update rendering view using replacement or more efficient shifting.
   *
   * @param oldStartIndex - Previous start index. Used to determine by what amount start index has changed.
   * @param oldEndIndex - Previous end index. Used to determine by what amount end index has changed.
   */
  protected regenerateViewIfNeeded__(oldStartIndex: number, oldEndIndex: number): void {
    const startIndexShiftAmount: number = this.startIndex - oldStartIndex;
    const endIndexShiftAmount: number = this.endIndex - oldEndIndex;
    const hasSameShiftAmount: boolean =
      Number.isInteger(startIndexShiftAmount) && startIndexShiftAmount === endIndexShiftAmount;

    // rendering strategy and shift amount are updated silently (not triggering immediate update) as consequential value update is delegated to subsequent call to `regenerateView`.
    if (hasSameShiftAmount && this._renderingStrategy === RenderingStrategy.NoAction) {
      // can be treated as shift operation
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

  /**
   * @override
   */
  protected regenerateView(sourceView: Collection<TViewElement>, useCache: boolean): void {
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
       * When rendering view is up to date, rendering strategy will be `NoAction`. Since there exists an dissymmetry between these two values, this implies a necessary rendering view update is suppressed where rendering strategy and possibly shift amount is silently updated. Therefore, the delayed update should occur here.
       */
      this._propertyManager.notifyValueChange(this._renderingStrategyProperty);
    }
  }

  /**
   * Modify the rendering view. This method takes care of necessary setting up and tearing down procedures before updating rendering view, for example, turn off and turn back on the monitoring.
   *
   * @param modification - A callback that updates the rendering view.
   */
  protected modifyRenderingView__(modification: () => void): void {
    const shouldMuteMutationReporter = this._targetChildListMutationReporter !== undefined;

    this.deactivateObservers__();
    this.invoke(ScrollView.beforeRenderingViewUpdateEventName, this);
    shouldMuteMutationReporter && this._targetChildListMutationReporter.unobserve();

    modification();

    shouldMuteMutationReporter && this._targetChildListMutationReporter.observe();
    // allow current rendering view to be reused when RenderingStrategy has remained `NoAction`
    this._propertyManager.setPropertyValueSnapshotSilently(
      this._renderingStrategyProperty,
      RenderingStrategy.NoAction
    );
    this._propertyManager.setPropertyValueSnapshotSilently(this._shiftAmountProperty, 0);
    this._propertyManager.incrementPropertyValueSnapshotVersion(this._renderingViewProperty);
    // force update notification since `this.__circularArray` is a reference and will not trigger update by default
    this._renderingViewProperty.onValueUpdate(
      undefined,
      this.__circularArray,
      this._renderingViewProperty,
      this._propertyManager
    );
    this.invoke(ScrollView.afterRenderingViewUpdateEventName, this);
    this.activateObservers__();
  }

  /**
   * Calculate element index from a scroll amount.
   *
   *    (scrollAmount - this.startFillerOffsetTop) / elementLength
   *
   * @param {number} [scrollAmount = this.scrollPosition] - How far scrolled from page top.
   */
  protected getElementIndexFromScrollAmount__(scrollAmount: number = this._scrollPosition): number {
    const position = Math.max(scrollAmount - this._startFillerOffset, 0);
    const estimatedElementIndex = Math.floor(position / this._elementLength);

    const numViewElement = this.lastSourceView.length;
    if (numViewElement) {
      return bound(estimatedElementIndex, 0, numViewElement - 1);
    } else {
      return Math.max(estimatedElementIndex, 0);
    }
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
  scrollToElementIndex(elementIndex: number, offset = 0): void {
    this._scrollPosition = this._elementLength * elementIndex + this._startFillerOffset + offset;
  }

  /**
   * @override
   */
  setWindow(startIndex: number = this.startIndex, endIndex: number = this.endIndex): boolean {
    const oldStartIndex = this.startIndex;
    const oldEndIndex = this.endIndex;

    if (super.setWindow(startIndex, endIndex, true)) {
      this.regenerateViewIfNeeded__(oldStartIndex, oldEndIndex);
      return true;
    } else {
      return false;
    }
  }

  /**
   * @override
   */
  shiftWindow(shiftAmount: number): boolean {
    const oldStartIndex = this.startIndex;
    const oldEndIndex = this.endIndex;

    if (super.shiftWindow(shiftAmount, true)) {
      this.regenerateViewIfNeeded__(oldStartIndex, oldEndIndex);
      return true;
    } else {
      return false;
    }
  }
}
