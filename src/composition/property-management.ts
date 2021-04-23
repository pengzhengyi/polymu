/**
 * @module
 *
 * This module provides abstractions to support writing properties that have complex interactions.
 *
 * For example, one property might conditionally depend on several other properties for its value computation. Putting all such management code at declaration could clutter the code and obfuscate the intention of each property.
 *
 * + `Property` is used to create a Property.
 * + `PropertyManager` is used to group a set of properties that have inter-dependencies.
 */

import { AStarSearch } from '../graph/A*-search';
import { depthFirstSearch } from '../graph/depth-first-search';
import { getOrInsertDefault } from '../utils/MapHelper';

/**
 * This enum defines how soon a property should update its value when another property that has potential influence on its value (its "prerequisite") has changed. In other words, imagine a dependency graph, this enum decides how this property should respond when one property that is its ancestor has value changed.
 */
export enum UpdateBehavior {
  /**
   * If this property's value could have changed potentially, immediately recompute its value. Consider the dependency graph, if an "ancestor" property has changed its value, this property will recompute its value as a casual consequence.
   *
   * If a property has `Immediate` update behavior, then all its ancestors in the dependency graph will have `Immediate` update behavior. Since to perform a timely update on this property's value requires a timely update on all of this property's "prerequisites"' value.
   *
   * If provided with the following **prerequisite graph**: __an arrow from C to B means C depends on B to compute its value__
   *
   * ```
   * A (Lazy)
   * ↑
   * B (Lazy)
   * ↑
   * C (Immediate)
   * ```
   *
   * it will be updated to
   * ```
   * A (Immediate)
   * ↑
   * B (Immediate)
   * ↑
   * C (Immediate)
   * ```
   *
   * after resolution in {@link PropertyManager}.
   */
  Immediate,
  /**
   * Even when this property's value could have changed potentially, defer recomputation of this property's value until the value is requested.
   */
  Lazy,
}

/** The type for property name. Used for better clarity. */
type TPropertyName = string;

/**
 * A getter function that retrieves this property's value.
 *
 * This function might make use of `manager` when this property is a computed property whose value depends on other properties.
 *
 * @param {Property<TPropertyValue>} thisValue - A reference to the property where the getter function is associated. Note `thisValue` is different from `this` as `thisValue` refers to current property instance while `this` refers to the object (usually where this property is bound) where this function is invoked in.
 * @param {PropertyManager} manager - A reference to the property manager. Useful when it is necessary to retrieve other properties' value during computation of this property's value.
 * @returns {TPropertyValue} Most updated version of property value. The canonical current property value.
 */
type PropertyGetter<TPropertyValue> = (
  thisValue: Property<TPropertyValue>,
  manager: PropertyManager
) => TPropertyValue;

/**
 * A predicate that determines when a property's last computed value can be reused, thereby reducing unnecessary expensive computation. If true, then last computed value can be reused.
 *
 * @param {Property<TPropertyValue>} thisValue - A reference to the property where this predicate / last computed value is associated. Note `thisValue` is different from `this` as `thisValue` refers to current property instance while `this` refers to the object (usually where this property is bound) where this function is invoked in.
 * @param {PropertyManager} manager - A reference to the property manager. Useful when it is necessary to retrieve other properties' value to determine whether reuse if possible.
 * @returns {boolean} If true, then last computed value for this property is still up-to-date. Otherwise, a recomputation of property value is necessary.
 */
type ReusePredicate<TPropertyValue> = (
  thisValue: Property<TPropertyValue>,
  manager: PropertyManager
) => boolean;

