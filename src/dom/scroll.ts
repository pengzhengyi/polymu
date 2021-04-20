/**
 * Finds the first scroll parent of a specified element. Scroll parent is defined to be the closest ancestor element that is scrollable.
 *
 * `document.scrollingParent` will be returned as the fallback value.
 *
 * @see {@link https://stackoverflow.com/questions/35939886/find-first-scrollable-parent}
 *
 * @param {HTMLElement} element - An element to finds its scroll parent.
 * @param {boolean} [includeHidden = false] - Whether an element with overflow(x|y) set to `hidden` will be considered as a scroll parent. {@link https://developer.mozilla.org/en-US/docs/Web/CSS/overflow}
 */
export function getScrollParent(element: HTMLElement, includeHidden = false): Element {
  const fallback = document.scrollingElement || document.body;
  let style = getComputedStyle(element);
  const excludeStaticParent = style.position === 'absolute';
  const overflowRegex = includeHidden ? /(auto|scroll|hidden)/ : /(auto|scroll)/;

  if (style.position === 'fixed') {
    return fallback;
  }

  for (let parent = element; (parent = parent.parentElement); ) {
    style = getComputedStyle(parent);
    if (excludeStaticParent && style.position === 'static') {
      continue;
    }
    if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX)) return parent;
  }

  return fallback;
}

/**
 * An enumeration of possible scroll directions.
 */
export enum ScrollDirection {
  Up,
  Down,
  Left,
  Right,
  /** Indicates no scrolling happened */
  Stay,
}

/**
 * Whether provided scroll direction is towards the first element of the potential view. In other words, whether current displayed elements will be substituted by elements with smaller indices in the potential view.
 *
 * @param scrollDirection - A scroll direction.
 * @returns `true` if the scroll direction is towards start, `false` otherwise.
 */
export function isScrollDirectionTowardsStart(scrollDirection: ScrollDirection): boolean {
  switch (scrollDirection) {
    case ScrollDirection.Up:
    case ScrollDirection.Left:
      return true;
    default:
      return false;
  }
}

/**
 * Whether provided scroll direction is towards the last element of the potential view. In other words, whether current displayed elements will be substituted by elements with larger indices in the potential view.
 *
 * @param scrollDirection - A scroll direction.
 * @returns `true` if the scroll direction is towards end, `false` otherwise.
 */
export function isScrollDirectionTowardsEnd(scrollDirection: ScrollDirection): boolean {
  switch (scrollDirection) {
    case ScrollDirection.Down:
    case ScrollDirection.Right:
      return true;
    default:
      return false;
  }
}
