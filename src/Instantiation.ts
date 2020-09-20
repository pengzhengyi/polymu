/**
 * @module
 *
 * This module provide instantiations of Abstraction class:
 *
 *    + ForwardingInstantiation: allows access/modification to registered properties to be resolved with a registered target `forwardingTo_`. More, specifically, these operations are regulated by a ForwardingPropertyDescriptor, a descriptor which could contain callbacks that receives additional arguments including `forwardingTo_` and the Instantiation instance.
 *    + DomForwardingInstantiation: extends ForwardingInstantiation with default descriptor that treat registered properties as a DOM attribute or JS property of the forwarding target.
 */

import { Abstraction, Prop } from './Abstraction';
import { NotImplemented } from './utils/errors';
import { getProperty, hasProperty, setProperty } from './dom/properties';

/**
 * Strips the getter-setter pair of functions from PropertyDescriptor so that access functions type annotations can be overriden.
 *
 * @see {@link https://microsoft.github.io/PowerBI-JavaScript/interfaces/_node_modules_typedoc_node_modules_typescript_lib_lib_es5_d_.propertydescriptor.html PropertyDescriptor} {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty}
 */
type DataDescriptor = Omit<PropertyDescriptor, 'get' | 'set'>;

/**
 * Extracts the getter-setter pair of functions form PropertyDescriptor.
 *
 *    PropertyDescriptor = AccessFunctions + DataDescriptor
 */
type AccessFunctions = Pick<PropertyDescriptor, 'get' | 'set'>;

/**
 * `ForwardingPropertyDescriptor` is similar to `PropertyDescriptor` except its getter and setter function have different signature: the argument list will end with `forwardingTo` which contains the forwarding target and `thisArgument` which contains the `ForwardingInstantiation` instance.
 *
 * @typedef {T extends ForwardingInstantiation} [T = ForwardingInstantiation] - An subclass of ForwardingInstantiation. Represents the type of `thisArgument`.
 */
export interface ForwardingPropertyDescriptor<
  T extends ForwardingInstantiation = ForwardingInstantiation
> extends DataDescriptor {
  get: (forwardingTo: any, thisArgument: T) => any;
  set: (v: any, forwardingTo: any, thisArgument: T) => void;
}

/**
 * A ForwardingInstantiation forwards access/modification operations to an underlying object.
 *
 * These core functionalities are exposed by the ForwardingInstantiation class:
 *
 *    + @public {@link ForwardingInstantiation#setForwardingTo__} change the forwarding target
 *    + @public {@link ForwardingInstantiation#registerProps__} registering/revoking properties
 *
 * @augments Abstraction
 */
export class ForwardingInstantiation extends Abstraction {
  /** The underlying target to which access and modification to registered properties will be forwarded */
  protected forwardingTo_: any;

  /**
   * Creates a ForwardingInstantiation instance.
   *
   * @public
   * @param {Record<Prop, Partial<ForwardingPropertyDescriptor>} props: An object containing mapping from properties to their descriptors.
   * @param {any} forwardingTo - A target to which access/modification operations are forwarded.
   * @constructs ForwardingInstantiation
   *
   * @example
   *    If you want to create a ForwardingInstantiation and set forwarding target/add properties later, you can invoke constructor like: `new ForwardingInstantiation({}, null);`
   */
  constructor(
    propsToForward: Record<Prop, Partial<ForwardingPropertyDescriptor>>,
    forwardingTo: any
  ) {
    super({});
    this.setForwardingTo__(forwardingTo);
    this.registerProps__(propsToForward, false);
  }

