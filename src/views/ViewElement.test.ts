import { ViewElement } from './ViewElement';
import { MutationReporter } from '../dom/MutationReporter';

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
    viewElement = new ViewElement(source, undefined, [(element) => new ViewElement(element)]);
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
    const vm: ViewElement = new ViewElement(source, undefined, [
      (element) => new ViewElement(element),
    ]);
    vm.setMutationReporter__(
      function (
        mutations: Array<MutationRecord>,
        observer: MutationObserver,
        originalMutations: Array<MutationRecord>,
        reporter: MutationReporter
      ) {
        this.onMutation__(mutations, observer, originalMutations, reporter);
        expect((vm as any).children.length).toBe(6);
        expect(vm.children_.length).toBe(6);
        expect(vm.element_).toBe(source);
        expect((vm.children_[0] as any).textContent).toBe('Amy J. Ko');
        expect((vm.children_[2] as any).textContent).toBe('2014');
        expect((vm.children_[4] as any).id).toBe('962819');
        vm.unobserve__(vm.element_);
        vm.patchWithViewElement__(viewElement);
        expect((vm as any).children.length).toBe(6);
        expect(vm.children_.length).toBe(6);
        expect(vm.element_).toBe(source);
        expect((vm.children_[0] as any).textContent).toBe('A. J. Kfoury');
        expect((vm.children_[2] as any).textContent).toBe('1999');
        expect((vm.children_[4] as any).id).toBe('961365');
        done();
      }.bind(vm)
    );

    vm.observe__(vm.element_, false, undefined, false, true, false);
    source.innerHTML = `<td id="900014" tabindex="-1">Amy J. Ko</td><td id="900015" tabindex="-1">University of Washington</td><td id="962817" tabindex="-1">2014</td><td id="962820" tabindex="-1">Software engineering</td><td id="962819" tabindex="-1">Oregon State University</td><td id="962818" tabindex="-1">Carnegie Mellon University</td>`;
  });
});
