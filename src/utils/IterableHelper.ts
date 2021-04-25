/**
 * @module
 * This module provide utility functions for Iterable.
 */

/**
 * If two iterables have different length, then there are two possible scenarios:
 *
 *      + SURPLUS (iterable1): there is a element in `iterable1` that does not have a matching element in `iterable2`.
 *      + SURPLUS (iterable2): there is a element in `iterable2` that does not have a matching element in `iterable1`.
 *
 *                          SURPLUS (iterable1)
 *    iterable1:  [ - - - - - - - ]
 *    iterable2:  [ - - - ]
 *                  MATCH
 *
 *                  MATCH
 *    iterable1:  [ - - - ]
 *    iterable2:  [ - - - - - - - ]
 *                          SURPLUS (iterable2)
 *
 * This method provide an iteration protocol that enumerates two iterables and take action for each pairing situation (MATCH, SURPLUS iterable1, SURPLUS iterable2).
 *
 * @param iterable1 - The first iterable.
 * @param iterable2 - The second iterable.
 * @param matchHandler - A callback to be executed when there are elements in both iterable at specified index. Will be called with both elements and index.
 * @param iterable1SurplusHandler - A callback to be executed when there is only element in `iterable1` at specified index. Will be called with that element and index.
 * @param iterable2SurplusHandler - A callback to be executed when there is only element in `iterable2` at specified index. Will be called with that element and index.
 */
export function patch<T1, T2>(
  iterable1: Iterable<T1>,
  iterable2: Iterable<T2>,
  matchHandler: (
    elementFromIterable1: T1,
    elementFromIterable2: T2,
    index: number
  ) => void = undefined,
  iterable1SurplusHandler: (elementFromIterable1: T1, index: number) => void = undefined,
  iterable2SurplusHandler: (elementFromIterable2: T2, index: number) => void = undefined
): void {
  let childIndex = 0;
  const iterator2 = iterable2[Symbol.iterator]();
  let iterable2Done = false;
  let elementFromIterable2: T2;

  for (const elementFromIterable1 of iterable1) {
    if (iterable2Done) {
      // iterable1 surplus
      iterable1SurplusHandler && iterable1SurplusHandler(elementFromIterable1, childIndex);
    } else {
      ({ value: elementFromIterable2, done: iterable2Done } = iterator2.next() as {
        value: T2;
        done: boolean;
      });
      if (iterable2Done) {
        // iterable1 has element not matched by iterable2
        iterable1SurplusHandler && iterable1SurplusHandler(elementFromIterable1, childIndex);
      } else {
        // match
        matchHandler && matchHandler(elementFromIterable1, elementFromIterable2, childIndex);
      }
    }

    childIndex++;
  }

  // all elements in iterable1 has been iterated over, handle remaining unmatched elements in iterable2 if exists
  if (!iterable2Done && iterable1SurplusHandler) {
    iteratorForEach(iterator2, (element, index) =>
      iterable2SurplusHandler(element, childIndex + index)
    );
  }
}

/**
 * Similar to `forEach` function but applies to iterator.
 *
 * @param iterator - A iterator.
 * @param callback - A callback function to be executed on every element and its index in the iterator.
 */
export function iteratorForEach<T>(
  iterator: Iterator<T>,
  callback: (element: T, index: number) => void
): void {
  let index = 0;
  while (true) {
    const { value, done } = iterator.next() as { value: T; done: boolean };
    if (done) {
      break;
    } else {
      callback(value, index++);
    }
  }
}

/**
 * Check whether an object is iterable.
 *
 * @param obj - An object to check whether it is iterable.
 * @returns True if the object is iterable. False otherwise.
 */
export function isIterable(obj: any): boolean {
  // checks for null and undefined
  if (obj === null || obj === undefined) {
    return false;
  }

  return typeof obj[Symbol.iterator] === 'function';
}

/**
 * Peek the first element of an iterable. Then iterate the iterable including the first element.
 *
 * @param iterable - An iterable to be iterated.
 * @yields Elements of iterable, where first element is iterated twice at the beginning.
 */
export function* peek<T>(iterable: Iterable<T>): IterableIterator<T> {
  let isFirst = true;
  for (const element of iterable) {
    if (isFirst) {
      yield element;
      isFirst = false;
    }

    yield element;
  }
}
