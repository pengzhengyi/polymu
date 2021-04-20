/**
 * @module
 * This module encapsulates utility function to manipulate **property** of any HTML element.
 *
 * A property is one of the following
 *    + a HTML attribute, regulated by functions like {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/getAttribute}
 *    + a property defined on HTMLElement {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement} of the specific subclass of HTMLElement.
 *    + a custom property
 */

/**
 * Attempts to get property value under given name.
 *
 * @param {HTMLElement} element - Where the property might be registered.
 * @param {string} propertyName - A HTML attribute name, JS property name, or custom property name.
 * @returns The associated property value. `undefined` if no property is registered under provided name.
 */

export function getProperty(element: HTMLElement, propertyName: string): any {
  if (element.hasAttribute(propertyName)) {
    return element.getAttribute(propertyName);
  } else {
    return (element as { [key: string]: any })[propertyName];
  }
}

/**
 * Checks whether an element has a property.
 *
 * @param {HTMLElement} element - Where the property might be registered.
 * @param {string} propertyName - A HTML attribute name, JS property name, or custom property name.
 * @returns {boolean} Whether a property is registered under provided name.
 */

export function hasProperty(element: HTMLElement, propertyName: string): boolean {
  // `in` operator is used since we want to search over prototype chain
  return element.hasAttribute(propertyName) || propertyName in element;
}

/**
 * Attempts to change property value associated with given name. If no property exists with provided name, this value will be registered as a custom property, like registering a field in JS object.
 *
 * @param {HTMLElement} element - Where the property might be registered.
 * @param {string} propertyName - A HTML attribute name, JS property name, or custom property name.
 * @param {any} propertyValue - The value to be registered under the provided name.
 */

export function setProperty(element: HTMLElement, propertyName: string, propertyValue: any): void {
  if (element.hasAttribute(propertyName)) {
    element.setAttribute(propertyName, propertyValue);
  } else {
    (element as { [key: string]: any })[propertyName] = propertyValue;
  }
}
