import { ChildListChangeEvent } from '../dom/CustomEvents';
import { Filter } from '../view-functions/transformation/Filter';
import { BaseView, ViewTransformation } from './BaseView';
import { ViewElement } from '../view-element/ViewElement';
import { setupIntersectionObserverMock } from '../view-functions/renderer/ScrollRenderer.test';

function* createParagraphElement(count: number): IterableIterator<HTMLParagraphElement> {
  for (let i = 0; i < count; i++) {
    const element = document.createElement('p');
    element.textContent = i.toString();
    yield element;
  }
}

describe('BaseView', () => {
  beforeAll(() => {
    setupIntersectionObserverMock();
  });

  test('exposed features from getFeatures', () => {
    const source = new DocumentFragment();
    for (const element of createParagraphElement(10)) {
      source.appendChild(element);
    }

    const target = document.createElement('div');
    document.body.appendChild(target);

    const viewTransformations = [new Filter<ViewElement>()];

    const baseView = new BaseView(source, target, viewTransformations);

    const exposedFeatures = new Set(baseView.getFeatures());
    for (const feature of viewTransformations[0].getFeatures()) {
      expect(exposedFeatures).toContain(feature);
    }

    expect(exposedFeatures).toContain('enableBackPropagation');
  });

  test('initial state of target', () => {
    const source: Array<HTMLParagraphElement> = [...createParagraphElement(2)];

    const target = document.createElement('div');
    document.body.appendChild(target);

    const viewTransformations: Array<ViewTransformation> = [];

    const baseView = new BaseView(source, target, viewTransformations);

    expect(target.childElementCount).toEqual(2);
    expect(target.children[0].textContent).toEqual('0');
  });

  test('auto-update view when add a filter function', () => {
    const source: Array<HTMLParagraphElement> = [...createParagraphElement(2)];

    const target = document.createElement('div');
    document.body.appendChild(target);

    const viewTransformations: Array<ViewTransformation> = [new Filter<ViewElement>()];

    const baseView = new BaseView(source, target, viewTransformations);

    expect(target.childElementCount).toEqual(2);
    expect(target.children[0].textContent).toEqual('0');
    expect(target.children[1].textContent).toEqual('1');

    (baseView as any).addFilterFunction(
      'text content equals 1',
      (viewElement: ViewElement) => viewElement.element_.textContent === '1'
    );

    expect(target.childElementCount).toEqual(1);
    expect(target.children[0].textContent).toEqual('1');
  });

  test('replace view by calling view with new source view', () => {
    const source: Iterable<HTMLParagraphElement> = createParagraphElement(2);

    const target = document.createElement('div');
    document.body.appendChild(target);

    const viewTransformations: Array<ViewTransformation> = [];

    const baseView = new BaseView(source, target, viewTransformations);
    (baseView as any).setWindow(0, 100);

    expect(target.childElementCount).toEqual(2);
    expect(target.children[0].textContent).toEqual('0');
    expect(target.children[1].textContent).toEqual('1');

    const newSource: Array<HTMLParagraphElement> = [...createParagraphElement(5)];
    const newView = baseView.view(newSource, false);

    expect(target.childElementCount).toEqual(5);
  });

  test('back propagation dom mutation when added elements is filtered', (done) => {
    const source: Iterable<HTMLParagraphElement> = createParagraphElement(2);

    const target = document.createElement('div');
    document.body.appendChild(target);

    const viewTransformations: Array<ViewTransformation> = [new Filter<ViewElement>()];

    const baseView = new BaseView(source, target, viewTransformations);
    (baseView as any).setWindow(0, 100);

    // before filter function is applied
    expect(target.childElementCount).toEqual(2);

    (baseView as any).addFilterFunction(
      'text content equals 1 or 3',
      (viewElement: ViewElement) =>
        viewElement.element_.textContent === '1' || viewElement.element_.textContent === '3'
    );

    // after filter function is applied
    expect(target.childElementCount).toEqual(1);

    baseView.enableBackPropagation();
    document.addEventListener(
      ChildListChangeEvent.typeArg,
      () => {
        // before mutations are handled
        // dom mutation is already handled
        expect(target.childElementCount).toEqual(2);
        // dom mutation is not yet processed to update `ViewElement`
        expect(baseView.viewElementProvider.parentViewElement.children_).toHaveLength(2);
      },
      {
        once: true,
        capture: true,
      }
    );
    document.addEventListener(
      ChildListChangeEvent.typeArg,
      () => {
        // after mutations are handled
        expect(target.childElementCount).toEqual(2);
        expect(baseView.viewElementProvider.parentViewElement.children_).toHaveLength(3);
        done();
      },
      {
        once: true,
      }
    );

    const paragraphWith3 = document.createElement('p');
    paragraphWith3.textContent = '3';
    target.appendChild(paragraphWith3);
  });

  test('back propagation dom mutation with adding node', (done) => {
    const source: Iterable<HTMLParagraphElement> = createParagraphElement(2);

    const target = document.createElement('div');
    document.body.appendChild(target);

    const viewTransformations: Array<ViewTransformation> = [];

    const baseView = new BaseView(source, target, viewTransformations);
    (baseView as any).setWindow(0, 100);

    expect(target.childElementCount).toEqual(2);

    baseView.enableBackPropagation();
    document.addEventListener(
      ChildListChangeEvent.typeArg,
      () => {
        // before mutations are handled
        // dom mutation is already handled
        expect(target.childElementCount).toEqual(3);
        // dom mutation is not yet processed to update `ViewElement`
        expect(baseView.viewElementProvider.parentViewElement.children_).toHaveLength(2);
      },
      {
        once: true,
        capture: true,
      }
    );
    document.addEventListener(
      ChildListChangeEvent.typeArg,
      () => {
        // after mutations are handled
        expect(target.childElementCount).toEqual(3);
        expect(baseView.viewElementProvider.parentViewElement.children_).toHaveLength(3);
        done();
      },
      {
        once: true,
      }
    );

    const newElement = document.createElement('p');
    newElement.textContent = 'new paragraph';
    target.appendChild(newElement);
  });

  test('back propagation dom mutation with removing node', (done) => {
    const source: Iterable<HTMLParagraphElement> = createParagraphElement(2);

    const target = document.createElement('div');
    document.body.appendChild(target);

    const viewTransformations: Array<ViewTransformation> = [];

    const baseView = new BaseView(source, target, viewTransformations);
    (baseView as any).setWindow(0, 100);

    expect(target.childElementCount).toEqual(2);

    baseView.enableBackPropagation();
    document.addEventListener(
      ChildListChangeEvent.typeArg,
      () => {
        // before mutations are handled
        // dom mutation is already handled
        expect(target.childElementCount).toEqual(0);
        // dom mutation is not yet processed to update `ViewElement`
        expect(baseView.viewElementProvider.parentViewElement.children_).toHaveLength(2);
      },
      {
        once: true,
        capture: true,
      }
    );
    document.addEventListener(
      ChildListChangeEvent.typeArg,
      () => {
        // after mutations are handled
        expect(target.childElementCount).toEqual(0);
        expect(baseView.viewElementProvider.parentViewElement.children_).toHaveLength(0);
        done();
      },
      {
        once: true,
      }
    );

    target.innerHTML = '';
  });

  test('enable and disable back propagation', (done) => {
    const source: Iterable<HTMLParagraphElement> = createParagraphElement(2);

    const target = document.createElement('div');
    document.body.appendChild(target);

    const viewTransformations: Array<ViewTransformation> = [];

    const baseView = new BaseView(source, target, viewTransformations);
    (baseView as any).setWindow(0, 100);

    expect(target.childElementCount).toEqual(2);
    expect(baseView.viewElementProvider.parentViewElement.children_).toHaveLength(2);

    baseView.enableBackPropagation();
    baseView.disableBackPropagation();
    document.addEventListener(
      ChildListChangeEvent.typeArg,
      () => {
        // after mutations are handled
        expect(target.childElementCount).toEqual(3);
        expect(baseView.viewElementProvider.parentViewElement.children_).toHaveLength(2);
        done();
      },
      {
        once: true,
      }
    );

    target.appendChild(document.createElement('p'));
  });
});
