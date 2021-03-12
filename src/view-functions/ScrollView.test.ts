import { ScrollView } from './ScrollView';

describe('ScrollView initialization', () => {
  const scrollTarget = document.createElement('div');
  document.body.appendChild(scrollTarget);
  let target: HTMLElement;
  let scrollView: ScrollView<HTMLParagraphElement>;
  let paragraphs: Array<HTMLParagraphElement> = Array.from(
    (function* () {
      for (let i = 0; i < 1000; i++) {
        const element: HTMLParagraphElement = document.createElement('p');
        element.textContent = i.toString();
        yield element;
      }
    })()
  );

  beforeAll(() => {
    function setupIntersectionObserverMock({
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
    setupIntersectionObserverMock();
  });

  beforeEach(() => {
    target = document.createElement('div');
    scrollTarget.appendChild(target);
    scrollView = new ScrollView({ target });
  });

  test('initial state', () => {
    expect(scrollView.startIndex).toBeFalsy();
    expect(scrollView.startSentinelIndex).toBeFalsy();
    expect(scrollView.endIndex).toBeFalsy();
    expect(scrollView.endSentinelIndex).toBeFalsy();
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
    expect(targetView[0].textContent).toEqual('0');
    expect(targetView[10].textContent).toEqual('10');

    expect(scrollView.isWindowFull).toBe(true);
    expect(scrollView.windowSize).toBe(101);
    expect(scrollView.get(21).textContent).toEqual('21');
  });

  test('shift partial view', () => {
    scrollView.setWindow(0, 20);
    const originalTargetView = scrollView.view(paragraphs);
    expect(originalTargetView[1].textContent).toEqual('1');

    scrollView.shiftWindow(5);
    expect(scrollView.get(0).textContent).toEqual('5');

    const newTargetView = scrollView.view(paragraphs, true);
    expect(newTargetView[1].textContent).toEqual('6');
  });
});
