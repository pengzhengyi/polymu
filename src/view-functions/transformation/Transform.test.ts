import { LazyCollectionProvider } from '../../collections/Collection';
import { Transform } from './Transform';

describe('Transform', () => {
  test('no exposed features', () => {
    const vt = new Transform();
    expect(vt.getFeatures()).toHaveLength(0);
  });

  test('simple transformation', () => {
    const array = [1, 2, 3];
    const vt = new Transform<number>((n) => n + 1);
    const output = [...vt.view(array)];
    expect(output).toEqual([2, 3, 4]);
  });

  test('change transformation', () => {
    const array = new LazyCollectionProvider([1, 2, 3]);
    const vt = new Transform<number>((n) => n + 1);
    const output = [...vt.view(array)];
    expect(output).toEqual([2, 3, 4]);

    vt.transformation = (n) => n - 1;
    const newOutput = [...vt.view(array)];
    expect(newOutput).toEqual([0, 1, 2]);
  });

  test('retrieve transformation', () => {
    const vt = new Transform<number>((n) => n + 1);
    expect(vt.transformation(1)).toEqual(2);
  });
});
