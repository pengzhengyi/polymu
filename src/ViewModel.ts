import { Prop } from './Abstraction';
import { DomFallthroughInstantiation, ForwardingPropertyDescriptor } from './Instantiation';
import { MutationReporter, MutationReporterCallback } from './MutationReporter';
import { v4 as uuid } from 'uuid';

/**
 * A function to create a ViewModel from a HTMLElement.
 * @see {@link ViewModel#constructor}.
 * @example A builder to create ViewModel abstraction for a `<p>` element
 *    `(element) => new ViewModel(element)`
 */
export type ViewModelBuilder = (
  element: HTMLElement,
  parent?: ViewModel,
  builders?: ViewModelBuilder | Array<ViewModelBuilder>
) => ViewModel;

/**
 * Different ways to patch current view model's element using another view model's element.
 *
 * @see {@link ViewModel#patchWithViewModel__}
 */
enum PatchModeForMatch {
  /**
   * reassign this view model's element to the other view model's element.
   *
   * NOTE:
   *    + This mode is most time and space efficient.
   *    + The other view model's element will have `identifier_` overwritten, additional setup is needed to preserve the `identifier_` of other view model's element
   */
  CreateAlias,

  /**
   * 1. use Node.CloneNode to create a clone of the other view model's element
   * 2. reassign this view model's element to the created clone
   *
   * NOTE: make a clone could be potentially expensive when the node has a large number of descendants
   */
  CloneNode,

  /**
   * Iterate over all JS properties from the other view model's element (for example, the properties of a `<input>` element including value, readOnly...), assign same property value to current view model's element
   *
   * NOTE:
   *
   *  + reassigning properties is usually expensive as just HTMLElement (the base type for other HTML element types like HTMLInputElement, HTMLSpanElement...) already has a very large number of properties
   *  + reassigning properties will copy over all properties, it could both overwrite existing properties or introduce new properties
   */
  ModifyProperties,
}

/**
 * ViewModel represents an Abstraction equivalent of HTMLElement in that:
 *
 *    + ViewModel can have DOM attributes and JS properties through forwarding
 *    + ViewModel has `parent_` and `_children` and is therefore hierarchical
 *
 * Different from HTMLElement, it has these additional capacities:
 *
 *    + watch the underlying DOM target for mutations
 *    + has a auto-generated `identifier_` that is automatically registered or revoked in the underlying DOM target
 *
 * @augments DomForwardingInstantiation
 */
export class ViewModel<
  TDomElement extends HTMLElement = HTMLElement
