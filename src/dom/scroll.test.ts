import {
  isScrollDirectionTowardsEnd,
  isScrollDirectionTowardsStart,
  ScrollDirection,
} from './scroll';

describe('test ScrollDirection', () => {
  test('isScrollDirectionTowardsStart', () => {
    expect(isScrollDirectionTowardsStart(ScrollDirection.Left)).toBe(true);
    expect(isScrollDirectionTowardsStart(ScrollDirection.Right)).toBe(false);
    expect(isScrollDirectionTowardsStart(ScrollDirection.Up)).toBe(true);
    expect(isScrollDirectionTowardsStart(ScrollDirection.Down)).toBe(false);
    expect(isScrollDirectionTowardsStart(ScrollDirection.Stay)).toBe(false);
  });

  test('isScrollDirectionTowardsEnd', () => {
    expect(isScrollDirectionTowardsEnd(ScrollDirection.Left)).toBe(false);
    expect(isScrollDirectionTowardsEnd(ScrollDirection.Right)).toBe(true);
    expect(isScrollDirectionTowardsEnd(ScrollDirection.Up)).toBe(false);
    expect(isScrollDirectionTowardsEnd(ScrollDirection.Down)).toBe(true);
    expect(isScrollDirectionTowardsEnd(ScrollDirection.Stay)).toBe(false);
  });
});
