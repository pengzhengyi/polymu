import { ChildListChangeEvent } from '../dom/CustomEvents';
import { ViewElement } from './ViewElement';
import { ViewElementChildListMutationReporter } from './ViewElementChildListMutationReporter';

describe('ViewElementChildListMutationReporter', () => {
  let target: HTMLElement;
  let targetViewElement: ViewElement;

  beforeEach(() => {
    if (target) {
      target.remove();
      targetViewElement.dispose();
    }

    target = document.createElement('ul');
    document.body.appendChild(target);
    targetViewElement = new ViewElement(target, [(element) => new ViewElement(element)]);
  });

  test('observe childlist change', (done) => {
    const observer = new ViewElementChildListMutationReporter(targetViewElement);

    document.body.addEventListener(
      ChildListChangeEvent.typeArg,
      (event: ChildListChangeEvent) => {
        expect(target.childElementCount).toEqual(1);
        const nodes = [...event.detail.addedNodes];
        expect(nodes).toHaveLength(1);
        expect(nodes[0].textContent).toEqual('abc');

        done();
      },
      {
        once: true,
        capture: true,
      }
    );

    observer.observe();

    const listElement = document.createElement('li');
    listElement.textContent = 'abc';
    target.appendChild(listElement);
  });

  test('mutation ignored when stopped observing', (done) => {
    const observer = new ViewElementChildListMutationReporter(targetViewElement);

    document.body.addEventListener(
      ChildListChangeEvent.typeArg,
      (event: ChildListChangeEvent) => {
        expect(target.childElementCount).toEqual(2);
        const nodes = [...event.detail.addedNodes];
        expect(nodes).toHaveLength(1);
        expect(nodes[0].textContent).toEqual('cba');

        done();
      },
      {
        once: true,
        capture: true,
      }
    );

    // first mutation should not be observed
    observer.observe();
    observer.unobserve();

    const listElement = document.createElement('li');
    listElement.textContent = 'abc';
    target.appendChild(listElement);

    // re-observing
    observer.observe();

    const listElement2 = document.createElement('li');
    listElement2.textContent = 'cba';
    target.appendChild(listElement2);
  });
});