> extends DomFallthroughInstantiation<TDomElement> {
  /** parent view model where current view model exists as a child */
  parent_: ViewModel;

  /** every view model has a unique identifier */
  readonly identifier_: string;

  /**
   * If view model has a forwarding target (DOM element), then the view model identifier will also exists in the element's dataset:
   *
   *    `element.dataset[ViewModel.identifierDatasetName_]`
   */
  static readonly identifierDatasetName_ = 'identifier_';

  protected forwardingTo_: HTMLElement;

  /**
   * View models that are children of current view model.
   *
   * These view models may contain DOM elements that are also children of the DOM element contained by current view model. However, this double (ViewModel, DOM) parent-child relationship is not required. In fact, by disassociating View Model organization from DOM organization, a View Model can manage DOM elements at different regions of the document.
   */
  private _children: Array<ViewModel>;

  /**
   * A universal builder or an array of builders to create View Model from DOM elements.
   * If a single universal builder is provided, it will be seen as an infinite array repeating this builder.
   *
   * This array is hierarchical in that first builder is used to create child view model of current view model, second builder is used to creating child view model of current child view model, and so on...
   *
   * In other words, `_viewModelBuilders` is a set of blueprints for descendant view models.
   *
   * Since `_viewModelBuilders` is hierarchical, it also decides the emulation depth in `patchWithDOM__`. For example, suppose `_viewModelBuilders.length` is 2, then calling `patchWithDOM__` on a `element` will emulate this element's children and grandchildren.
   */
  private _viewModelBuilders: ViewModelBuilder | Array<ViewModelBuilder>;
  /**
   * @returns {ViewModelBuilder} A builder to create a child view model of current view model from a DOM element.
   */
  private get _childViewModelBuilder(): ViewModelBuilder {
    if (Array.isArray(this._viewModelBuilders)) {
      const builders = this._viewModelBuilders as Array<ViewModelBuilder>;
      if (builders.length === 0) {
        return null;
      }
      const builder = this._viewModelBuilders[0];
      return (element: HTMLElement) => builder(element, this, builders.slice(1));
    } else {
      const builder = this._viewModelBuilders as ViewModelBuilder;
      return (element: HTMLElement) => builder(element, this, builder);
    }
  }

  /** A mapping from identifier to child view model */
  private _identifierToChild: Map<string, ViewModel>;

  /** @see {@link MutationReporter:MutationReporter */
  private _mutationReporter: MutationReporter;

  /**
   * Exposes `this._children`
   * @public
   * @return The child view models of current view model.
   */
  get children_(): Array<ViewModel> {
    return this._children;
  }

  /**
   * Registers an array of ViewModel as current view model's child view models.
   *
   * These steps will be performed:
   *
   *    + previously bound child view models will have their `parent_` nullified
   *    + `this._children` will be replaced by the new array of ViewModel
   *    + `this._identifierToChild` will be replaced by a new Map where entries are from identifiers to new view models
   *    + every new child view model will have their `parent_` set to current view instance
   *
   * @public
   * @param {Array<ViewModel>} children - An array of child view models.
   */
  set children_(children: Array<ViewModel>) {
    if (this._children) {
      this._children.forEach((child) => (child.parent_ = null));
    }

    Object.defineProperty(this, '_children', {
      configurable: false,
      enumerable: false,
      value: children,
      writable: true,
    });

    Object.defineProperty(this, '_identifierToChild', {
      configurable: false,
      enumerable: false,
      value: new Map(),
      writable: true,
    });

    children.forEach((child) => {
      child.parent_ = this;
      this._identifierToChild.set(child.identifier_, child);
    });
  }

  /**
   * Creates a ViewModel instance.
   *
   * @public
   * @param {HTMLElement} forwardingTo - A DOM element to which access/modification operations are forwarded. {@link Instantiation:ForwardingInstantiation#constructor}
   * @param {MutationReporterCallback} [mutationReporterCallback] - A callback to be executed when desired mutation has been observed. If not specified, `this.onMutation__` will be invoked. {@link MutationReporter:MutationReporter#constructor}.
   * @param {ViewModel} [parent = null] - Parent view model of current view model. Null by default.
   * @param {Array<ViewModel>} [children = []] - View models that are children of current view model.
   * @param {Array<ViewModelBuilder>} [viewModelBuilders = []] - An array of builders to create View Model from DOM elements. This array is hierarchical in that first builder is suitable for create child view model of current view model, second builder is suitable for creating child view model of current child view model, and so on...
   * @constructs ViewModel
   */
  constructor(
    forwardingTo?: HTMLElement,
    callback?: MutationReporterCallback,
    parent: ViewModel = null,
    children: Array<ViewModel> = [],
    viewModelBuilders: ViewModelBuilder | Array<ViewModelBuilder> = []
  ) {
    super(forwardingTo);
    // redeclare identifier variable with same value to enforce proper access control
    Object.defineProperty(this, 'identifier_', {
      configurable: false,
      enumerable: false,
      value: uuid(),
      writable: false,
    });
    // reset the identfier value in dataset as its prior value is `undefined`
    this.forwardingTo_.dataset[ViewModel.identifierDatasetName_] = this.identifier_;

    Object.defineProperty(this, 'parent_', {
      configurable: false,
      enumerable: false,
      value: parent,
      writable: true,
    });
    this.children_ = children;
    Object.defineProperty(this, '_viewModelBuilders', {
      configurable: false,
      enumerable: false,
      value: viewModelBuilders,
      writable: true,
    });

    this.setMutationReporter__(callback ? callback : this.onMutation__.bind(this));
  }

  /**
   * Finds the first element that
   *
   *    + is a descendant of the `root`
   *    + has identifier value in dataset
   *    + matches the specified group of selectors.
   *
   * @public
   * @param {string} identifier - The unique view model identifier. A DOM element has a view model identifier only when it is the forwarding target of that view model.
   * @param {Document | DocumentFragment | Element} [root = document] - Where to initiate the search. The returned element must be a descendant of `root`.
   * @param {string} [selectors = ""] - A group of selectors to match the descendant elements of the `root` against.
   * @return {HTMLElement} The first element found which matches specified group of selectors and has the specified identifier value in dataset.
   */
  static getElementByIdentifier__(
    identifier: string,
    root: Document | DocumentFragment | Element = document,
    selectors: string = ''
  ): HTMLElement {
    return root.querySelector(
      `${selectors}[data-${ViewModel.identifierDatasetName_}="${identifier}"`
    );
  }

  /**
   * @public
   * @override
   * @description In addition to changing the forwarding target, this method will also remove the identifier from previous forwarding target's dataset (if exists) and add the identifier to the new forwarding target's dataset.
   */
  setForwardingTo__(forwardingTo: TDomElement) {
    if (this.forwardingTo_) {
      delete this.forwardingTo_.dataset[ViewModel.identifierDatasetName_];
    }
    super.setForwardingTo__(forwardingTo);
    if (this.forwardingTo_) {
      this.forwardingTo_.dataset[ViewModel.identifierDatasetName_] = this.identifier_;
    }
  }

  /**
   * Retrieves a child view model by its underlying element.
   *
   * @param {HTMLElement} element - An underlying element for a child view model.
   * @returns {ViewModel} Associated child view model.
   */
  getChildByElement__(element: HTMLElement): ViewModel {
    const identifier = element.dataset[ViewModel.identifierDatasetName_];
    return this._identifierToChild.get(identifier);
  }

  /**
   * Inserts a child view model to current view model at specified index.
   *
   * These steps will be performed:
   *
   *    + child view model's parent will be set to current view model
   *    + child view model will be inserted into `this._children` at specified index
   *    + a mapping from identifier to child view model will be added to `this._identifierToChild`
   *
   * Default to append child at end.
   *
   * @public
   * @param {ViewModel} child - A child view model to be inserted or a HTMLElement to be transformed into a child view model and inserted.
   * @param {number} index - Where the child view model should be inserted. Should be a valid number between [0, this._children.length] where 0 is equivalent of prepending to the start and `this._children.length` is equivalent to appending to the end.
   */
  insertChild__(child: ViewModel | HTMLElement, index: number = this._children.length) {
    let viewModel: ViewModel;
    if (child instanceof ViewModel) {
      viewModel = child;
    } else {
      /** @type HTMLElement */
      viewModel = this._childViewModelBuilder(child);
    }
    viewModel.parent_ = this;
    this._children.splice(index, 0, viewModel);
    this._identifierToChild.set(viewModel.identifier_, viewModel);
  }

  /**
   * Removes a child view model from current view model by its child index.
   *
   * These steps will be performed:
   *
   *    + view model at specified index in `this._children` will be removed
   *    + deleted child view model's `parent_` will be nullified
   *    + the mapping from identifier to deleted child view model will be removed from `this._identifierToChild`
   *
   * Note:
   *
   *    The removal is restricted to the view model layer. In other words, the removed view model might still contain a DOM element which is child of DOM element contained in current view model.
   *
   * @public
   * @param {number} index - The index of the child view model to be deleted. Should be in valid range -- [0, this._children.length)
   * @return {ViewModel} The deleted view model.
   */
  removeChildByIndex__(index: number): ViewModel {
    const [viewModel] = this._children.splice(index, 1);
    viewModel.parent_ = null;
    this._identifierToChild.delete(viewModel.identifier_);
    return viewModel;
  }

  /**
   * Removes a child view model from current view model.
   *
   * Finds the view model's child index and calls {@link ViewModel#removeChildByIndex__}.
   *
   * @param {ViewModel} viewModel - A view model to be deleted.
   * @return {ViewModel} The deleted view model.
   */
  removeChild__(viewModel: ViewModel): ViewModel {
    const index: number = this._children.indexOf(viewModel);
    if (index === -1) {
      return null;
    }
    return this.removeChildByIndex__(index);
  }

  /**
   * Removes a child view model from current view model by its identifier.
   *
   * Finds the view model by its identifier from `this._identifierToChild` and calls {@link ViewModel#removeChild__}.
   *
   * @param {string} identifier - The unique identifier of a view model to be deleted.
   * @return {ViewModel} The deleted view model.
   */
  removeChildByIdentifier__(identifier: string): ViewModel {
    const viewModel = this._identifierToChild.get(identifier);
    if (!viewModel) {
      return null;
    }
    return this.removeChild__(viewModel);
  }

  /**
   * Iterate over a range of child view models, applies an operation, and returns an array containing the result.
   *
   * Equivalent of `this._children.slice(begin, end).map(operation)`.
   *
   * @callback operation
   * @param {ViewModel} viewModel - The child view model to apply the operation.
   * @param {number} childIndex - The child index of the current child view model.
   * @param {number} rangeIndex - The sequential index of current child view model in the range where the operation is applied.
   * @returns {T} Result of applying the operation on a child view model.
   *
   * @public
   * @param operation - An operation to be applied to each child view model in the range.
   * @param {number} [start = 0] - Where to start applying operation.
   * @param {number} [end = this._children.length] - Before which to end applying operation. The child view model at `end` (if any) will not be applied operation.
   * @returns {Array<T>} The operation application result on the specified range of child view models.
   *
   * Some useful operations:
   *
   *    + @example
   *      @return {Array<HTMLElement>} DOM elements of view models in range
   *      extract view models' DOM element
   *      `(viewModel) => viewModel.element_`
   *    + @example
   *      @param {Node} node - A node whose child list will be replaced
   *      @return {Array<HTMLElement>} replaced DOM elements
   *      replace a node's children by view models' DOM elements
   *      `(viewModel, childIndex, rangeIndex) => node.replaceChild(viewModel.element_, node.children[rangeIndex])`
   *    + @example
   *      @param {Array<HTMLElement>} elements - An array of DOM elements to replace view models' original DOM elements
   *      @return {Array<HTMLElement>} Same as `elements`.
   *      change view models' DOM elements
   *      `(viewModel, childIndex, rangeIndex) => viewModel.element_ = elements[rangeIndex]`
   *    + @example
   *      @this ViewModel
   *      observe desired mutations on all DOM elements in child view models.
   *      `this.operateOnRange__(viewModel => this.observe__(viewModel.element_, ...))`
   */
  operateOnRange__<T>(
    operation: (viewModel: ViewModel, childIndex: number, rangeIndex: number) => T,
    start: number = 0,
    end: number = this._children.length
  ): Array<T> {
    const result: Array<T> = [];

    let rangeIndex = 0;
    for (let childIndex = start; childIndex < end; childIndex++, rangeIndex++) {
      result.push(operation(this._children[childIndex], childIndex, rangeIndex));
    }

    return result;
  }

  /**
   * Update current view model's elment using the other view model's element. This applies to the Match scenario described in `patchWithViewModel__`.
   *
   * @param {TDomElement} other - The HTML element of the other view model.
   * @param {PatchModeForMatch} [mode=PatchModeForMatch.CreateAlias] - Determines how to update current view model's HTML element.
   * @param {IterableIterator<Prop>} [properties] - An iterable of properties. This parameter is only used when `mode === PatchModeForMatch.ModifyProperties`. If not supplied, will update all properties exist in the other view model's HTML element.
   */

  private __patchSelf(
    other: TDomElement,
    mode = PatchModeForMatch.CreateAlias,
    properties?: IterableIterator<Prop>
  ) {
    switch (mode) {
      case PatchModeForMatch.CreateAlias:
        this.setForwardingTo__(other);
        break;
      case PatchModeForMatch.CloneNode:
        this.setForwardingTo__(other.cloneNode(true) as TDomElement);
        break;
      case PatchModeForMatch.ModifyProperties:
        if (properties) {
          for (const propName of properties) {
            if ((this as any)[propName] !== (other as any)[propName]) {
              (this as any)[propName] = (other as any)[propName];
            }
          }
        } else {
          for (const prop in other) {
            this.asDomElement__()[prop] = other[prop];
          }
        }
        break;
    }
  }

  /**
   * Updates current view model by another view model using the in-place-patch algorithm.
   *
   * From the following illustrations describing scenarios for different `_children` length, one can tell there are three potential scenarios:
   *
   *    + MATCH: there is a child view model and a matching child view model in `other`. In this case, `patchWithViewModel__` will recur on these two view models.
   *    + SURPLUS (append): there is a child view model in `other` that does not have a matching child view model in `this`. In this case, the child view model will be appended to `this._children`. If `noAttach` is false, the corresponding DOM element will also be appended to `this.element_`.
   *    + SURPLUS (remove): there is a child view model in `this` that does not have a matching child view model in `other`. In this case, the child view model will be removed from `this._children`. If `noDetach` is false, the corresponding DOM element will also be removed from `this.element_`.
   *
   *             MATCH
   *    this:  [ - - - ]
   *    other: [ - - - - - - - ]
   *                   SURPLUS (append)
   *
   *                   SURPLUS (remove)
   *    this:  [ - - - - - - - ]
   *    other: [ - - - ]
   *             MATCH
   *
   *
   * @param {ViewModel} other - An view model used to patch current view model.
   * @param {PatchModeForMatch} [mode=PatchModeForMatch.CreateAlias] - Determines how to update current view model's HTML element.
   * @param {boolean} [noDetach = true] - Whether surplus DOM elements of `this._children` will be removed from DOM tree.
   * @param {boolean} [noAttach = true] - Whether surplus DOM elements of `other._children` will be appended
   */
  patchWithViewModel__(
    other: ViewModel,
    mode = PatchModeForMatch.CreateAlias,
    noDetach: boolean = true,
    noAttach: boolean = true
  ) {
    // patch self
    this.__patchSelf(other.element_ as TDomElement, mode);

    // patch children
    const numChildren = other._children.length;
    let childIndex = 0;
    for (const child of this._children) {
      if (childIndex < numChildren) {
        child.patchWithViewModel__(other._children[childIndex], mode, noDetach, noAttach);
      } else {
        // this view model surplus: remove
        this.removeChildByIndex__(childIndex);
        if (!noDetach) {
          child.element_.remove();
        }
      }
      childIndex++;
    }

    // other view model surplus: append to the end
    for (; childIndex < numChildren; childIndex++) {
      const viewModel = other._children[childIndex];
      this.insertChild__(viewModel, childIndex);
      if (!noAttach) {
        this.element_.appendChild(viewModel.element_);
      }
    }
  }

  /**
   * Similar as {@link ViewModel#patchWithViewModel__} where current view model is updated by another DOM element using the in-place-patch algorithms.
   *
   * Note:
   *
   *    + If the current view model is a partial abstraction of the reference DOM element`other`, then the in-place-patch algorithm might run into live-editing:
   *      @example `other` has two child nodes, current view model is an abstraction of `other` but only has a child view model for the second child node. When calling `this.patchWithDOM__(other)`, second child node will be live edited (because of property forwarding): its registered properties wll be set to those of first child node.
   *
   *      To avoid live-editing caused by property forwarding, one can use a cloned node as the reference node
   *      `this.patchWithDOM__(this.element_.cloneNode(true))`
   *
   * @param {HTMLElement} other - A HTML element used to patch current view model.
   * @param {PatchModeForMatch} [mode=PatchModeForMatch.CreateAlias] - Determines how to update current view model's HTML element.
   * @param {boolean} [noDetach = true] - Whether surplus DOM elements of `this._children` will be removed from DOM tree.
   * @param {boolean} [noAttach = true] - Whether surplus DOM elements of `other.children` will be appended
   */
  patchWithDOM__(
    other: TDomElement,
    mode = PatchModeForMatch.CreateAlias,
    noDetach: boolean = true,
    noAttach: boolean = true
  ) {
    // patch self
    this.__patchSelf(other, mode);

    // patch children
    this.patchChildViewModelsWithDOMElements__(other.children, mode, noDetach, noAttach);
  }

  /**
   * Patches the child view models of current view model using an array of DOM elements. In-place-patch algorithm as documented in {@link ViewModel#patchWithViewModel__} will be used.
   *    + If the current view model is a partial abstraction of the reference DOM element`other`, then the in-place-patch algorithm might run into live-editing:
   *      @example `other` has two child nodes, current view model is an abstraction of `other` but only has a child view model for the second child node. When calling `this.patchWithDOM__(other)`, second child node will be live edited (because of property forwarding): its registered properties wll be set to those of first child node.
   *
   * @param {Array<HTMLElement>} elements - An array of DOM elements to patch curent child view models.
   * @param {PatchModeForMatch} [mode=PatchModeForMatch.CreateAlias] - Determines how to update current view model's HTML element.
   * @param {boolean} [noDetach = true] - Whether surplus DOM elements of `this._children` will be removed from DOM tree.
   * @param {boolean} [noAttach = true] - Whether surplus DOM elements of `other.children` will be appended
   */
  patchChildViewModelsWithDOMElements__(
    elements: Array<HTMLElement> | HTMLCollection,
    mode = PatchModeForMatch.CreateAlias,
    noDetach: boolean = true,
    noAttach: boolean = true
  ) {
    // patch children
    const numChildren = elements.length;
    let childIndex = 0;
    for (const child of this._children) {
      if (childIndex < numChildren) {
        child.patchWithDOM__(elements[childIndex] as HTMLElement, mode, noDetach, noAttach);
      } else {
        // this view model surplus: remove
        this.removeChildByIndex__(childIndex);
        if (!noDetach) {
          child.element_.remove();
        }
      }
      childIndex++;
    }

    if (Array.isArray(this._viewModelBuilders) && this._viewModelBuilders.length === 0) {
      // stop because no blueprints exist for child view model
      return;
    }

    // other view model surplus: add
    for (; childIndex < numChildren; childIndex++) {
      const child = elements[childIndex] as HTMLElement;
      const viewModel = this._childViewModelBuilder(child);
      this.insertChild__(viewModel, childIndex);
      if (!noAttach) {
        this.element_.appendChild(viewModel.element_);
      }
    }
  }

  /**
   * Creates a MutationReporter with a callback that responds to changes happening to current ViewModel instance.
   *
   * Calling this method after a MutationReporter has been bound to current instance will recreate the MutationReporter. Previous bound MutationReporter will be disconnected.
   *
   * @public
   * @param {MutationReporterCallback} callback - The callback to be invoked when mutations are observed. It will be invoked with `this` bound to current view model.
   */
  setMutationReporter__(callback: MutationReporterCallback) {
    if (this._mutationReporter) {
      this._mutationReporter.disconnect();
    }

    Object.defineProperty(this, '_mutationReporter', {
      configurable: false,
      enumerable: false,
      value: new MutationReporter(callback),
      writable: true,
    });
  }

  /**
   * Default callback for observed mutations -- report each mutation as its corresponding event and update view model children on child list change.
   *
   * @see {@link MutationReporter:MutationReporterCallback}
   */
  protected onMutation__(
    mutations: Array<MutationRecord>,
    observer: MutationObserver,
    originalMutations: Array<MutationRecord>,
    reporter: MutationReporter
  ) {
    reporter.report(mutations);
    if (mutations.some((mutation) => mutation.type === 'childList')) {
      // update child view models
      this.patchWithDOM__(this.element_);
    }
  }

  /**
   * Let the bound MutationReporter observe target mutations according to provided options.
   *
   *    + See more about config options from {@link MutationReporter:MutationReporter.createMutationObserverInit}.
   *    + See more about observe from {@link https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/observe}
   */
  observe__(
    target: Node,
    shouldObserveAttributes: boolean,
    attributeFilter: Array<string>,
    shouldObserveCharacterData: boolean,
    shouldObserveChildList: boolean,
    shouldObserveSubtree: boolean
  ) {
    const options = MutationReporter.createMutationObserverInit(
      shouldObserveAttributes,
      shouldObserveCharacterData,
      shouldObserveChildList,
      shouldObserveSubtree,
      attributeFilter
    );
    this._mutationReporter.observe(target, options);
  }

  /** @see {@link MutationReporter:MutationReporter#unobserve} */
  unobserve__(target: Node) {
    this._mutationReporter.unobserve(target);
  }

  /** @see {@link MutationReporter:MutationReporter#reconnectToExecute} */
  reconnectToExecute__(callback: () => void) {
    this._mutationReporter.reconnectToExecute(callback);
  }
}
