import { ViewElement } from '../view-element/ViewElement';
import { ViewElementProvider } from './ViewElementProvider';

function createListElement(numChild: number): HTMLOListElement {
  const listElement = document.createElement('ol');
  for (let i = 0; i < numChild; i++) {
    const listItemElement = document.createElement('li');
    listItemElement.textContent = i.toString();
    listElement.appendChild(listItemElement);
  }
  return listElement;
}

describe('ViewElementProvider', () => {
  test('initialize from HTMLTemplateElement', () => {
    const templateElement = document.createElement('template');
    const listElement = createListElement(10);
    listElement.id = 'container-list';
    templateElement.content.appendChild(listElement);

    const viewElementProvider: ViewElementProvider = new ViewElementProvider();
    viewElementProvider.consume(templateElement);

    expect(viewElementProvider.hasLargeNumberOfChildViewElement).toBe(false);

    expect(viewElementProvider.parentViewElement.element_.id).toEqual('container-list');
    expect(viewElementProvider.childViewElements).toHaveLength(10);
  });

  test('use fallback container when initialize from HTMLCollection', () => {
    const listElement = createListElement(10);
    listElement.id = 'container-list';

    const fallbackContainer = document.createElement('ul');
    fallbackContainer.id = 'fallback-container-list';

    const viewElementProvider: ViewElementProvider = new ViewElementProvider();
    viewElementProvider.consume(listElement.children, fallbackContainer);

    expect(viewElementProvider.parentViewElement.element_.id).toEqual('fallback-container-list');
    expect(viewElementProvider.parentViewElement.element_.tagName).toEqual('UL');
    expect(viewElementProvider.childViewElements).toHaveLength(10);

    const firstElement = (viewElementProvider.childViewElements as Array<ViewElement>)[0].element_;
    expect(firstElement.parentElement).toBe(listElement);
  });

  test('lazy initialization from HTMLElement with large number of children', () => {
    const numChild = 10;
    const listElement = createListElement(numChild);
    listElement.id = 'container-list';

    const viewElementProvider: ViewElementProvider = new ViewElementProvider();
    viewElementProvider.consume(listElement, undefined, true);

    expect(viewElementProvider.hasLargeNumberOfChildViewElement).toBe(true);

    expect(viewElementProvider.parentViewElement.element_.id).toEqual('container-list');

    // before materialization, no ViewElement has been added as child
    expect(viewElementProvider.parentViewElement.children_).toHaveLength(0);

    let i = 0;

    // view element is added alongside first iteration
    for (const childViewElement of viewElementProvider.childViewElements) {
      expect(childViewElement.element_.textContent).toEqual(i.toString());
      i++;
      expect(viewElementProvider.parentViewElement.children_).toHaveLength(i);
    }

    // view element is all added after first iteration
    expect(viewElementProvider.childViewElements).toHaveLength(numChild);
  });
});
