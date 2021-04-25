import { bound, mod } from './math';

describe('modulo arithmetic', () => {
  test('negative number', () => {
    expect(2).toEqual(mod(-1, 3));
    expect(1).toEqual(mod(-2, 3));
    expect(2).toEqual(mod(-10, 3));
  });

  test('positive number', () => {
    expect(1).toEqual(mod(1, 4));
    expect(3).toEqual(mod(7, 4));
    expect(0).toEqual(mod(12, 4));
  });
});

describe('bound', () => {
  test('lower bounding', () => {
    expect(bound(-2, 0, 3)).toEqual(0);
    expect(bound(-2, -4, 3)).toEqual(-2);
  });

  test('upper bounding', () => {
    expect(bound(6, 0, 3)).toEqual(3);
    expect(bound(-1, -4, 3)).toEqual(-1);
  });
});
