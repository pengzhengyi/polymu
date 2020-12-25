import { SortingFunction } from '../ViewFunction';

export default class Heap<TElement> implements Iterable<TElement> {
  private _array: Array<TElement>;
  private _count: number = 0;

  constructor(private readonly _comparator: SortingFunction<TElement>, capacity: number = 0) {
    this._array = new Array<TElement>(capacity);
  }

  [Symbol.iterator](): IterableIterator<TElement> {
    const copy = new Heap<TElement>(this._comparator);
    copy._array = this._array.slice(0, this._count + 1);
    copy._count = this._count;
    return copy.popAll();
  }

  push(...elements: Array<TElement>) {
    elements.forEach((element) => {
      this._bubbleUp(element);
      this._count++;
    });
  }

  pop(): TElement {
    switch (this._count) {
      case 0:
        return undefined;
      case 1:
        return this._array[--this._count];
      default:
        const popped = this._array[0];
        this._count--;
        this._bubbleDown();
        return popped;
    }
  }

  *popAll(): IterableIterator<TElement> {
    while (this._count > 0) {
      yield this.pop();
    }
  }

  peek(): TElement {
    return this._array[0];
  }

  get capacity(): number {
    return this._array.length;
  }

  get length(): number {
    return this._count;
  }

  private _leftChildIndex(index: number): number {
    return index * 2 + 1;
  }

  private _rightChildIndex(index: number): number {
    return index * 2 + 2;
  }

  private _parentIndex(index: number): number {
    return Math.floor((index - 1) / 2);
  }

  private _bubbleUp(element: TElement) {
    const lastIndex = this._count;
    let toReplaceIndex = lastIndex;
    while (toReplaceIndex > 0) {
      const parentIndex = this._parentIndex(toReplaceIndex);
      const parentElement = this._array[parentIndex];
      if (this._comparator(element, parentElement) < 0) {
        // shift `parentElement` down
        this._array[toReplaceIndex] = parentElement;
        toReplaceIndex = parentIndex;
      } else {
        // bubbling stops here
        break;
      }
    }

    this._array[toReplaceIndex] = element;
  }

  private _bubbleDown() {
    const lastPlace = this._count;
    const lastElement = this._array[lastPlace];
    let toReplaceIndex = 0;
    while (true) {
      const leftChildIndex = this._leftChildIndex(toReplaceIndex);
      if (leftChildIndex >= lastPlace) {
        break;
      }

      const rightChildIndex = leftChildIndex + 1;
      if (rightChildIndex >= lastPlace) {
        break;
      }

      const leftElement = this._array[leftChildIndex];
      const rightElement = this._array[rightChildIndex];

      if (this._comparator(leftElement, rightElement) < 0) {
        if (this._comparator(lastElement, leftElement) <= 0) {
          // bubbling stop here
          break;
        }
        this._array[toReplaceIndex] = leftElement;
        toReplaceIndex = leftChildIndex;
      } else {
        if (this._comparator(lastElement, rightElement) <= 0) {
          // bubbling stop here
          break;
        }
        this._array[toReplaceIndex] = rightElement;
        toReplaceIndex = rightChildIndex;
      }
    }

    this._array[toReplaceIndex] = lastElement;
  }
}