import { Prop } from '../Abstraction';
import { DomFallthroughInstantiation } from '../Instantiation';
import { MutationReporter, MutationReporterCallback } from '../dom/MutationReporter';
import { v4 as uuid } from 'uuid';
import { patch } from '../utils/IterableHelper';

/**
 * A function to create a VieElement from a HTMLElement.
 * @see {@link ViewElement#constructor}.
 * @example A example factory to create a ViewElement from a `<p>` element would be
 *    `(element) => new ViewElement(element)`
 */
export type ViewElementFactory = (
  element: HTMLElement,
  parent?: ViewElement,
  builders?: ViewElementFactory | Array<ViewElementFactory>
) => ViewElement;

/**
 * Different ways to patch current view element's dom element using another view element's dom element.
 *
 * @see {@link ViewElement#patchWithViewElement__}
 */
export enum PatchModeForMatch {
  /**
   * reassign this view element's dom element to the other view element's dom element.
   *
   * NOTE:
   *    + This mode is most time and space efficient.
   *    + The other view element's dom element will have `identifier_` overwritten to that of this view element, additional setup is needed to preserve the `identifier_` of other view element's dom element
   */
  CreateAlias,

  /**
   * 1. use Node.CloneNode to create a clone of the other view element's dom element
   * 2. reassign this view element's dom element to the created clone
   *
   * NOTE: make a clone could be potentially expensive when the node has a large number of descendants
   */
  CloneNode,

  /**
   * Iterate over all JS properties from the other view element's dom element (for example, the properties of a `<input>` element including value, readOnly...), assign same property value to current view element's dom element
   *
   * NOTE:
   *
   *  + reassigning properties is usually expensive as even HTMLElement (the base type for other HTML element types like HTMLInputElement, HTMLSpanElement...) already has a very large number of properties
   *  + reassigning properties will copy over all properties, it could both overwrite existing properties or introduce new properties
   */
  ModifyProperties,
}

/**
 * ViewElement represents an Abstraction equivalent of HTMLElement in that:
 *
 *    + ViewElement can have DOM attributes and JS properties through forwarding
 *    + VieElement has `parent_` and `_children` and is therefore hierarchical
 *
 * In concept, ViewElement can be thought as an encapsulation of HTMLElement providing these additional capacities:
 *
 *    + watch the underlying DOM target for mutations
 *    + has a auto-generated `identifier_` that is automatically registered or revoked in the underlying DOM target
 *
 * @augments DomForwardingInstantiation
 */
export class ViewElement<
  TDomElement extends HTMLElement = HTMLElement
