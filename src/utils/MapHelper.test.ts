import { getOrInsertDefault } from './MapHelper';

describe('get or insert', () => {
  let map: Map<string, number> = new Map();
  beforeEach(
    () =>
      (map = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 1],
      ]))
  );

  test('get value', () => {
    expect(getOrInsertDefault(map, 'a', 10)).toEqual(1);
    expect(map.get('a')).toEqual(1);

    expect(getOrInsertDefault(map, 'b', -3)).toEqual(2);
    expect(map.get('b')).toEqual(2);
  });

  test('insert default', () => {
    expect(getOrInsertDefault(map, 'd', 15)).toEqual(15);
    expect(map.get('d')).toEqual(15);

    expect(getOrInsertDefault(map, 'd', 17)).toEqual(15);
    expect(map.get('d')).toEqual(15);
  });
});
