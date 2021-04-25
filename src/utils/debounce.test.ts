import { executeAfterCooldown, rateLimit } from './debounce';

describe('rate limiting', () => {
  test('test infrequent event firing', async (done) => {
    const callback = jest.fn();
    const rateLimitedCallback = rateLimit(callback);

    // wait an animation frame
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    rateLimitedCallback(undefined);

    // wait an animation frame
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    rateLimitedCallback(undefined);

    // wait an animation frame
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    rateLimitedCallback(undefined);

    // wait an animation frame
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    expect(callback).toHaveBeenCalledTimes(3);
    done();
  });

  test('rapid firing', async (done) => {
    const callback = jest.fn();
    const rateLimitedCallback = rateLimit(callback);
    for (let i = 0; i < 100; i++) {
      rateLimitedCallback(undefined);
    }

    // wait an animation frame
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    expect(callback).toHaveBeenCalled();
    expect(callback.mock.calls.length).toBeLessThan(100);
    done();
  });
});

describe('executeAfterCooldown', () => {
  test('slow firing', async (done) => {
    const timeout = 100;
    const callback = jest.fn();
    const cooledCallback = executeAfterCooldown(callback, timeout);

    cooledCallback(undefined);
    // wait a timeout
    await new Promise((resolve) => window.setTimeout(resolve, timeout));

    cooledCallback(undefined);
    // wait a timeout
    await new Promise((resolve) => window.setTimeout(resolve, timeout));

    cooledCallback(undefined);
    // wait a timeout
    await new Promise((resolve) => window.setTimeout(resolve, timeout));

    expect(callback).toHaveBeenCalledTimes(3);
    done();
  });

  test('rapid firing', async (done) => {
    const timeout = 100;
    const callback = jest.fn();
    const cooledCallback = executeAfterCooldown(callback, timeout);
    for (let i = 0; i < 100; i++) {
      cooledCallback(undefined);
    }

    // wait a timeout
    await new Promise((resolve) => window.setTimeout(resolve, timeout));

    expect(callback).toHaveBeenCalled();
    expect(callback.mock.calls.length).toBeLessThan(100);
    done();
  });
});