  /**
   * Transform a ForwardingPropertyDescriptor into a PropertyDescriptor. More specifically, it creates wrapper getter and setter that invoke the ForwardingPropertyDescriptor's getter and setter by supplying additional arguments through scoping.
   * @example
   *    To transform into an empty property descriptor (which if passed to registration will use default descriptor in {@link ./Abstraction.Abstraction}), simply pass `{}` as `descriptor`.
   *
   * @param {Partial<ForwardingPropertyDescriptor>} descriptor - An object containing partial implementation of a ForwardingPropertyDescriptor.
   * @param {ForwardingInstantiation} thisArgument - The invoking context: an ForwardingInstantiation which provides a forwarding target.
   * @return {Partial<PropertyDescriptor>} A partial implementation of a property descriptor.
   */
  private static __transformPropertyDescriptor(
    descriptor: Partial<ForwardingPropertyDescriptor>,
    thisArgument: ForwardingInstantiation
  ): Partial<PropertyDescriptor> {
    const accessFunctions: AccessFunctions = {};
    if ('get' in descriptor) {
      accessFunctions.get = () => {
        return descriptor.get(thisArgument.forwardingTo_, thisArgument);
      };
    }
    if ('set' in descriptor) {
      accessFunctions.set = (v: any) => {
        return descriptor.set(v, thisArgument.forwardingTo_, thisArgument);
      };
    }
    return Object.assign({}, descriptor, accessFunctions);
  }

  /**
   * Transforms all ForwardingPropertyDescriptor into PropertyDescriptor and remaps them under same properties.
   *
   * @see {@link ForwardingInstantiation.__transformPropertyDescriptor}
   * @param {Record<Prop, Partial<ForwardingPropertyDescriptor>>} props - A mapping from property name to property descriptor (ForwardingPropertyDescriptor).
   * @param {ForwardingInstantiation} thisArgument - The invoking context: an ForwardingInstantiation which provides a forwarding target.
   * @return {Record<Prop, Partial<PropertyDescriptor>>} A mapping from property name to property descriptor (PropertyDescriptor)
   */
  private static __transformPropertyDescriptors(
    props: Record<Prop, Partial<ForwardingPropertyDescriptor>>,
    thisArgument: ForwardingInstantiation
  ): Record<Prop, Partial<PropertyDescriptor>> {
    const _props: Record<Prop, Partial<PropertyDescriptor>> = {};
    for (const property in props) {
      const descriptor = props[property];
      _props[property] = this.__transformPropertyDescriptor(descriptor, thisArgument);
    }
    return _props;
  }

  /**
   * @override
   * @public
   * @param {Record<Prop, Partial<ForwardingInstantiation>>} props - An object contains mapping from Prop to ForwardingPropertyDescriptor.
   * @param {boolean} [reset=false] - Whether existing props will be removed.
   * @description __override__ The overriding function allows access functions in ForwardingPropertyDescriptor to receive two additional arguments: `forwardingTo` and `thisArgument`.
   */
  registerProps__(props: Record<Prop, Partial<ForwardingPropertyDescriptor>>, reset = false) {
    /** props will be registered in {@link ./Abstraction.Abstraction} */
    super.registerProps__(
      ForwardingInstantiation.__transformPropertyDescriptors(props, this),
      reset
    );
  }

  /**
   * Set a target to which access and modification on registered properties will be forwarded.
   *
   * In essence, the current instance serves as a {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy Proxy} which forwards all operations involving the registered properties to the underlying target.
   *
   * @example
   *    Suppose the registered property is `id` and the `forwardingTo` is an object. Then `this.id` is equivalent to `forwardingTo.id`.
   *
   * @public
   * @param {any} forwardingTo - A target to forward access / modification on regiserted properties.
   */
  setForwardingTo__(forwardingTo: any) {
    /**
     * `forwardingTo_` is
     *
     *    + not configurable since we do not want accident deletion of this property
     *    + not enumerable since we want to hide this property from property enumeration -- only registered properties will be enumerated
     */
    Object.defineProperty(this, 'forwardingTo_', {
      configurable: false,
      enumerable: false,
      value: forwardingTo,
      writable: true,
    });
  }
}

