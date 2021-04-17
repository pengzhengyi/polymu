import { Collection } from '../collections/Collection';
import { ChildListChangeEvent } from '../dom/CustomEvents';
import { ViewElement } from '../views/ViewElement';
import { SyncView } from './SyncView';

describe('SyncView', () => {
  let rootDomElement: HTMLElement;
  let syncView: SyncView;

  beforeEach(() => {
    if (rootDomElement) {
      rootDomElement.remove();
    }

    rootDomElement = document.createElement('div');
    rootDomElement.id = '123';
    document.body.appendChild(rootDomElement);
    syncView = new SyncView(rootDomElement);
  });

  test('rootViewElement', () => {
    expect(syncView.rootViewElement.element_).toBe(rootDomElement);
  });

  test('regenerateView', () => {
    const child1 = document.createElement('p');
    child1.textContent = 'Child 1';
    const child2 = document.createElement('p');
    child2.textContent = 'Child 2';

    const targetView = syncView.view([child1, child2]);
    expect(targetView.length).toEqual(2);
    expect((Collection.get(targetView, 0) as HTMLElement).textContent).toEqual('Child 1');
    expect((Collection.get(targetView, 1) as HTMLElement).textContent).toEqual('Child 2');
  });

  test('onMutation', (done) => {
    expect(syncView.rootDomElement).toBe(rootDomElement);
    expect(syncView.childViewElements.length).toEqual(0);
    expect(syncView.childDomElements.length).toEqual(0);

    document.addEventListener(
      ChildListChangeEvent.typeArg,
      () => {
        // before mutations are handled
        // 1 since `appendChild` is executed
        expect(rootDomElement.childElementCount).toEqual(1);
        // 0 because the DOM mutation has not been processed to update ViewElement
        expect(syncView.childViewElements.length).toEqual(0);
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
        expect(rootDomElement.childElementCount).toEqual(1);
        expect(syncView.childViewElements.length).toEqual(1);
        expect(syncView.childDomElements.length).toEqual(1);

        window.setTimeout(() => {
          const child2 = document.createElement('p');
          child2.textContent = 'Child 2';
          rootDomElement.appendChild(child2);

          document.addEventListener(
            ChildListChangeEvent.typeArg,
            () => {
              // after mutations are handled
              expect(rootDomElement.childElementCount).toEqual(2);
              expect(syncView.childViewElements.length).toEqual(2);
              expect(syncView.childDomElements.length).toEqual(2);

              window.setTimeout(() => {
                expect(syncView.childViewElements.length).toEqual(2);
                expect(syncView.childDomElements.length).toEqual(2);

                // remove child
                child1.remove();
                document.addEventListener(
                  ChildListChangeEvent.typeArg,
                  () => {
                    // after mutations are handled
                    expect(rootDomElement.childElementCount).toEqual(1);
                    expect(syncView.childViewElements.length).toEqual(1);
                    expect(syncView.childDomElements.length).toEqual(1);
                    done();
                  },
                  {
                    once: true,
                  }
                );
              });
            },
            {
              once: true,
            }
          );
        });
      },
      {
        once: true,
      }
    );

    // add child to rootDomElement directly
    const child1 = document.createElement('p');
    child1.textContent = 'Child 1';
    rootDomElement.appendChild(child1);
  });

  test('sync with HTMLElement children', () => {
    const child1 = document.createElement('p');
    child1.textContent = 'Child 1';
    const child2 = document.createElement('p');
    child2.textContent = 'Child 2';

    expect(rootDomElement.childElementCount).toEqual(0);
    syncView.sync([child1, child2]);
    expect(rootDomElement.childElementCount).toEqual(2);

    // check DOM
    expect(rootDomElement.children[0].textContent).toEqual('Child 1');
    expect(rootDomElement.children[1].textContent).toEqual('Child 2');

    const child3 = document.createElement('p');
    child3.textContent = 'Child 3';
    const viewElementChild3 = new ViewElement(child3);

    expect(rootDomElement.childElementCount).toEqual(2);
    syncView.sync([viewElementChild3]);
    expect(rootDomElement.childElementCount).toEqual(1);

    // check DOM
    expect(rootDomElement.children[0].textContent).toEqual('Child 3');
  });

  test('sync with HTMLElement', () => {
    const newRootDomElement = document.createElement('div');
    newRootDomElement.id = '321';
    document.body.appendChild(newRootDomElement);
    newRootDomElement.appendChild(document.createElement('p'));

    expect(syncView.rootDomElement.id).toEqual('123');
    expect(syncView.rootDomElement.childElementCount).toEqual(0);

    syncView.sync(newRootDomElement);
    expect(syncView.rootDomElement.id).toEqual('321');
    expect(syncView.rootDomElement.childElementCount).toEqual(1);
  });

  test('sync with ViewElement', () => {
    const newRootDomElement = document.createElement('div');
    newRootDomElement.id = '321';
    document.body.appendChild(newRootDomElement);
    newRootDomElement.appendChild(document.createElement('p'));

    const newViewElement = new ViewElement(newRootDomElement, [
      (element) => new ViewElement(element),
    ]);
    newViewElement.patchChildViewElementsWithDOMElements__(newRootDomElement.children);

    expect(syncView.rootDomElement.id).toEqual('123');
    expect(syncView.rootDomElement.childElementCount).toEqual(0);

    syncView.sync(newViewElement);
    expect(syncView.rootDomElement.id).toEqual('321');
    expect(syncView.rootDomElement.childElementCount).toEqual(1);
  });
});
