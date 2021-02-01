/**
 * @module
 * This module provide utility functions for Array.
 */

function swap<T>(array: Array<T>, sourceIndex: number, endIndex: number) {
  const sourceElement: T = array[sourceIndex];
  array[sourceIndex] = array[endIndex];
  array[endIndex] = sourceElement;
}

function getRandomInt(min: number, difference: number) {
  return Math.floor(Math.random() * difference + min);
}

/**
 * Implements a Quick Sort algorithm that sorts in O(n * lg n) expected time where n is the number of elements.
 * 
 * @param {Array<T>} array - The array to be sorted.
 * @param {(element1: T, element2: T) => number} comparator - A comparison function that determines the ordering between two elements.
 * @param {number} start - The index of first element in the array to be sorted, inclusive.
 * @param {number} end - The first index after the index of the last element in the array to be sorted, exclusive.
 */
export function quickSort<T>(
  array: Array<T>,
  comparator: (element1: T, element2: T) => number,
  start: number = 0,
  end: number = array.length
) {
  const difference: number = end - start;
  switch (difference) {
    case 0:
    // fallthrough
    case 1:
      return;
    case 2:
      if (comparator(array[start + 1], array[start]) < 0) {
        swap(array, start, start + 1);
      }
      return;
    default:
      let pivotIndex: number = getRandomInt(start, difference);
      const pivotElement: T = array[pivotIndex];
      if (pivotIndex !== start) {
        array[pivotIndex] = array[start];
        pivotIndex = start;
      }

      // quick sort
      for (let i = start + 1; i < end; i++) {
        const element: T = array[i];
        if (comparator(element, pivotElement) < 0) {
          // current element is smaller than the pivot element in comparison ordering
          array[pivotIndex++] = element;
          if (pivotIndex !== i) {
            // there exists elements greater than the pivot element at this point
            array[i] = array[pivotIndex];
          }
        }
      }

      array[pivotIndex] = pivotElement;
      quickSort(array, comparator, start, pivotIndex);
      quickSort(array, comparator, pivotIndex + 1, end);
  }
}
