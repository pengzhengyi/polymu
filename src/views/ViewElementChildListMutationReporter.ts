/**
 * This module provides a simple utility class that can be used to monitor child list mutations happening to a ViewElement's underlying element.
 */

import { ViewElement } from '../view-element/ViewElement';

/**
 * `ViewElementChildListMutationReporter` allow monitoring child list mutations happening to a ViewElement's underlying element. When such mutations are observed, they will be reported in corresponding custom event -- `ChildListChangeEvent`.
 */
export class ViewElementChildListMutationReporter {
  /**
   * Create an instance of `ViewElementChildListMutationReporter`.
   *
   * @param viewElement - A `ViewElement` whose underlying DOM element will be monitored for child list mutations.
   * @constructs ViewElementChildListMutationReporter
   */
  constructor(readonly viewElement: ViewElement) {
    this.viewElement = viewElement;
    this.viewElement.initializeMutationReporter();
  }

  /**
   * Ask `this.viewElement` to monitor childlist DOM mutations. Only childlist mutations on direct children of its underlying element will be handled.
   */
  observe(): void {
    // we only need to track childlist change on direct children of `this.this.viewElement.element_`
    this.viewElement.observe__(this.viewElement.element_, false, undefined, false, true, false);
  }

  /**
   * Stop monitoring DOM mutations.
   */
  unobserve(): void {
    this.viewElement.unobserve__(this.viewElement.element_);
  }

  /**
   * Perform necessary cleanup procedures.
   */
  dispose(): void {
    this.viewElement.dispose();
  }
}