> extends DomFallthroughInstantiation<TDomElement> {
  /** parent view element where current view element exists as a child */
  parent_: ViewElement;

  /** every view element has a unique identifier */
  readonly identifier_: string;

  /**
   * If view element has a forwarding target (DOM element), then the view element identifier will also exists in the element's dataset:
   *
   *    `element.dataset[ViewElement.identifierDatasetName_]`
   */
  static readonly identifierDatasetName_ = 'identifier_';

  /**
   * @override Provide more accurate type annotation.
   */
  protected forwardingTo_: TDomElement;

  /**
   * View elements that are children of current view element.
   *
   * These view elements may contain DOM elements that are also children of the DOM element contained by current view element. However, this double (ViewElement, DOM) parent-child relationship is not required. In fact, by disassociating ViewElement organization from DOM organization, a ViewElement can manage DOM elements at different regions of the document.
   *
   * @example Imagine a news site which might be divided into two sections: international news and domestic news. It is reasonable that we want operations to apply to all the news across both sections, for example, display only today's news or only news in sports. Using a ViewElement whose direct children are news from both sections will facilitate such operations. And in this scenario, DOM hierarchy is different from ViewElement hierarchy.
   */
  private _children: Array<ViewElement>;

  /**
   * A universal factory or an array of factory methods to create View Element from DOM elements.
   *
   * If a single universal factory method is provided, it will be seen as an infinite array repeating this factory method.
   *
   * This array is hierarchical in that first factory method is used to create child ViewElement of current ViewElement, second builder is used to creating child ViewElement of current child ViewElement, and so on...
   *
   * In other words, `_viewElementBuilders` is a set of blueprints for descendant ViewElement.
   *
   * Since `_viewElementBuilders` is hierarchical, it also decides the emulation depth in `patchWithDOM__`. For example, suppose `_viewElementBuilders.length` is 2, then calling `patchWithDOM__` on a `element` will emulate this element's children and grandchildren.
   */
  private _viewElementFactories: ViewElementFactory | Array<ViewElementFactory>;

  /**
   * @returns {ViewElementFactory} A factory method to create a ViewElement from a DOM element that can be registered as direct children of current ViewElement.
   */
  private get _childViewElementFactory(): ViewElementFactory {
    if (Array.isArray(this._viewElementFactories)) {
      const builders = this._viewElementFactories as Array<ViewElementFactory>;
      if (builders.length === 0) {
        return null;
      }
      const builder = this._viewElementFactories[0];
      return (element: HTMLElement) => builder(element, this, builders.slice(1));
    } else {
      const builder = this._viewElementFactories as ViewElementFactory;
      return (element: HTMLElement) => builder(element, this, builder);
    }
  }

  /** A mapping from identifier to child ViewElement */
  private _identifierToChild: Map<string, ViewElement>;

  /** @see {@link MutationReporter:MutationReporter} */
  private _mutationReporter: MutationReporter;

  /**
   * Exposes `this._children`
   * @public
   * @return The ViewElement that are children of current ViewElement.
   */
  get children_(): Array<ViewElement> {
    return this._children;
  }

  /**
   * Registers an array of ViewElement as current ViewElement's children.
   *
   * These steps will be performed:
   *
   *    + previously bound child ViewElement will have their `parent_` nullified
   *    + `this._children` will be replaced by the new array of ViewElement
   *    + `this._identifierToChild` will be replaced by a new Map where entries are from identifiers to new ViewElement
   *    + every new child ViewElement will have their `parent_` set to current view instance
   *
   * @public
   * @param {Array<ViewElement>} children - An array of child ViewElement.
   */
  set children_(children: Array<ViewElement>) {
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
   * Creates a ViewElement instance.
   *
   * @public
   * @param {HTMLElement} forwardingTo - A DOM element to which access/modification operations are forwarded. {@link Instantiation:ForwardingInstantiation#constructor}
   * @param {Array<ViewElementFactory>} [viewElementFactories = []] - An array of factory meth ods to create ViewElement from DOM elements. This array is hierarchical in that first builder is suitable for create child ViewElement of current ViewElement, second builder is suitable for creating child ViewElement of current child ViewElement, and so on...
   * @constructs ViewElement
   */
  constructor(
    forwardingTo?: HTMLElement,
    viewElementFactories: ViewElementFactory | Array<ViewElementFactory> = []
  ) {
    super(forwardingTo);
    // redeclare identifier variable with same value to enforce proper access control
    Object.defineProperty(this, 'identifier_', {
      configurable: false,
      enumerable: false,
      value: uuid(),
      writable: false,
    });
    // reset the identifier value in dataset as its prior value is `undefined`
    this.forwardingTo_.dataset[ViewElement.identifierDatasetName_] = this.identifier_;
    Object.defineProperty(this, 'parent_', {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: true,
    });
    this.children_ = [];

    Object.defineProperty(this, '_viewElementFactories', {
      configurable: false,
      enumerable: false,
      value: viewElementFactories,
      writable: true,
    });
  }

  /**
   * Finds the first element that
   *
   *    + is a descendant of the `root`
   *    + has identifier value in dataset
   *    + matches the specified group of selectors.
   *
   * @public
   * @param {string} identifier - The unique ViewElement identifier. A DOM element has a ViewElement identifier only when it is the forwarding target of that ViewElement.
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
      `${selectors}[data-${ViewElement.identifierDatasetName_}="${identifier}"`
    );
  }

  /**
   * @public
   * @override
   * @description In addition to changing the forwarding target, this method will also remove the identifier from previous forwarding target's dataset (if exists) and add the identifier to the new forwarding target's dataset.
   */
  setForwardingTo__(forwardingTo: TDomElement) {
    if (this.forwardingTo_) {
      delete this.forwardingTo_.dataset[ViewElement.identifierDatasetName_];
    }
    super.setForwardingTo__(forwardingTo);
    if (this.forwardingTo_) {
      this.forwardingTo_.dataset[ViewElement.identifierDatasetName_] = this.identifier_;
    }
  }

  /**
   * Retrieves a child ViewElement by its underlying element.
   *
   * @param {HTMLElement} element - An underlying element for a child ViewElement.
   * @returns {ViewElement} Associated child ViewElement.
   */
  getChildByElement__(element: HTMLElement): ViewElement {
    const identifier = element.dataset[ViewElement.identifierDatasetName_];
    return this._identifierToChild.get(identifier);
  }

  /**
   * Inserts a ViewElement to be a child of current ViewElement at specified index.
   *
   * These steps will be performed:
   *
   *    + child ViewElement's parent will be set to current ViewElement
   *    + child ViewElement will be inserted into `this._children` at specified index
   *    + a mapping from identifier to child ViewElement will be added to `this._identifierToChild`
   *
   * Default to append child at end.
   *
   * Note: this operation will have no effect to DOM.
   *
   * @public
   * @param {ViewElement} child - A child ViewElement to be inserted or a HTMLElement to be transformed into a child ViewElement and inserted.
   * @param {number} index - Where the child ViewElement should be inserted. Should be a valid number between [0, this._children.length] where 0 is equivalent to prepending to the start and `this._children.length` is equivalent to appending to the end.
   */
  insertChild__(child: ViewElement | HTMLElement, index: number = this._children.length) {
    let viewElement: ViewElement;
    if (child instanceof ViewElement) {
      viewElement = child;
    } else {
      /** @type HTMLElement */
      viewElement = this._childViewElementFactory(child);
    }
    viewElement.parent_ = this;
    this._children.splice(index, 0, viewElement);
    this._identifierToChild.set(viewElement.identifier_, viewElement);
  }

  /**
   * Removes a child ViewElement from current ViewElement by its child index.
   *
   * These steps will be performed:
   *
   *    + ViewElement at specified index in `this._children` will be removed
   *    + deleted child ViewElement's `parent_` will be nullified
   *    + the mapping from identifier to deleted child ViewElement will be removed from `this._identifierToChild`
   *
   * Note:
   *
   *    The removal is restricted to the ViewElement layer. In other words, the removed ViewElement might still contain a DOM element which is child of DOM element contained in current view ViewElement.
   *
   * @public
   * @param {number} index - The index of the child ViewElement to be deleted. Should be in valid range -- [0, this._children.length)
   * @return {ViewElement} The deleted ViewElement.
   */
  removeChildByIndex__(index: number): ViewElement {
    const [viewElement] = this._children.splice(index, 1);
    viewElement.parent_ = null;
    this._identifierToChild.delete(viewElement.identifier_);
    return viewElement;
  }

  /**
   * Removes a child ViewElement from current ViewElement.
   *
   * Finds the ViewElement's child index and calls {@link ViewElement#removeChildByIndex__}.
   *
   * @param {ViewElement} viewElement - A ViewElement to be deleted.
   * @return {ViewElement} The deleted ViewElement which should be the same as provided `viewElement`. Null if provided `viewElement` is not child of current ViewElement.
   */
  removeChild__(viewElement: ViewElement): ViewElement {
    const index: number = this._children.indexOf(viewElement);
    if (index === -1) {
      return null;
    }
    return this.removeChildByIndex__(index);
  }

  /**
   * Removes a child ViewElement from current ViewElement by its identifier.
   *
   * Finds the ViewElement by its identifier from `this._identifierToChild` and calls {@link ViewElement#removeChild__}.
   *
   * @param {string} identifier - The unique identifier of a ViewElement to be deleted.
   * @return {ViewElement} The deleted ViewElement. Null if no child `viewElement` of current ViewElement has provided identifier.
   */
  removeChildByIdentifier__(identifier: string): ViewElement {
    const viewElement = this._identifierToChild.get(identifier);
    if (!viewElement) {
      return null;
    }
    return this.removeChild__(viewElement);
  }

  /**
   * Iterate over a range of child ViewElement, applies an operation, and returns an array containing the result.
   *
   * Equivalent of `this._children.slice(begin, end).map(operation)`.
   *
   * @callback operation
   * @param {ViewElement} viewElement - The child ViewElement to apply the operation.
   * @param {number} childIndex - The child index of the current child ViewElement.
   * @param {number} rangeIndex - The sequential index of current child ViewElement in the range where the operation is applied.
   * @returns {T} Result of applying the operation on a child ViewElement.
   *
   * @public
   * @param operation - An operation to be applied to each child ViewElement in the range.
   * @param {number} [start = 0] - Where to start applying operation.
   * @param {number} [end = this._children.length] - Before which to end applying operation. The child ViewElement at `end` (if any) will not be applied operation.
   * @returns {Array<T>} The operation application result on the specified range of child ViewElement.
   *
   * Some useful operations:
   *
   *    + @example
   *      @return {Array<HTMLElement>} DOM elements of ViewElement in range
   *      extract DOM element of children ViewElement
   *      `(viewElement) => viewElement.element_`
   *    + @example
   *      @param {Node} node - A node whose child list will be replaced
   *      @return {Array<HTMLElement>} replaced DOM elements
   *      replace a node's children by DOM element of children ViewElement
   *      `(viewElement, childIndex, rangeIndex) => node.replaceChild(viewElement.element_, node.children[rangeIndex])`
   *    + @example
   *      @param {Array<HTMLElement>} elements - An array of DOM elements to replace original DOM elements of children ViewElement
   *      @return {Array<HTMLElement>} Same as `elements`.
   *      change children ViewElement's DOM elements
   *      `(viewElement, childIndex, rangeIndex) => viewElement.element_ = elements[rangeIndex]`
   *    + @example
   *      @this ViewElement
   *      observe desired mutations on all DOM elements in children ViewElement.
   *      `this.operateOnRange__(viewElement => this.observe__(viewElement.element_, ...))`
   */
  operateOnRange__<T>(
    operation: (viewElement: ViewElement, childIndex: number, rangeIndex: number) => T,
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
   * Update current ViewElement's DOM element using the other ViewElement's element. This handles the **Match** scenario described in `patchWithViewElement__`.
   *
   * @param {TDomElement} other - The HTML element of the other ViewElement.
   * @param {PatchModeForMatch} [mode=PatchModeForMatch.CreateAlias] - Determines how to update current ViewElement's HTML element.
   * @param {IterableIterator<Prop>} [properties] - An iterable of properties. This parameter is only used when `mode === PatchModeForMatch.ModifyProperties`. If not supplied, will update all properties exist in the other ViewElement's HTML element.
   * @param {boolean} [noDetach = true] - Whether current underlying element should be removed from the DOM tree. Default to true, which means it will not be removed.
   * @param {boolean} [noAttach = true] - Whether new element should be added to the DOM tree. Default to true, which means it will not be added.
   */
  private __patchSelf(
    other: TDomElement,
    mode: PatchModeForMatch = PatchModeForMatch.CreateAlias,
    properties?: IterableIterator<Prop>,
    noDetach: boolean = true,
    noAttach: boolean = true
  ) {
    let oldElement = this.element_;
    let newElement: TDomElement;

    switch (mode) {
      case PatchModeForMatch.CreateAlias:
        this.setForwardingTo__(other);
        newElement = other;
        break;
      case PatchModeForMatch.CloneNode:
        this.setForwardingTo__((newElement = other.cloneNode(true) as TDomElement));
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
        // noDetach and noAttach is not relevant here because properties of the current underlying element are modified instead
        return;
    }

    if (!noDetach && !noAttach) {
      oldElement.replaceWith(newElement);
    } else if (!noDetach) {
      // should detach but not attach
      oldElement.remove();
    } else if (!noAttach) {
      // ? This is a situation that does not make much sense, where we are keeping the old element alongside the new element. We arbitrarily decide to insert new element after the old element.
      oldElement.after(newElement);
    } else {
      // do nothing if neither detach old element nor attach new element
    }
  }

  /**
   * Updates current ViewElement by another ViewElement using the in-place-patch algorithm.
   *
   * From the following illustrations describing scenarios for different `_children` length, one can tell there are three potential scenarios:
   *
   *    + MATCH: there is a child ViewElement and a matching child ViewElement in `other`. In this case, `patchWithViewElement__` will recur on these two ViewElement.
   *    + SURPLUS (append): there is a child ViewElement in `other` that does not have a matching child ViewElement in `this`. In this case, the child ViewElement will be appended to `this._children`. If `noAttach` is false, the corresponding DOM element will also be appended to `this.element_`.
   *    + SURPLUS (remove): there is a child ViewElement in `this` that does not have a matching child ViewElement in `other`. In this case, the child ViewElement will be removed from `this._children`. If `noDetach` is false, the corresponding DOM element will also be removed from `this.element_`.
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
   * @param {ViewElement} other - A ViewElement used to patch current ViewElement.
   * @param {PatchModeForMatch} [mode=PatchModeForMatch.CreateAlias] - Determines how to update current ViewElement's HTML element.
   * @param {boolean} [noDetach = true] - Whether surplus DOM elements of `this._children` will be removed from DOM tree.
   * @param {boolean} [noAttach = true] - Whether surplus DOM elements of `other._children` will be appended
   */
  patchWithViewElement__(
    other: ViewElement,
    mode: PatchModeForMatch = PatchModeForMatch.CreateAlias,
    noDetach: boolean = true,
    noAttach: boolean = true
  ) {
    // patch self
    this.__patchSelf(other.element_ as TDomElement, mode, undefined, noDetach, noAttach);

    // patch children
    patch(
      this._children,
      other._children,
      (child, otherChild) => child.patchWithViewElement__(otherChild, mode, noDetach, noAttach),
      (child, childIndex) => {
        // this ViewElement surplus: remove
        this.removeChildByIndex__(childIndex);
        if (!noDetach) {
          child.element_.remove();
        }
      },
      (otherChild, childIndex) => {
        // other ViewElement surplus: append to the end
        this.insertChild__(otherChild, childIndex);
        if (!noAttach) {
          this.element_.appendChild(otherChild.element_);
        }
      }
    );
  }

  /**
   * Updates current ViewElement's children ViewElement by a collection of ViewElement using the in-place-patch algorithm.
   *
   * From the following illustrations describing scenarios for different `_children` length, one can tell there are three potential scenarios:
   *
   *    + MATCH: there is a child ViewElement and a matching ViewElement in `elements`. In this case, `patchWithViewElement__` will recur on these two ViewElement.
   *    + SURPLUS (append): there is a child ViewElement in `elements` that does not have a matching child ViewElement in `this`. In this case, this ViewElement will be appended to `this._children`. If `noAttach` is false, the corresponding DOM element will also be appended to `this.element_`.
   *    + SURPLUS (remove): there is a child ViewElement in `this` that does not have a matching ViewElement in `elements`. In this case, the child ViewElement will be removed from `this._children`. If `noDetach` is false, the corresponding DOM element will also be removed from `this.element_`.
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
   * @param {Iterable<ViewElement>} elements - An iterable of ViewElement used to update children ViewElement of current ViewElement.
   * @param {PatchModeForMatch} [mode=PatchModeForMatch.CreateAlias] - Determines how to update current ViewElement's HTML element.
   * @param {boolean} [noDetach = true] - Whether surplus DOM elements of `this._children` will be removed from DOM tree.
   * @param {boolean} [noAttach = true] - Whether surplus DOM elements of `other._children` will be appended
   */
  patchChildViewElementsWithViewElements__(
    elements: Iterable<ViewElement>,
    mode: PatchModeForMatch = PatchModeForMatch.CreateAlias,
    noDetach: boolean = true,
    noAttach: boolean = true
  ) {
    // patch children
    patch(
      this._children,
      elements,
      (child, otherChild) => child.patchWithViewElement__(otherChild, mode, noDetach, noAttach),
      (child, childIndex) => {
        // this ViewElement surplus: remove
        this.removeChildByIndex__(childIndex);
        if (!noDetach) {
          child.element_.remove();
        }
      },
      (otherChild, childIndex) => {
        // other ViewElement surplus: append to the end
        this.insertChild__(otherChild, childIndex);
        if (!noAttach) {
          this.element_.appendChild(otherChild.element_);
        }
      }
    );
  }

  /**
   * Similar as {@link ViewElement#patchWithViewElement__} where current ViewElement is updated by another DOM element using the in-place-patch algorithms.
   *
   * Note:
   *
   *    + If the current ViewElement is a partial abstraction of the reference DOM element `other`, then the in-place-patch algorithm might run into live-editing:
   *      @example `other` has two child nodes, current ViewElement is an abstraction of `other` but only has a child ViewElement for the second child node. When calling `this.patchWithDOM__(other)`, second child node will be live edited when in {@link PatchModeForMatch#ModifyProperties} (because of property forwarding): its registered properties wll be set to those of first child node.
   *
   *      To avoid live-editing caused by property forwarding, one can use a cloned node as the reference node or use other `PatchModeForMatch`
   *      `this.patchWithDOM__(this.element_.cloneNode(true), PatchModeForMatch.ModifyProperties)`
   *      `this.patchWithDOM__(this.element_, PatchModeForMatch.CreateAlias)`
   *
   * @param {HTMLElement} other - A HTML element used to patch current ViewElement.
   * @param {PatchModeForMatch} [mode=PatchModeForMatch.CreateAlias] - Determines how to update current ViewElement's HTML element.
   * @param {boolean} [noDetach = true] - Whether surplus DOM elements of `this._children` will be removed from DOM tree.
   * @param {boolean} [noAttach = true] - Whether surplus DOM elements of `other.children` will be appended
   */
  patchWithDOM__(
    other: TDomElement,
    mode: PatchModeForMatch = PatchModeForMatch.CreateAlias,
    noDetach: boolean = true,
    noAttach: boolean = true
  ) {
    // patch self
    this.__patchSelf(other, mode, undefined, noDetach, noAttach);

    // patch children
    this.patchChildViewElementsWithDOMElements__(other.children, mode, noDetach, noAttach);
  }

  /**
   * Patches the children ViewElement of current ViewElement using an array of DOM elements. In-place-patch algorithm as documented in {@link ViewElement#patchWithViewElement__} will be used.
   *
   * Note:
   *
   *    + If the current ViewElement is a partial abstraction of the reference DOM element `other`, then the in-place-patch algorithm might run into live-editing:
   *      @example `other` has two child nodes, current ViewElement is an abstraction of `other` but only has a child ViewElement for the second child node. When calling `this.patchWithDOM__(other)`, second child node will be live edited when in {@link PatchModeForMatch#ModifyProperties} (because of property forwarding): its registered properties wll be set to those of first child node.
   *
   *      To avoid live-editing caused by property forwarding, one can use a cloned node as the reference node or use other `PatchModeForMatch`
   *      `this.patchWithDOM__(this.element_.cloneNode(true), PatchModeForMatch.ModifyProperties)`
   *      `this.patchWithDOM__(this.element_, PatchModeForMatch.CreateAlias)`
   *
   * @param {Iterable<HTMLElement> | HTMLCollection} elements - An array of DOM elements to patch current children ViewElement.
   * @param {PatchModeForMatch} [mode=PatchModeForMatch.CreateAlias] - Determines how to update current ViewElement's HTML element.
   * @param {boolean} [noDetach = true] - Whether surplus DOM elements of `this._children` will be removed from DOM tree.
   * @param {boolean} [noAttach = true] - Whether surplus DOM elements of `other.children` will be appended
   */
  patchChildViewElementsWithDOMElements__(
    elements: Iterable<HTMLElement> | HTMLCollection,
    mode: PatchModeForMatch = PatchModeForMatch.CreateAlias,
    noDetach: boolean = true,
    noAttach: boolean = true
  ) {
    let newChildViewElementHandler: (otherChild: Element, childIndex: number) => void;

    if (Array.isArray(this._viewElementFactories) && this._viewElementFactories.length === 0) {
      // do nothing because no blueprints exist for child ViewElement
      newChildViewElementHandler = undefined;
    } else {
      newChildViewElementHandler = (otherChild: Element, childIndex: number) => {
        const viewElement = this._childViewElementFactory(otherChild as HTMLElement);
        this.insertChild__(viewElement, childIndex);
        if (!noAttach) {
          this.element_.appendChild(viewElement.element_);
        }
      };
    }

    // patch children
    patch(
      this._children,
      elements,
      (child, otherChild) =>
        child.patchWithDOM__(otherChild as HTMLElement, mode, noDetach, noAttach),
      (child, childIndex) => {
        // this ViewElement surplus: remove
        this.removeChildByIndex__(childIndex);
        if (!noDetach) {
          child.element_.remove();
        }
      },
      newChildViewElementHandler
    );
  }

  /**
   * Creates a MutationReporter with a callback that responds to changes happening to current ViewElement instance.
   *
   * Calling this method after a MutationReporter has been bound to current instance will recreate the MutationReporter. Previous bound MutationReporter will be disconnected.
   *
   * @public
   * @param {MutationReporterCallback} callback - The callback to be invoked when mutations are observed. It will be invoked with `this` bound to current ViewElement.
   */
  setMutationReporter__(callback: MutationReporterCallback = this.onMutation__.bind(this)) {
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
   * Default callback for observed mutations -- report each mutation as its corresponding event and update ViewElement children on child list change.
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
      // update children ViewElement
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
