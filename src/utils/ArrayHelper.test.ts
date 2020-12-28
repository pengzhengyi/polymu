import { quickSort } from './ArrayHelper';

function getRandomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(min);
  return Math.floor(Math.random() * (max - min) + min);
}

describe('Quick Sort', () => {
  const comparator = (n1: number, n2: number) => n1 - n2;

  test('full array sorting', () => {
    const array = [1, 2, 3, 4, 5];
    const result = array.slice();
    quickSort(result, comparator);
    array.sort();
    debugger;
    expect(result).toEqual(array);

    const reversedArray = array.reverse();
    const result2 = reversedArray.slice();
    quickSort(result2, comparator);
    reversedArray.sort();
    expect(reversedArray).toEqual(result2);
  });

  test('partial sorting', () => {
    const array = [5, 4, 3, 2, 1];
    const result1 = [3, 4, 5, 2, 1];
    const array1 = array.slice();
    quickSort(array1, comparator, 0, 3);
    expect(array1).toEqual(result1);

    const result2 = [2, 3, 4, 5, 1];
    const array2 = array.slice();
    quickSort(array2, comparator, 0, 4);
    expect(array2).toEqual(result2);

    const result3 = [5, 2, 3, 4, 1];
    const array3 = array.slice();
    quickSort(array3, comparator, 1, 4);
    expect(array3).toEqual(result3);
  });

  test('random sorting', () => {
    for (let i = 0; i < 10000; i++) {
      const arrayLength = getRandomInt(2, 35);
      const array = [];
      const array2 = [];
      for (let e = 0; e < arrayLength; e++) {
        const element = getRandomInt(-10, 10);
        array.push(element);
        array2.push(element);
      }

      const sortedArray = array.sort(comparator);
      quickSort(array2, comparator);
      expect(array2).toEqual(sortedArray);
    }
  });
});
