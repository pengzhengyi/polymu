/**
 * This interface describes a class that expose an iterable of features, where each feature should be a class method.
 *
 * @example
 * class Car implements IFeatureProvider {
 *   features: Array<string> = ['start', 'stop'];
 *
 *   speed: number = 0;
 *
 *   getFeatures() {
 *     return this.features;
 *   }
 *
 *   start(speed: number) {
 *     this.speed = speed;
 *   }
 *
 *   stop() {
 *     this.speed = 0;
 *   }
 * }
 */
export interface IFeatureProvider {
  /**
   * Returns an iterable of feature names.
   *
   * @returns {IterableIterator<string> | Iterable<string>} Features this class provides.
   */

  getFeatures(): IterableIterator<string> | Iterable<string>;
}

/**
 * Add features to target. More specifically, it collects features from all the feature providers and register these features as bound functions in target.
 *
 * @param target - Where the features will be registered as class properties.
 * @param {IterableIterator<IFeatureProvider>} featureProvider - An iterable of IFeatureProviders that expose features.
 */

export function composeFeatures(
  target: unknown,
  featureProviders: IterableIterator<IFeatureProvider> | Array<IFeatureProvider>
): void {
  const props: PropertyDescriptorMap = {};
  for (const featureProvider of featureProviders) {
    for (const feature of featureProvider.getFeatures()) {
      props[feature] = { value: (featureProvider as any)[feature].bind(featureProvider) };
    }
  }
  Object.defineProperties(target, props);
}
