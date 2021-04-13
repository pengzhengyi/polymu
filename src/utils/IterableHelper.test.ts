import { patch } from './IterableHelper';

describe('patch test', () => {
  test('iterable1 and iterable2 has same length', () => {
    const iterable1 = [1, 2, 3];
    const iterable2 = [1, 3, 5];
    const matchHandler = (e1: number, e2: number, index: number) => expect(e2 - e1).toEqual(index);
    const failWhenCalled = () => fail();

    patch(iterable1, iterable2, matchHandler, failWhenCalled, failWhenCalled);
  });

  test('iterable1 has longer length', () => {
    const iterable1 = [1, 2, 3, -1, -1];
    const iterable2 = [1, 3, 5];
    const matchHandler = (e1: number, e2: number, index: number) => expect(e2 - e1).toEqual(index);
    const iterable1SurplusHandler = (e1: number) => expect(e1).toEqual(-1);
    const failWhenCalled = () => fail();

    patch(iterable1, iterable2, matchHandler, iterable1SurplusHandler, failWhenCalled);
  });

  test('iterable2 has longer length', () => {
    const iterable1 = [1, 2, 3];
    const iterable2 = [1, 3, 5, -1, -1];
    const matchHandler = (e1: number, e2: number, index: number) => expect(e2 - e1).toEqual(index);
    const iterable2SurplusHandler = (e2: number) => expect(e2).toEqual(-1);
    const failWhenCalled = () => fail();

    patch(iterable1, iterable2, matchHandler, failWhenCalled, iterable2SurplusHandler);
  });

  test('iterable1 is empty', () => {
    const iterable1: Array<number> = [];
    const iterable2 = [1, 1, 1];
    const failWhenCalled = () => fail();
    const iterable2SurplusHandler = (e2: number) => expect(e2).toEqual(1);

    patch(iterable1, iterable2, failWhenCalled, failWhenCalled, iterable2SurplusHandler);
  });

  test('iterable2 is empty', () => {
    const iterable2: Array<number> = [];
    const iterable1 = [1, 1, 1];
    const failWhenCalled = () => fail();
    const iterable1SurplusHandler = (e1: number) => expect(e1).toEqual(1);

    patch(iterable1, iterable2, failWhenCalled, iterable1SurplusHandler, failWhenCalled);
  });
});