/**
 * A callback executed when a property's value has changed.
 *
 * Before this callback is executed, the property's new value has been updated in property manager's cache.
 *
 * If this value change should trigger a value update of dependent properties, this callback should make sure to call `manager.notifyValueChange(thisValue)`.
 *
 * ! This callback should avoid modifying values of other properties that are managed by same property manager, as such dependency will not be discovered and violate the intention of property management -- to inverse the dependency. More specifically, dependencies should be declared in property accessor (`__getValue`) by requesting needed properties' value through property manager.
 *
 * @param {TPropertyValue} oldValue - The property value before the update.
 * @param {TPropertyValue} newValue - The property value after the update. This is also the value currently stored in property manager's cache for this property.
 * @param {Property<TPropertyValue>} thisValue - A reference to the property where these values are associated. Note `thisValue` is different from `this` as `thisValue` refers to current property instance while `this` refers to the object (usually where this property is bound) where this function is invoked in.
 * @param {PropertyManager} manager - A reference to the property manager. Useful when it is necessary to interact with other properties.
 */
type ValueUpdateCallback<TPropertyValue> = (
  oldValue: TPropertyValue,
  newValue: TPropertyValue,
  thisValue: Property<TPropertyValue>,
  manager: PropertyManager
) => void;

/**
 * The instances of this class represent special properties whose value might dynamically depend on other properties' value.
 *
 * This abstraction can be replaced by writing complicated and error-prone property value management code at its definition directly. However, synergy between properties can be intricate and convoluted, thus hard to get correct.
 *
 * Using `Property` abstraction facilitate automatic dependency management and dynamic value computation. Imagine writing code to manage value update for properties with the following dependency graph (an arrow from A to B means that property B's value is dependent on property A's value -- in other words, A could be needed in computing B's value. Therefore, if property A's value changes, property B's value is subject to change)
 *
 * ```
 *   A
 *  ⬋↓⬊
 * D ↓ B
 *  ⬊↓⬋ ⬊
 *   C   E
 * ```
 */
export class Property<TPropertyValue> {
  /**
   * The default callback executed when this property's value changes. This callback will trigger a value update for all properties whose value is potentially influenced by this property -- all its descendants in the dependency graph.
   *
   * @param {TPropertyValue} - The property value before the update.
   * @param {TPropertyValue} - The property value after the update, also the value currently stored in property manager's cache for this property.
   * @param {Property<TPropertyValue>} thisValue - A reference to the property where these values are associated. Note `thisValue` is different from `this` as `thisValue` refers to current property instance while `this` refers to the object (usually where this property is bound) where this function is invoked in.
   * @param {PropertyManager} manager - A reference to the property manager. Useful when it is necessary to interact with other properties.
   */
  static onValueUpdate<TPropertyValue>(
    oldValue: TPropertyValue,
    newValue: TPropertyValue,
    thisValue: Property<TPropertyValue>,
    manager: PropertyManager
  ): void {
    manager.notifyValueChange(thisValue);
  }
  /**
   * The canonical name of this property. If this property is requested to be bound on an object, then this name would be its key.
   */
  name: TPropertyName;

  /**
   * Decides how this property responds to potentially value changing events (changing of value in properties, ancestors in the dependency graph, that have potential influence on this property's value).
   *
   * @see {@link UpdateBehavior}
   */
  updateBehavior: UpdateBehavior;

  /**
   * Underlying getter function to retrieves this property's value.
   *
   * If computation of property's value is expensive, then this property might want to set `thisValue.shouldReuseLastValue` to a predicate function that when evaluates to true, allows this computed value, which can be retrieved using `manager.getPropertyValueSnapshot`, to be reused.
   *
   * Such pattern is safe as long as the predicate will evaluate to `false` when the value in snapshot outdates. If this assumption cannot be guaranteed, then `__getValue` should set shouldReuseLastValue to `undefined`, which is also the initial value.
   *
   * ! In order to support auto-discovering of dependencies among properties, all references to other properties managed by specified manager should happen in the manner `manager.getPropertyValue(<property name>)` where `<property name>` should be the literal string of the other property's name.
   *
   * For example, suppose property A's value is the sum of the values of property B and C, its `__getValue` might look like the following:
   *
   * ```
   * __getValue(thisValue: Property<TPropertyValue>, manager: PropertyManager) {
   *   const valueB = manger.getPropertyValue('B');
   *   const valueC = manger.getPropertyValue("C");
   *   const result = valueB + valueC;
   *   thisValue.shouldReuseLastValue = (thisValue, manager) => valueB === manger.getPropertyValue('B') && valueC === manger.getPropertyValue("C");
   *   return result;
   * }
   * ```
   *
   * During resolution, both property B and C will be recognized as prerequisites for property A.
   *
   * Above code is efficient since `manager.getPropertyValue` will delegate to property's `getValue` method which will reuse snapshot value if that value is up-to-date. Otherwise, a recomputation is unavoidable and caching ensures computation only occurs once to update necessary property prerequisites.
   *
   * * This method is public since its source code will be analyzed by manager.
   *
   * @see {@link PropertyGetter}
   */
  __getValue: PropertyGetter<TPropertyValue>;