/**
 * A DomForwardingInstantiation forwards access/modification operations to an underlying DOM element.
 *
 * The property will be resolved in the following order:
 *
 *    1. a HTML attribute like `class` for a `<div class="active></div>`
 *    2. a JS property like `classList`, `textContent`
 *    3. a custom property
 *
 * Some caveats:
 *
 *    + The property has to be a string.
 *    + If the element does not have the DOM property {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/hasAttribute}, the operation will not stop, rather it will try to resolve the property as a JS property then a custom property. But suppose this DOM attribute comes into existence because of user action or script execution, next operation will resolve this property as a DOM attribute even if a same-named JS property or custom property exists. The opposite is also true where a DOM attribute no longer exists. To avoid such situations, you are recommended to
 *      + predefine the DOM attribute,
 *        @example `element.class = ""`
 *      + use the JS property equivalent
 *        @example `class` can be substituted with `className`
 *    + If you need to define a custom property, you should avoid clashing with potential HTML attributes and JS properties
 *
 * @augments ForwardingInstantiation
 */
export class DomForwardingInstantiation<
  TDomElement extends HTMLElement = HTMLElement
> extends ForwardingInstantiation {
  /**
   * Exposes `this.forwardingTo_`
   * @public
   * @return The underlying DOM element of current Abstraction.
   */
  get element_(): TDomElement {
    return this.forwardingTo_;
  }

  /**
   * Equivalent with `this.setForwardingTo__`
   * @public
   */
  set element_(element: TDomElement) {
    this.setForwardingTo__(element);
  }

  /**
   * Creates a default access descriptor that
   *
   *    + for a [[GET]] operation, attempts to query same-named property from the HTML element that is the forward target {@link getProperty}
   *    + for a [[SET]] operation, attempts to modify same-named property from the HTML element that is the forward target {@link setProperty}
   *
   * @param {string} property - Name of property.
   * @return {Partial<PropertyDescriptor>} A default partial implementation of ForwardingPropertyDescriptor that provides a getter and setter pair.
   */
  protected static defaultForwardingDescriptor__(
    property: string
  ): Partial<ForwardingPropertyDescriptor> {
    return {
      get(forwardingTo: HTMLElement): any {
        return getProperty(forwardingTo, property);
      },
      set(newValue: any, forwardingTo: HTMLElement) {
        setProperty(forwardingTo, property, newValue);
      },
    };
  }

  /**
   * For each property, supplies default access descriptor if none has been provided.
   *
   * More specifically, it iterates through each property, descriptor pair and replace falsy descriptor value with default descriptor.
   *
   * @see {@link DomForwardingInstantiation.defaultForwardingDescriptor__}
   * @param {Record<string, Partial<ForwardingPropertyDescriptor>>} props - An object containing mapping from properties to their descriptors.
   * @return An object containing mapping from properties to their descriptors where default descriptor has replaced falsy descriptor value.
   */
  private static __fillDefaultDescriptor(
    props: Record<string, Partial<ForwardingPropertyDescriptor>>
  ): Record<string, Partial<ForwardingPropertyDescriptor>> {
    const _props: Record<Prop, Partial<ForwardingPropertyDescriptor>> = {};
    /**
     * `in` operator is used for speed (avoid unnecessary array allocation in `Object.entries`
     * `hasOwnProperty` is skipped as `props` is assumed to be a simple object (no lookup through prototype chain)
     */

    for (const property in props) {
      const descriptor = props[property];
      _props[property] = descriptor ? descriptor : this.defaultForwardingDescriptor__(property);
    }
    return _props;
  }

  /**
   * @override
   * @public
   * @param {Record<string, Partial<ForwardingInstantiation>>} props - An object contains mapping from string to ForwardingPropertyDescriptor.
   * @param {boolean} [reset=false] - Whether existing props will be removed.
   * @description __override__ The overriding function will replace falsy descriptor values in `props` with default property descriptor {@link DomForwardingInstantiation.__fillDefaultDescriptor}.
   */
  registerProps__(props: Record<string, Partial<ForwardingPropertyDescriptor>>, reset = false) {
    // super refers to {@link ForwardingInstantiation}
    super.registerProps__(DomForwardingInstantiation.__fillDefaultDescriptor(props), reset);
  }
}

