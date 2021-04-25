import { Collection } from '../../collections/Collection';
import { endFillerClass, startFillerClass } from '../../constants/css-classes';
import { ChildListChangeEvent } from '../../dom/CustomEvents';
import { ScrollRenderer } from './ScrollRenderer';

export function setupIntersectionObserverMock({
  observe = () => null,
  unobserve = () => null,
  disconnect = () => null,
} = {}) {
  class IntersectionObserver {
    observe = observe;
    unobserve = unobserve;
    disconnect = disconnect;
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: IntersectionObserver,
  });
  Object.defineProperty(global, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: IntersectionObserver,
  });
}

let scrollTarget: HTMLDivElement;

beforeAll(() => {
  scrollTarget = document.createElement('div');
  document.body.appendChild(scrollTarget);
});

describe('ScrollRenderer initialization', () => {
  let target: HTMLElement;
  let scrollView: ScrollRenderer<HTMLParagraphElement, HTMLParagraphElement>;
  const paragraphs: Array<HTMLParagraphElement> = Array.from(
    (function* () {
      for (let i = 0; i < 200; i++) {
        const element: HTMLParagraphElement = document.createElement('p');
        element.textContent = i.toString();
        yield element;
      }
    })()
  );

  beforeAll(() => {
    setupIntersectionObserverMock();
  });

  beforeEach(() => {
    if (target) {
      target.remove();
    }

    target = document.createElement('div');
    scrollTarget.appendChild(target);
    scrollView = new ScrollRenderer({ target });
  });

  test('initial state', () => {
    expect(scrollView.startIndex).toBeFalsy();
    expect(scrollView.startSentinelIndex).toBeFalsy();
    expect(scrollView.endIndex).toBeFalsy();
    expect(scrollView.endSentinelIndex).toBeFalsy();
  });

  test('check existence of filler elements', () => {
    const startFillerElement = target.previousElementSibling;
    expect(startFillerElement.classList.contains(startFillerClass)).toBe(true);
    const endFillerElement = target.nextElementSibling;
    expect(endFillerElement.classList.contains(endFillerClass)).toBe(true);
  });

  test('initialize window boundary', () => {
    scrollView.setWindow(0, 5);
    expect(scrollView.startIndex).toEqual(0);
    expect(scrollView.endIndex).toEqual(5);
    expect(scrollView.startSentinelIndex).toBeGreaterThanOrEqual(0);
    expect(scrollView.endSentinelIndex).toBeLessThanOrEqual(5);
  });

  test('rendering partial view', () => {
    scrollView.setWindow(0, 100);
    const targetView = scrollView.view(paragraphs);
    expect(Collection.get(targetView, 0).textContent).toEqual('0');
    expect(Collection.get(targetView, 10).textContent).toEqual('10');

    expect(scrollView.isWindowFull).toBe(true);
    expect(scrollView.windowSize).toBe(101);
    expect(scrollView.get(21).textContent).toEqual('21');
  });

  test('shift partial view', () => {
    scrollView.setWindow(0, 20);
    const originalTargetView = scrollView.view(paragraphs);
    expect(Collection.get(originalTargetView, 1).textContent).toEqual('1');

    scrollView.shiftWindow(5);
    expect(scrollView.get(0).textContent).toEqual('5');

    const newTargetView = scrollView.view(paragraphs, true);
    expect(Collection.get(newTargetView, 1).textContent).toEqual('6');
  });

  test('shift towards start when already reached start', () => {
    scrollView.setWindow(0, 20);
    const originalTargetView = scrollView.view(paragraphs);
    expect(Collection.get(originalTargetView, 2).textContent).toEqual('2');

    scrollView.shiftWindow(-5);
    expect(Collection.get(originalTargetView, 2).textContent).toEqual('2');
  });

  test('shift towards start, not enough room for shifting', () => {
    scrollView.setWindow(0, 20);
    scrollView.view(paragraphs);
    expect(scrollView.isWindowFull).toBe(true);
    expect(scrollView.reachedStart).toBe(true);
    expect(scrollView.startIndex).toEqual(0);
    expect(scrollView.get(2).textContent).toEqual('2');

    scrollView.shiftWindow(2);
    expect(scrollView.reachedStart).toBe(false);
    expect(scrollView.get(2).textContent).toEqual('4');

    scrollView.shiftWindow(-5);
    expect(scrollView.reachedStart).toBe(true);
    expect(scrollView.startIndex).toEqual(0);
    expect(scrollView.get(2).textContent).toEqual('2');
  });

  test('detect target childlist mutation', (done) => {
    target.appendChild(document.createElement('p'));

    document.addEventListener(
      ChildListChangeEvent.typeArg,
      () => {
        // after mutations are handled
        expect(target.childElementCount).toEqual(1);
        done();
      },
      {
        once: true,
      }
    );
  });
});

describe('use convert in ScrollView', () => {
  const numbers: Array<number> = Array.from(new Array(200).keys());
  let target: HTMLElement;
  function convert(number: number): HTMLLIElement {
    const element = document.createElement('li');
    element.textContent = `Value = ${number}`;
    element.id = `li-number-${number}`;
    return element;
  }
  let scrollView: ScrollRenderer<number, HTMLLIElement>;

  beforeAll(() => {
    setupIntersectionObserverMock();
  });

  beforeEach(() => {
    if (target) {
      target.remove();
    }

    target = document.createElement('ul');
    scrollTarget.appendChild(target);
    scrollView = new ScrollRenderer({ target, convert });
  });

  test('rendering partial view correctly', () => {
    scrollView.setWindow(0, 9);
    const targetView = scrollView.view(numbers);
    expect(Collection.get(targetView, 0)).toEqual(0);
    expect(Collection.get(targetView, 5)).toEqual(5);
    expect(scrollView.isWindowFull).toBe(true);
    expect(scrollView.windowSize).toBe(10);

    expect(target.childElementCount).toEqual(10);

    expect(target.children[0].id).toEqual('li-number-0');
  });
});