  /**
   * Determine whether last computed value for this property stored in manager's snapshot can be reused. Default to require recomputation of property value every time.
   */
  shouldReuseLastValue: ReusePredicate<TPropertyValue>;

  /**
   * Action to be taken when this property's value has changed. In other words, this callback reflects the side effect of this property's value change.
   */
  onValueUpdate: ValueUpdateCallback<TPropertyValue>;

  /**
   * Creates a Property:
   *
   * + whose value can be dynamically computed
   * + whose value can be cached
   * + whose value can depend on some other properties while also be depended by some other properties
   * + whose value can be lazily computed or always up to date
   * + can take action when property value changed
   *
   * @param {TPropertyName} name - The canonical name of this property.
   * @param {PropertyGetter<TPropertyValue>} getValue - A function to retrieves this property's value.
   * @param {UpdateBehavior} [updateBehavior = UpdateBehavior.Immediate] - Decides how this property responds to potentially value changing events.
   * @param {ValueUpdateCallback<TPropertyValue>} [onValueUpdate = Property.onValueUpdate] - Action to be taken when this property's value has changed.
   */
  constructor(
    name: TPropertyName,
    getValue: PropertyGetter<TPropertyValue>,
    updateBehavior: UpdateBehavior = UpdateBehavior.Immediate,
    onValueUpdate: ValueUpdateCallback<TPropertyValue> = Property.onValueUpdate
  ) {
    this.name = name;
    this.__getValue = getValue;
    this.updateBehavior = updateBehavior;
    this.onValueUpdate = onValueUpdate;
  }

  /**
   * A getter method that should be used externally to retrieve this property's value, as it avoids recomputation of property value when possible through caching.
   *
   * This method might trigger a value update for all properties that potentially depend on this property -- descendants in the dependency graph.
   *
   * @param {Property<TPropertyValue>} thisValue - A reference to the property where the getter function is associated. Note `thisValue` is different from `this` as `thisValue` refers to current property instance while `this` refers to the object (usually where this property is bound) where this function is invoked in.
   * @param {PropertyManager} manager - A reference to the property manager. Useful when it is necessary to retrieve other properties' value during computation of this property's value.
   * @returns {TPropertyValue} Most updated version of property value. The canonical current property value.
   */
  getValue(thisValue: Property<TPropertyValue>, manager: PropertyManager): TPropertyValue {
    if (thisValue.shouldReuseLastValue && thisValue.shouldReuseLastValue(thisValue, manager)) {
      // reuse last computed property value, no change is needed
      return manager.getPropertyValueSnapshot(thisValue);
    } else {
      // compute new property value
      const newValue = thisValue.__getValue(thisValue, manager);
      manager.setPropertyValueSnapshot(thisValue, newValue);
      return newValue;
    }
  }

  /**
   * A setter method that should be used when this property's value needs to be changed externally.
   *
   * This method might trigger a value update for all properties that potentially depend on this property -- descendants in the dependency graph.
   *
   * @param {TPropertyValue} value - New value for this property. If different from last computed property value, will trigger a value update.
   * @param {Property<TPropertyValue>} thisValue - A reference to the property where the setter function is associated. Note `thisValue` is different from `this` as `thisValue` refers to current property instance while `this` refers to the object (usually where this property is bound) where this function is invoked in.
   * @param {PropertyManager} manager - A reference to the property manager. Used to update this property's value in manager's cache.
   */
  setValue(
    value: TPropertyValue,
    thisValue: Property<TPropertyValue>,
    manager: PropertyManager
  ): void {
    manager.setPropertyValueSnapshot(thisValue, value);
  }

