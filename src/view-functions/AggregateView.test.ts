import { AbstractViewFunction } from './AbstractViewFunction';
import { AggregateView } from './AggregateView';
import { FilteredView } from './FilteredView';
import { PartialView } from './PartialView';
import { ScrollView } from './ScrollView';
import { SortedView } from './SortedView';

describe('AggregateView', () => {
  test('empty', () => {
    const vc = new AggregateView<number>();
    expect([...vc.view([1])]).toEqual([1]);
    expect([...vc.view([2])]).toEqual([2]);
  });

  test('chain', () => {
    const sv = new SortedView<number>();
    sv.addSortingFunction('desc', (n1, n2) => n2 - n1, 1);
    const fv = new FilteredView<number>();
    fv.addFilterFunction('no 1', (n) => n != 1);
    fv.addFilterFunction('<= 3', (n: number) => n <= 3);

    const vc = new AggregateView<number>([sv, fv]);
    expect([...vc.view([1, 2, 3, 4, 5])]).toEqual([3, 2]);
    expect((vc as any).deleteFilterFunction('no 1')).toBe(true);
    expect([...vc.view([1, 2, 3, 4, 5])]).toEqual([3, 2, 1]);

    vc.viewFunctions.length = 0;
    expect([...vc.view([1])]).toEqual([1]);
  });

  test('registered view function view update', () => {
    const fv = new FilteredView<number>();
    const vc = new AggregateView<number>([fv]);
    expect([...vc.view([1, 2, 3, 4, 5])]).toEqual([1, 2, 3, 4, 5]);
    expect((fv as any).shouldRegenerateView).toBe(false);
    expect((vc as any).shouldRegenerateView).toBe(false);

    fv.addFilterFunction('<= 3', (n: number) => n <= 3);
    expect((fv as any).shouldRegenerateView).toBe(true);
    expect((vc as any).shouldRegenerateView).toBe(true);

    expect([...vc.view([1, 2, 3, 4, 5])]).toEqual([1, 2, 3]);
    expect((fv as any).shouldRegenerateView).toBe(false);
    expect((vc as any).shouldRegenerateView).toBe(false);
  });

  test('this reference', () => {
    const sv = new SortedView<number>();
    const fv = new FilteredView<number>();
    const vc = new AggregateView<number>([sv, fv]);
    (vc as any).addFilterFunction('<= 3', (n: number) => n <= 3);
    expect([...vc.view([1, 2, 3, 4, 5])]).toEqual([1, 2, 3]);
  });

  test('get notification', () => {
    const sv = new SortedView<number>();
    const fv = new FilteredView<number>();
    const vc = new AggregateView<number>([sv, fv]);

    const eventHandler = jest.fn();
    vc.subscribe({}, AbstractViewFunction.shouldRegenerateViewEventName, eventHandler);
    expect(eventHandler.mock.calls).toHaveLength(0);

    expect([...vc.view([1, 2, 3, 4, 5])]).toEqual([1, 2, 3, 4, 5]);
    sv.addSortingFunction('desc', (n1, n2) => n2 - n1, 1);
    expect(eventHandler.mock.calls).toHaveLength(1);
    expect([...vc.view([1, 2, 3, 4, 5])]).toEqual([5, 4, 3, 2, 1]);
    sv.deleteSortingFunction('desc');
    expect(eventHandler.mock.calls).toHaveLength(2);
  });

  test('exposed features', () => {
    const sv = new SortedView<number>();
    const fv = new FilteredView<number>();
    const pv = new PartialView<number>(0, 4);
    const vc = new AggregateView<number>([fv, sv, pv]);
    const featureSet: Set<string> = new Set(
      (sv.getFeatures() as Array<string>).concat(
        fv.getFeatures() as Array<string>,
        pv.getFeatures() as Array<string>
      )
    );
    const featureSetFromViewChain = new Set(vc.getFeatures());
    expect(featureSetFromViewChain).toEqual(featureSet);
  });

  test('pushing and popping view functions in AggregateView', () => {
    const vc = new AggregateView<number>();
    const fv = new FilteredView<number>();
    expect(vc.viewFunctions).toHaveLength(0);
    vc.viewFunctions.push(fv);

    expect(vc.viewFunctions).toHaveLength(1);
    const array = Array.from(Array(100).keys());
    let targetView = Array.from(vc.view(array));
    expect(targetView).toHaveLength(100);

    fv.addFilterFunction('less than 10', (number) => number < 10);
    targetView = Array.from(vc.view(array));
    expect(targetView).toHaveLength(10);

    expect(vc.viewFunctions.pop()).toBe(fv);
    expect(vc.viewFunctions).toHaveLength(0);

    targetView = Array.from(vc.view(array));
    expect(targetView).toHaveLength(100);
  });

  test('shifting and unshifting view functions in AggregateView', () => {
    const vc = new AggregateView<number>();
    const fv = new FilteredView<number>();
    expect(vc.viewFunctions).toHaveLength(0);
    vc.viewFunctions.unshift(fv);

    expect(vc.viewFunctions).toHaveLength(1);
    const array = Array.from(Array(100).keys());
    let targetView = Array.from(vc.view(array));
    expect(targetView).toHaveLength(100);

    fv.addFilterFunction('less than 10', (number) => number < 10);
    targetView = Array.from(vc.view(array));
    expect(targetView).toHaveLength(10);

    expect(vc.viewFunctions.shift()).toBe(fv);
    expect(vc.viewFunctions.shift()).toBeUndefined();
    expect(vc.viewFunctions).toHaveLength(0);

    targetView = Array.from(vc.view(array));
    expect(targetView).toHaveLength(100);
  });

  test('splicing view functions in AggregateView', () => {
    const vc = new AggregateView<number>();
    const fv = new FilteredView<number>();
    expect(vc.viewFunctions).toHaveLength(0);
    vc.viewFunctions.splice(0, 0, fv);

    expect(vc.viewFunctions).toHaveLength(1);
    const array = Array.from(Array(100).keys());
    let targetView = Array.from(vc.view(array));
    expect(targetView).toHaveLength(100);

    fv.addFilterFunction('less than 10', (number) => number < 10);
    targetView = Array.from(vc.view(array));
    expect(targetView).toHaveLength(10);

    expect(vc.viewFunctions.splice(0, 1)).toEqual([fv]);
    expect(vc.viewFunctions).toHaveLength(0);

    targetView = Array.from(vc.view(array));
    expect(targetView).toHaveLength(100);
  });

  test('unsupported operations in view functions', () => {
    const vc = new AggregateView<number>();
    const fv = new FilteredView<number>();
    expect(vc.viewFunctions).toHaveLength(0);

    expect(() => vc.viewFunctions.fill(fv)).toThrowError('not supported');
    expect(() => vc.viewFunctions.copyWithin(5, 0, 2)).toThrowError('not supported');
  });
});