/**
 * A DomFallthroughInstantiation is similar to a DomForwardingInstantiation except it requires no explicit registration of **forwarding properties**. In other words, a DomFallthroughInstantiation can be used to substitute the forwarding element because it possess the same set of properties through proxying.
 *
 * @example
 *    Suppose we create an instantiation of HTMLInputElement:
 *
 *    ```Typescript
 *     const inputElement = document.createElement("input");
 *     const instantiation = DomFallthroughInstantiation(inputElement);
 *
 *     inputElement.value = "Hello World";
 *     console.log(instantiation.value); // outputs "Hello World"
 *    ```
 *
 * @augments DomForwardingInstantiation
 */
// @ts-ignore: Class incorrectly implements interface
export class DomFallthroughInstantiation<TDomElement extends HTMLElement = HTMLElement>
  extends DomForwardingInstantiation<TDomElement>
  implements TDomElement {
  private readonly _instantiation: DomFallthroughInstantiation<TDomElement>;

  constructor(forwardingTo: HTMLElement) {
    super({}, forwardingTo);
    const instantiation: DomFallthroughInstantiation<TDomElement> = this;
    /**
     * Stores a reference to the instantiation in a private field. This is useful where an instance method wants to directly operates on the instantiation without proxying. Of course, getting the `_instantiation` field is still proxied.
     *
     * The existence of this field can also indicates the completion of base class initialization.
     */
    Object.defineProperty(this, '_instantiation', {
      configurable: false,
      enumerable: false,
      value: instantiation,
      writable: false,
    });

    /**
     * @override
     *
     * Redefines `propNames_` as returning a dynamically computed set containing all enumerable properties from the forwarding element, including inherited enumerable properties.
     */
    Object.defineProperty(this, 'propNames_', {
      configurable: true,
      enumerable: false,
      get(): Set<Prop> {
        const propNames: Set<Prop> = new Set();
        for (const propName in instantiation.element_) {
          propNames.add(propName);
        }
        return propNames;
      },
    });

    return new Proxy(instantiation, {
      /**
       * A trap for {@see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty Object.defineProperty}.
       *
       * The property will be defined according to the following rules:
       *
       *    + both starts with a underscore and ends with a underscore
       *      The actually registered property name will be equivalent to the provided property name with the first underscore and the last underscore stripped.
       *
       *      @example
       *        `__id_` will be transformed to `_id`
       *        `_id__` will be transformed to `id_`
       *
       *      This scenario allows a property name that starts with or (and) ends withe underscore to be registered on the forwarding element unmodified.
       *    + starts with a underscore and ends with a underscore
       *      This property will be registered on the instantiation.
       *    + Otherwise, this property will be registered on the forwarding element unmodified.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/defineProperty}
       */

      defineProperty(
        target: DomFallthroughInstantiation<TDomElement>,
        prop: Prop,
        descriptor: PropertyDescriptor
      ): boolean {
        /**
         * Only appropriated named property name can be registered on the instantiation.
         */

        const propertyName = prop.toString();
        if (propertyName.startsWith('_') && propertyName.endsWith('_')) {
          return Reflect.defineProperty(target.element_, propertyName.slice(1, -1), descriptor);
        } else if (Abstraction.satisfyNamingRule__(propertyName)) {
          return Reflect.defineProperty(target, propertyName, descriptor);
        } else {
          return Reflect.defineProperty(target.element_, prop, descriptor);
        }
      },
      /**
       * A trap for the delete operator.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/deleteProperty}
       */

      deleteProperty(target: DomFallthroughInstantiation<TDomElement>, prop: Prop): boolean {
        if (prop in target) {
          // attempts to delete `prop` from the instantiation
          return Reflect.deleteProperty(target, prop);
        }

        // attempts to delete `prop` from forwarding element
        return Reflect.deleteProperty(target.element_, prop);
      },
      /**
       * A trap for getting a property value.
       *
       * Prioritizing getting property from the instantiation.
       * There will not be a naming collision (a same name is registered both in instantiation and in forwarding element) because:
       *
       *    + the property names in instantiation are properly prefixed and suffixed by underscore to avoid name clash
       *    + the `set` function will only allow modification to existing properties on instantiation
       *    + the `defineProperty` function will only allow appropriated named property to be defined on the instantiation (not possible for name clash)
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/get}
       */

      get(target: DomFallthroughInstantiation<TDomElement>, prop: Prop, receiver: any) {
        if (prop in target) {
          // attempts to resolve `prop` on the instantiation
          return Reflect.get(target, prop, receiver);
        }

        // attempts to resolve `prop` on forwarding element
        return getProperty(target.element_, prop.toString());
      },
      /**
       * A trap for {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptor Object.getOwnPropertyDescriptor()}.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/getOwnPropertyDescriptor}
       */

      getOwnPropertyDescriptor(target: DomFallthroughInstantiation<TDomElement>, prop: Prop) {
        if (prop in target) {
          // attempts to get property descriptor of `prop` from the instantiation
          return Reflect.getOwnPropertyDescriptor(target, prop);
        }

        // attempts to get property descriptor of `prop` from forwarding element
        return Reflect.getOwnPropertyDescriptor(target.element_, prop);
      },
      /**
       * A trap for the [[GetPrototypeOf]] internal method.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/getPrototypeOf}
       */

      getPrototypeOf(target: DomFallthroughInstantiation<TDomElement>) {
        return Reflect.getPrototypeOf(target);
      },
      /**
       * A trap for the in operator.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/has}
       */

      has(target: DomFallthroughInstantiation<TDomElement>, prop: Prop): boolean {
        return prop in target || prop in target.element_;
      },
      /**
       * A trap for {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isExtensible Object.isExtensible()}.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/isExtensible}
       */

      isExtensible(target: DomFallthroughInstantiation<TDomElement>): boolean {
        return Reflect.isExtensible(target) || Reflect.isExtensible(target.element_);
      },
      /**
       * A trap for {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect/ownKeys Reflect.ownKeys()}.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/ownKeys}
       */

      ownKeys(target: DomFallthroughInstantiation<TDomElement>): Array<Prop> {
        return Reflect.ownKeys(target).concat(Reflect.ownKeys(target.element_));
      },
      /**
       * A trap for {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/preventExtensions Object.preventExtensions()}.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/preventExtensions}
       */

      preventExtensions(target: DomFallthroughInstantiation<TDomElement>): boolean {
        return Reflect.preventExtensions(target) && Reflect.preventExtensions(target.element_);
      },
      /**
       * A trap for setting a property value.
       *
       * For the instantiation, `set` can only modify existing properties. This prevents accidental definition of new properties on the instantiation since properties will be defined on the forwarding element.
       *
       * If you absolutely need to define a new property on the instantiation. Please use `Object.defineProperty`.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/set}
       */

      set(target: DomFallthroughInstantiation<TDomElement>, prop: Prop, value: any, receiver: any) {
        if (prop in target) {
          /**
           * The check is in place to prevent registering of new properties on the instantiation.
           */
          // prioritizes setting property defined on instantiation, for example, reassignment to `element_`.
          return Reflect.set(target, prop, value, receiver);
        }

        setProperty(target.element_, prop.toString(), value);
        return true;
      },
      /**
       * A trap for {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/setPrototypeOf Object.setPrototypeOf()}.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/setPrototypeOf}
       */
      setPrototypeOf(target: DomFallthroughInstantiation<TDomElement>, prototype: any): boolean {
        return Reflect.setPrototypeOf(target, prototype);
      },
    });
  }

  /**
   * Ignore warning since instantiation implements the TDomElement interface through proxying -- type engine cannot reason on such relationship.
   *
   * This function only performs a type cast and can be used without concern for performance.
   *
   * @public
   * @returns Cast current instantiation as type TDomElement
   * @type {TDomElement} The type of the forwarding element.
   */

  public asDomElement__(): TDomElement {
    // @ts-ignore: Class incorrectly implements interface
    return this as TDomElement;
  }
}