  /**
   * Defines this property on an object. This property will be defined with a access descriptor whose get and set functions will invoke the `getValue` and `setValue` functions of this property.
   *
   * @param target - An object where this property is defined.
   * @param {PropertyManager} manager - A reference to the property manager.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty Object.defineProperty()}
   */
  bind(target: any, manager: PropertyManager): void {
    const that = this;
    Object.defineProperty(target, this.name, {
      configurable: true,
      enumerable: true,
      get() {
        // invoke external-facing `getValue` for this property
        return that.getValue(that, manager);
      },
      set(value: TPropertyValue) {
        // invoke external-facing `setValue` for this property
        that.setValue(value, that, manager);
      },
    });
  }
}

/**
 * A centralized manager for properties. This manager will handle the dependencies among properties and carefully update their values to minimize recomputation.
 */
export class PropertyManager {
  /**
   * A regex that matches all occurrences of `manager.getPropertyValue('<propertyName>')`.
   */
  static readonly PREREQUISITE_REGEX: RegExp = new RegExp(
    /manager\.getPropertyValue\((["'`])([^]+?)\1\)/,
    'g'
  );

  /**
   * A boolean used as lock for `notifyValueChange` method. `true` means the lock is occupied -- a value update is happening while `false` means the lock is free to grab -- no value update is happening.
   *
   * Since there is only a single process interacting with the manager, another call to `notifyValueChange` implies the subsequent value change is caused by antecedent value change, the one that is responsible for the call to `notifyValueChange` that takes the lock. Therefore, subsequent `notifyValueChange` calls, while the lock is occupied, can be ignored as these value change are handled by the `notifyValueChange` that occupies the lock.
   */
  private __notifyValueChangeLock = false;

  /**
   * A map contains mapping from property name to properties. Can be used internally to find property use its string name.
   */
  readonly nameToProperty = new Map<TPropertyName, Property<any>>();

  /**
   * A map contains mapping from property to last computed property value (if any).
   *
   * * The stored value is always up-to-date unless the value of a property that is ancestor of a passive property, a property whose update behavior is `Lazy`, in the dependency graph has its value updated.
   */
  readonly propertyValueSnapshot = new Map<Property<any>, any>();

  /**
   * A map contains mapping from property to its snapshot version.
   *
   * Snapshot version is stored as an integer, it can be used to tell whether a property's snapshot value changed or not since every snapshot update will increment the recorded version.
   */
  readonly propertyValueSnapshotVersion = new Map<Property<any>, number>();

  /**
   * This set contains properties for which this property's value change will be a direct cause of value update in those properties. In other words, this set contains those "active" (`updateBehavior.Immediate`) properties that are direct children of this property in dependency graph.
   *
   * For example, for the following dependency graph where an arrow from A to B means A participates in computing B's property value:
   *
   * ```
   *   A
   *  ⬋↓⬊
   * D ↓ B
   *  ⬊↓⬋ ⬊
   *   C   E
   * ```
   *
   * + A's active dependencies include B, C, D
   * + B's active dependencies include C, E
   * + C has no active dependencies
   * + D's active dependencies only include C
   * + E has no active dependencies
   */
  readonly propertyToActiveDependencies = new Map<Property<any>, Set<Property<any>>>();

  /**
   * Which dependency tier this property is on. A smaller number indicates a higher position in the dependency graph -- more properties depend on this property than the reverse direction. Dependency tier is used to determine in which order value update will occur.
   *
   * ```
   * A    -- Tier 0
   * ↓⬊
   * ↓ B  -- Tier 1
   * ↓⬋
   * C    -- Tier 2
   * ```
   *
   * Suppose A changed, then B will change, and lastly C will change.
   */
  readonly propertyToDependencyTier = new Map<Property<any>, number>();

  /**
   * Creates a property manager instance.
   *
   * @param properties - An array of properties whose inner dependencies will be automatically managed by this property manager.
   */
  constructor(properties: Array<Property<any>>) {
    for (const property of properties) {
      this.nameToProperty.set(property.name, property);
      // initialize every property with initial dependency tier 0 which represents a leaf in the dependency tree: it does not depend on any other properties
      this.propertyToDependencyTier.set(property, 0);
    }
    this._analyzeDependencies(properties);
  }

  /**
   * Return previous computed property value.
   *
   * @typedef TPropertyValue - The type for property value.
   * @param {Property<TPropertyValue>} property - The property to get last computed value of.
   * @returns Last computed value for specified property. `undefined` if there has not been any stored computed value for specified property. The stored value is always up-to-date unless the value belongs to an property which has an ancestor in the dependency graph that is a passive property -- a property whose update behavior is `Lazy and had its value updated.
   */
  getPropertyValueSnapshot<TPropertyValue>(property: Property<TPropertyValue>): TPropertyValue {
    return this.propertyValueSnapshot.get(property) as TPropertyValue;
  }

  /**
   *  Return previous computed property value.
   *
   * @typedef TPropertyValue - The type for property value.
   * @param propertyName - The name of a property to get last computed value of.
   * @returns Last computed value for specified property. `undefined` if there has not been any stored computed value for specified property.
   */
  getPropertyValueSnapshotWithName<TPropertyValue>(propertyName: TPropertyName): TPropertyValue {
    const property = this.nameToProperty.get(propertyName);
    return property && (this.propertyValueSnapshot.get(property) as TPropertyValue);
  }

  /**
   * Get the version number of the current stored value snapshot for specified property.
   *
   * ! Note: Since a property might have `Lazy` update behavior, version number is only up to date after `getPropertyValue` has been called. Additionally, one cannot assume version has only incremented once for a property if they have only changed its value once -- it might be affected by other properties.
   *
   * @typedef TPropertyValue - The type for property value.
   * @param property - A property to get snapshot version number of.
   * @returns Version number for stored snapshot of that property. Can be used to test whether a property has value updated.
   */
  getPropertyValueSnapshotVersion<TPropertyValue>(property: Property<TPropertyValue>): number {
    return getOrInsertDefault(this.propertyValueSnapshotVersion, property, 0);
  }

  /**
   * Get the version number of the current stored value snapshot for specified property.
   *
   * ! Note: Since a property might have `Lazy` update behavior, version number is only up to date after `getPropertyValue` has been called. Additionally, one cannot assume version has only incremented once for a property if they have only changed its value once -- it might be affected by other properties.
   *
   * @param propertyName - The name of a property to get snapshot version number of.
   * @returns Version number for stored snapshot of that property. Can be used to test whether a property has value updated.
   */
  getPropertyValueSnapshotVersionWithName(propertyName: string): number {
    const property = this.nameToProperty.get(propertyName);
    return this.getPropertyValueSnapshotVersion(property);
  }

  /**
   * Increment a property's version number by one.
   *
   * This will implicitly be called by `setPropertyValueSnapshot` when property value does not equal to its snapshot version. However, it can be useful to explicitly calling this method externally when a property's value is not changed through reassigning but through internal modification. For example, if an element was inserted into an array, the array's reference would not have changed but its snapshot version should be updated to reflect it no longer holds the same piece of data.
   *
   * @typedef TPropertyValue - The type for property value.
   * @param property - The property whose version number should be incremented.
   * @returns The previous version number of specified property.
   */
  incrementPropertyValueSnapshotVersion<TPropertyValue>(
    property: Property<TPropertyValue>
  ): number {
    const existingVersion = this.getPropertyValueSnapshotVersion(property);
    this.propertyValueSnapshotVersion.set(property, existingVersion + 1);
    return existingVersion;
  }

  /**
   *  Increment a property's version number by one.
   *
   * This will implicitly be called by `setPropertyValueSnapshot` when property value does not equal to its snapshot version. However, it can be useful to explicitly calling this method externally when a property's value is not changed through reassigning but through internal modification. For example, if an element was inserted into an array, the array's reference would not have changed but its snapshot version should be updated to reflect it no longer holds the same piece of data.
   * @param propertyName - The name of a property whose version number should be incremented.
   * @returns The previous version number of specified property.
   */
  incrementPropertyValueSnapshotVersionWithName(propertyName: string): number {
    const property = this.nameToProperty.get(propertyName);
    return this.incrementPropertyValueSnapshotVersion(property);
  }

  /**
   * Checks whether provided snapshot for specified property is outdated compared to current stored snapshot.
   *
   * @param propertyName - The name of a property whose snapshot will be checked.
   * @param {number} version - Provided snapshot version of property.
   * @returns {boolean} True if two snapshots are identical. False if otherwise.
   */
  isSnapshotVersionUpToDate(propertyName: string, version: number): boolean {
    const property = this.nameToProperty.get(propertyName);
    const currentVersion = this.getPropertyValueSnapshotVersion(property);
    if (currentVersion !== version) {
      return false;
    }

    return true;
  }

  /**
   * Get the up-to-date value of specified property.
   *
   * @typedef TPropertyValue - The type for property value.
   * @param propertyName - The name of a property managed by this property manager. The name of a property whose value is fetched.
   * @returns The value for specified property. If last computed value stored in snapshot can be reused, then it will use last computed value. Otherwise, a new computation and a value change event, for its subtree in dependency graph, will happen.
   */
  getPropertyValue<TPropertyValue>(propertyName: TPropertyName): TPropertyValue {
    const property = this.nameToProperty.get(propertyName);
    return property.getValue(property, this) as TPropertyValue;
  }

  /**
   * Update the property value stored in this property manager.
   *
   * @typedef TPropertyValue - The type for property value.
   * @param {Property<TPropertyValue>} property - The name of the property whose value will be changed.
   * @param value - A new value for this property. If different from currently stored value in snapshot, snapshot will be updated and this property's `onValueUpdate` function will be called to execute any side effect of value update.
   * @returns Old value for the property in the snapshot.
   */
  setPropertyValueSnapshot<TPropertyValue>(
    property: Property<TPropertyValue>,
    value: TPropertyValue
  ): TPropertyValue {
    const oldValue = this.getPropertyValueSnapshot(property);
    if (oldValue !== value) {
      this.setPropertyValueSnapshotSilently(property, value);
      property.onValueUpdate(oldValue, value, property, this);
    }
    return oldValue;
  }

  /**
   * Update the property value stored in this property manager without causing chained update.
   *
   * @typedef TPropertyValue - The type for property value.
   * @param {Property<any>} property - The name of the property whose value will be changed.
   * @param value - A new value for this property.
   */
  setPropertyValueSnapshotSilently<TPropertyValue>(
    property: Property<TPropertyValue>,
    value: TPropertyValue
  ): void {
    this.propertyValueSnapshot.set(property, value);
    this.incrementPropertyValueSnapshotVersion(property);
  }

  /**
   * Analyze a property to find all properties that have direct influence on the computation of this property's value -- the parent of this property in dependency graph.
   *
   * In more detail, this function will parse the source code of property's `__getValue` method (the method used to compute up-to-date property value internally) to find all unique properties managed by this property manager that directly participates the computation of this property's value.
   *
   * @param {Property} property - A property to get its "prerequisites" -- other properties that this property directly rely on to compute its value.
   * @param {boolean} _propagateImmediateUpdateBehavior - This is an internal property used to decide whether propagation of `Immediate` update behavior should happen. This should be set to `true` during first depth first search and `false` at later depth first searches (if any) as for later searches, propagation is handled in `getAllPrerequisitesButExcludeExploredActivePrerequisite`.
   * @returns {Set<Property<any>>} A set of properties that are this property's "prerequisites".
   */
  __analyzePropertyPrerequisites(
    property: Property<any>,
    _propagateImmediateUpdateBehavior = true
  ): Set<Property<any>> {
    const prerequisiteProperties: Set<Property<any>> = new Set();

    const matches = property.__getValue.toString().matchAll(PropertyManager.PREREQUISITE_REGEX);

    // the second capture group of each match contain an property that participates in this property's value computation (a "prerequisite")
    for (const match of matches) {
      const prerequisiteName: TPropertyName = match[2];
      const prerequisiteProperty: Property<any> = this.nameToProperty.get(prerequisiteName);
      if (!prerequisiteProperties.has(prerequisiteProperty)) {
        // this prerequisite property has not been tracked
        prerequisiteProperties.add(prerequisiteProperty);

        if (property.updateBehavior === UpdateBehavior.Immediate) {
          if (_propagateImmediateUpdateBehavior) {
            prerequisiteProperty.updateBehavior = UpdateBehavior.Immediate;
          }

          // record current property as a active dependency for "prerequisite". It is an active dependency as this property immediately recomputes its property value when its prerequisites have value change
          getOrInsertDefault(
            this.propertyToActiveDependencies,
            prerequisiteProperty,
            new Set()
          ).add(property);
        }
      }
    }

    return prerequisiteProperties;
  }

  /**
   * Parses a group of properties to understand their dependency graph and update behavior.
   *
   * This method is responsible for most of the property manager's initialization.
   *
   * @param properties - A group of properties whose dependencies and update behavior should be managed.
   */
  _analyzeDependencies(properties: Array<Property<any>>): void {
    // a temporary map to store a property's parents in the dependency graph
    const propertyToPrerequisites = new Map<Property<any>, Set<Property<any>>>();

    /**
     * The callback to execute for a property when a subtree in its prerequisite graph has been explored. It is used to compute the dependency level.
     *
     * @param property - Current property. This is the current node for current depth first search and also the parent of `prerequisiteProperty` in prerequisite graph (child in dependency graph).
     * @param prerequisiteProperty - A property that is prerequisite for `property`. In other words, this property influences `property`'s value computation. Also when this callback is executed, the subtree rooted by this node in the prerequisite graph has been explored.
     */
    const updateDependencyTierAfterSubtreeExplored = (
      property: Property<any>,
      prerequisiteProperty: Property<any>
    ) => {
      /**
       * Dependency tier is equivalent to the maximum subtree depth. A property at dependency tier x might have an outdated value if any properties at prior dependency tier (x - 1, x - 2, ..., 0) has its value updated.
       *
       * Therefore, a property is at minimum one greater than the dependency tier of its "prerequisite". By relaxing (maximizing) such constraint over all subtree in prerequisite graph, we get a correct dependency tier for this property.
       */
      const newDependencyTier = this.propertyToDependencyTier.get(prerequisiteProperty) + 1;
      const existingDependencyTier = this.propertyToDependencyTier.get(property);
      if (newDependencyTier > existingDependencyTier) {
        this.propertyToDependencyTier.set(property, newDependencyTier);
      }
    };

    /**
     * All properties that have been explored at least once (at most twice because of Immediate updateBehavior propagation)
     */
    const exploredProperties: Set<Property<any>> = new Set();
    let first = true;
    for (const property of properties) {
      if (first) {
        /**
         * For first depth first search, we have to use `__analyzePropertyPrerequisites` to find out prerequisites.
         *
         * @param property - A property to find its prerequisites -- properties it rely on to compute its value.
         */
        const getAllPrerequisites = (property: Property<any>) => {
          const prerequisites = this.__analyzePropertyPrerequisites(property, true);
          propertyToPrerequisites.set(property, prerequisites);
          return prerequisites;
        };

        depthFirstSearch(
          property,
          getAllPrerequisites,
          undefined,
          undefined,
          exploredProperties,
          updateDependencyTierAfterSubtreeExplored
        );

        first = false;
      } else if (!exploredProperties.has(property)) {
        // since the graph is not necessarily a tree, more than one search could be necessary
        const that = this;

        /**
         * This function is used to find edges in the prerequisites graph. Different from `getAllPrerequisites`, it is also responsible for handling `Immediate` update behavior propagation.
         *
         * @param property - A property to find its prerequisites for.
         */
        const getAllPrerequisitesButExcludeExploredActivePrerequisite = function* (
          property: Property<any>
        ) {
          // this property might have been explored in prior search, reuse "prerequisites" to save computation
          let prerequisites = propertyToPrerequisites.get(property);
          if (prerequisites === undefined) {
            // we have to compute "prerequisites"
            propertyToPrerequisites.set(
              property,
              (prerequisites = that.__analyzePropertyPrerequisites(property, false))
            );
          }

          for (const prerequisite of prerequisites) {
            if (exploredProperties.has(prerequisite)) {
              // already explored this property in prior search, only explore again if `Immediate` update behavior propagation is necessary -- a property whose update behavior is `Immediate` requires all its descendants in prerequisites graph (ancestors in dependency graph) to have `Immediate update behavior.
              if (
                property.updateBehavior === UpdateBehavior.Immediate &&
                prerequisite.updateBehavior === UpdateBehavior.Lazy
              ) {
                prerequisite.updateBehavior = UpdateBehavior.Immediate;
                // explore prerequisite again in case for recursive update
                yield prerequisite;
              } else {
                // even though we can avoid exploring the subtree, we still need to consider this prerequisite in computing this property's dependency tier because this relationship has not yet been included in dependency tier calculation
                updateDependencyTierAfterSubtreeExplored(property, prerequisite);
              }
            } else {
              yield prerequisite;
            }
          }
        };

        /**
         * This function ensures we explore a property and its subtree in prerequisites graph at most twice (second time only happens if `Immediate` update behavior propagation is necessary).
         *
         * @param property - A property that is currently explored by the depth first search.
         */
        const addToExploredProperties = (property: Property<any>) =>
          exploredProperties.add(property);

        depthFirstSearch(
          property,
          getAllPrerequisitesButExcludeExploredActivePrerequisite,
          addToExploredProperties,
          undefined,
          undefined,
          updateDependencyTierAfterSubtreeExplored
        );
      }
    }
  }

  /**
   * Notify the active "descendants" of this property in dependency graph that the value of this property has changed, a recomputation of value might be needed.
   *
   * @param property - A property whose value has changed.
   */
  notifyValueChange(property: Property<any>): void {
    if (this.__notifyValueChangeLock === false) {
      // prevent subsequent `notifyValueChange` calls triggered by this call during updating values in dependency graph
      this.__notifyValueChangeLock = true;
    } else {
      return;
    }

    /**
     * Notifies active dependencies -- properties that have this property as a prerequisite and has `Immediate` update behavior.
     * @param property - A property to get its active dependencies, descendants in the dependency graph, for.
     */
    const getChildren = (property: Property<any>) =>
      getOrInsertDefault(this.propertyToActiveDependencies, property, new Set());

    /**
     * Requests a recomputation of its value, if necessary.
     * @param property - Current property explored in the search.
     */
    const action = (property: Property<any>) => property.getValue(property, this);

    /**
     * Determines which property should be explored first -- have their value recomputed first.
     *
     * This comparator will explore the property with a smaller dependency tier, since a property with a smaller dependency tier will never depend on a property with a larger one while the property with a larger one might depend on the property with a smaller one. Therefore, by prioritizing updating values of properties with smaller dependency tier, recomputation is avoided as much as possible.
     *
     * @param property1 - A property that has `Immediate` update behavior.
     * @param property2 - Another property that has `Immediate` update behavior.
     */
    const comparator = (property1: Property<any>, property2: Property<any>) =>
      this.propertyToDependencyTier.get(property1) - this.propertyToDependencyTier.get(property2);

    for (const childProperty of getChildren(property)) {
      AStarSearch<Property<any>>(childProperty, getChildren, comparator, action);
    }

    // new calls to `notifyValueChange` will no longer be caused by this call
    this.__notifyValueChangeLock = false;
  }

  /**
   * A convenient utility function that binds all properties managed by this property manager to an object.
   *
   * @param target - An object where this property is defined.
   * @see {@link Property#bind} for how each property is bound.
   */
  bind(target: any): void {
    for (const property of this.nameToProperty.values()) {
      property.bind(target, this);
    }
  }
}
