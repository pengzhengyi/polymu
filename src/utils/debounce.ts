type EventHandler = (event: Event) => void;

/**
 * Rate limit a callback function using {@link https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame Window.requestAnimationFrame}. In more detail, even when the rate limited callback is invoked many times, it will be called at most one during any animation frame.
 *
 * @param {EventHandler} callback - The callback to be rate limited. `this` will be preserved in the rate limited callback.
 */
export const rateLimit = (callback: EventHandler): EventHandler => {
  let ticking = false;
  return (event: Event) => {
    if (!ticking) {
      ticking = true;

      window.requestAnimationFrame(() => {
        callback(event);
        ticking = false;
      });
    }
  };
};

/**
 * Delay the execution of a callback function until it is not invoked again during a `cooldown` timeout period. In other words, the callback is executed when the same callback is not invoked again for some time.
 *
 * This debounce behavior is useful to create a callback that should be executed at least once, and where multiple invocations of this callback in a short internal will be either unnecessarily expensive or deleterious.
 *
 * @param {EventHandler} callback - The callback to be debounced.
 * @param {number} cooldown - Specify a timeout in milliseconds during which a later invocation of same callback will invalidate the current one (the cooldown for the later invocation will start).
 */
export const executeAfterCooldown = (callback: EventHandler, cooldown: number): EventHandler => {
  let timeoutID: number = null;
  return (event: Event) => {
    window.clearTimeout(timeoutID);
    timeoutID = window.setTimeout(() => callback(event), cooldown);
  };
};
