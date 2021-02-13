import { AbstractViewFunction } from "./AbstractViewFunction";
import { AggregateView } from "./AggregateView";
import { FilteredView } from "./FilteredView";
import { PartialView } from "./PartialView";
import { SortedView } from "./SortedView";



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
    expect(eventHandler.mock.calls.length).toBe(0);

    expect([...vc.view([1, 2, 3, 4, 5])]).toEqual([1, 2, 3, 4, 5]);
    sv.addSortingFunction('desc', (n1, n2) => n2 - n1, 1);
    expect(eventHandler.mock.calls.length).toBe(1);
    expect([...vc.view([1, 2, 3, 4, 5])]).toEqual([5, 4, 3, 2, 1]);
    sv.deleteSortingFunction('desc');
    expect(eventHandler.mock.calls.length).toBe(2);
  });

  test('exposed features', () => {
    const sv = new SortedView<number>();
    const fv = new FilteredView<number>();
    const array = Array.from(Array(100).keys());
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
});
