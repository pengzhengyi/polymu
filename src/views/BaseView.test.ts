import { FilteredView } from '../view-functions/FilteredView';
import { BaseView, ViewTransformation } from './BaseView';
import { ViewElement } from './ViewElement';

function* createParagraphElement(count: number): IterableIterator<HTMLParagraphElement> {
  for (let i = 0; i < count; i++) {
    const element = document.createElement('p');
    element.textContent = i.toString();
    yield element;
  }
}

describe('BaseView', () => {
  test('exposed features from getFeatures', () => {
    const source = new DocumentFragment();
    for (const element of createParagraphElement(10)) {
      source.appendChild(element);
    }

    const target = document.createElement('div');
    document.body.appendChild(target);

    const viewTransformations = [new FilteredView<ViewElement>()];

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
    const source: Iterable<HTMLParagraphElement> = createParagraphElement(2);

    const target = document.createElement('div');
    document.body.appendChild(target);

    const viewTransformations: Array<ViewTransformation> = [new FilteredView<ViewElement>()];

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

    expect(target.childElementCount).toEqual(2);
    expect(target.children[0].textContent).toEqual('0');
    expect(target.children[1].textContent).toEqual('1');

    const newSource: Array<HTMLParagraphElement> = [...createParagraphElement(5)];
    const newView = baseView.view(newSource, false);

    expect(target.childElementCount).toEqual(5);
  });
});
