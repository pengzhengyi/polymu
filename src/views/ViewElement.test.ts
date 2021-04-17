import { ViewElement } from './ViewElement';
import { MutationReporter } from '../dom/MutationReporter';
import { ChildListChangeEvent } from '../dom/CustomEvents';

describe('View Element', () => {
  let source: HTMLElement;
  let viewElement: ViewElement;

  beforeEach(() => {
    source = document.createElement('tr');
    source.innerHTML = `
      <td id="900000" tabindex="-1">A. J. Kfoury</td>
      <td id="900001" tabindex="-1">Boston University</td>
      <td id="961360" tabindex="-1">1999</td>
      <td id="961363" tabindex="-1">Machine learning &amp; data mining</td>
      <td id="961365" tabindex="-1">Brown University</td>
      <td id="961368" tabindex="-1">Harvard University</td>
    `;
    viewElement = new ViewElement(source, [(element) => new ViewElement(element)]);
    viewElement.patchWithDOM__(source);
  });

  test('unique identifier', () => {
    viewElement.operateOnRange__((viewElement) =>
      viewElement.element_.setAttribute(
        `data-${ViewElement.identifierDatasetName_}`,
        viewElement.identifier_
      )
    );
    const identifiers: Array<string> = viewElement.operateOnRange__(
      (viewElement) => viewElement.identifier_
    );
    expect(identifiers.length).toBe(6);
    const table = document.createElement('table');
    table.appendChild(source);
    document.body.appendChild(table);
    expect(ViewElement.getElementByIdentifier__(identifiers[0])).toBe(source.children[0]);
  });

  test('Access Properties', () => {
    // no explicit key registered
    expect(Object.keys(viewElement).length).toBe(0);
    expect((viewElement as any).children.length).toBe(6);
    expect(viewElement.children_.length).toBe(6);
    expect(viewElement.element_).toBe(source);
    expect((viewElement.children_[0] as any).textContent).toBe('A. J. Kfoury');
    expect((viewElement.children_[2] as any).textContent).toBe('1999');
    expect((viewElement.children_[4] as any).id).toBe('961365');
    expect(viewElement instanceof HTMLElement).toEqual(false);
  });

  test('create view element to accommodate DOM child', () => {
    viewElement.removeChildByIndex__(0);
    viewElement.removeChild__(viewElement.children_[0]);
    expect(viewElement.children_.length).toBe(4);
    expect((viewElement as any).children.length).toBe(6);
    viewElement.patchWithDOM__(source.cloneNode(true) as HTMLElement);
    expect((viewElement as any).children.length).toBe(6);
    expect(viewElement.children_.length).toBe(6);
    expect((viewElement.children_[0] as any).textContent).toBe('A. J. Kfoury');
    expect((viewElement.children_[2] as any).textContent).toBe('1999');
    expect((viewElement.children_[4] as any).id).toBe('961365');
  });

  test('observe childList mutation', (done) => {
    const listElement = document.createElement('ol');
    document.body.appendChild(listElement);
    for (let i = 0; i < 6; i++) {
      const listItemElement = document.createElement('li');
      listItemElement.textContent = `item ${i}`;
      listElement.appendChild(listItemElement);
    }

    const vm: ViewElement = new ViewElement(listElement, [(element) => new ViewElement(element)]);
    vm.patchChildViewElementsWithDOMElements__(listElement.children);
    // original data
    expect((vm as any).children.length).toBe(6);
    expect(vm.element_).toBe(listElement);
    expect(vm.children_.length).toBe(6);
    expect((vm.children_[0] as any).textContent).toBe('item 0');
    expect((vm.children_[2] as any).textContent).toBe('item 2');
    expect((vm.children_[4] as any).textContent).toBe('item 4');

    vm.initializeMutationReporter();
    vm.setupAutoUpdateChildViewElement();

    document.addEventListener(
      ChildListChangeEvent.typeArg,
      () => {
        // before mutations are handled
        // 5 list items since innerHTML has been executed
        expect(vm.element_.childElementCount).toBe(5);
        // 6 child ViewElement since listener registered at `vm.element_` is not executed
        expect(vm.children_.length).toBe(6);
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
        expect(vm.element_.childElementCount).toBe(5);
        expect(vm.children_.length).toBe(5);
        expect(vm.element_).toBe(listElement);
        expect((vm.children_[0] as any).textContent).toBe('0');
        expect((vm.children_[2] as any).textContent).toBe('2');
        expect((vm.children_[4] as any).textContent).toBe('4');
        done();
      },
      {
        once: true,
      }
    );

    vm.observe__(vm.element_, false, undefined, false, true, false);
    // change to new data
    listElement.innerHTML = `<li>0</li><li>1</li><li>2</li><li>3</li><li>4</li>`;
  });
});
