/**
 * @module
 *
 * This module provides an implementation of the Subscription model, where `EventNotifier` can `invoke` events and upon event invocation, all subscribers on this event will be "notified" -- their registered handlers will be called.
 */

/**
 * Represents a event handler function. Provided by subscriber at event subscription.
 *
 * @param {string} eventName - which event this handler responds to.
 * @param {EventNotifier} source - A reference to the event source.
 * @param {any} subscriber - A reference to the subscriber.
 * @param {Array<any>} eventArgs - An optional list of event arguments.
 */

type EventHandler = (
  eventName: string,
  source: EventNotifier,
  subscriber: unknown,
  ...eventArgs: Array<unknown>
) => void;
/**
 * A dictionary stores information about event subscription. It is a mapping from event name to a mapping from subscriber to event handler.
 */

type EventSubscription = Map<string, Map<unknown, EventHandler>>;

/**
 * An entity that is able to `invoke` events and can accept event subscription.
 */

export class EventNotifier {
  /** Stores information about active subscriptions for each event. */
  protected eventSubscription: EventSubscription = new Map<string, Map<unknown, EventHandler>>();
  /** A set of events that should not be invoked. It can be useful in temporarily disabling emitting of certain events. */
  protected _disabledEventNames: Set<string> = new Set();

  /**
   * Register an event subscription.
   *
   * @param subscriber - A reference to the subscriber.
   * @param {string} eventName - The event that this handler responds to.
   * @param {EventHandler} eventHandler - How invocation of specified event will be handled for this subscriber.
   */

  subscribe(subscriber: unknown, eventName: string, eventHandler: EventHandler): void {
    if (!this.eventSubscription.has(eventName)) {
      this.eventSubscription.set(eventName, new Map());
    }

    this.eventSubscription.get(eventName).set(subscriber, eventHandler);
  }

  /**
   * Unregister an event subscription.
   *
   * @param subscriber - A reference to the subscriber.
   * @param {string} eventName - The event which this subscriber is unsubscribing from.
   * @returns {boolean} Whether the un-subscription is successful -- if a subscription previously exists and is removed.
   */

  unsubscribe(subscriber: unknown, eventName: string): boolean {
    if (this.eventSubscription.has(eventName)) {
      return this.eventSubscription.get(eventName).delete(subscriber);
    }
  }

  /**
   * Emit an event. Notify all subscribers of this event.
   *
   * @param {string} eventName - Name of the event which should be invoked.
   * @param {Array<u>} eventArgs - An optional list of event arguments.
   */

  invoke(eventName: string, ...eventArgs: Array<unknown>): void {
    if (!this._disabledEventNames.has(eventName) && this.eventSubscription.has(eventName)) {
      // notify every subscriber
      for (const [subscriber, eventHandler] of this.eventSubscription.get(eventName)) {
        eventHandler(eventName, this, subscriber, ...eventArgs);
      }
    }
  }

  /**
   * Prevents an event from being invoked.
   *
   * @param {string} eventName - The name of the disabled event.
   */

  disableEventNotification(eventName: string): void {
    this._disabledEventNames.add(eventName);
  }

  /**
   * Re-allows an event to be invoked.
   *
   * @param {string} eventName - The name of the disabled event. No effect if the specified event is already enabled.
   */

  enableEventNotification(eventName: string): boolean {
    return this._disabledEventNames.delete(eventName);
  }
}
