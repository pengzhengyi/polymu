import { Abstraction } from './Abstraction';
import { NotImplemented } from '../utils/errors';

class TestInstantiation extends Abstraction {}

describe('Testing Prop', () => {
  let value: any = null;
  const mockGetter = jest.fn(() => value).mockName('Getter');
  const mockSetter = jest.fn((newValue: any) => (value = newValue)).mockName('Setter');
  const instantiation = new TestInstantiation({
    field: {
      get: mockGetter,
      set: mockSetter,
    },
  });

  test('Prop Existence', () => {
    expect(Object.keys(instantiation)).toEqual(['field']);
    expect('field' in instantiation).toBe(true);
  });

  test('getter and setter', () => {
    expect((instantiation as any).field).toBeNull();
    (instantiation as any).field = 'foo';
    expect((instantiation as any).field).toBe('foo');
    expect(mockGetter.mock.calls).toHaveLength(2);
    expect(mockSetter.mock.calls).toHaveLength(1);
  });

  test('Iteration', () => {
    for (const [propName, propValue] of instantiation) {
      expect(propName).toBe('field');
      expect(propValue).toBe('foo');
    }
  });
});

describe('Unimplemented getter and setter', () => {
  const instantiation = new TestInstantiation({
    id: {},
  });
  test('throwing NotImplemented error', () => {
    expect(() => (instantiation as any).id).toThrow(NotImplemented);
    expect(() => ((instantiation as any).id = 'foo')).toThrow(NotImplemented);
  });
});

describe('Register and Revoke Props', () => {
  const instantiation = new TestInstantiation({
    id: {},
  });
  test('initial register', () => {
    expect(Object.keys(instantiation)).toEqual(['id']);
  });
  test('register additional props', () => {
    instantiation.registerProps__(
      {
        textContent: {},
      },
      false
    );
    expect(Object.keys(instantiation)).toEqual(expect.arrayContaining(['id', 'textContent']));
  });
  test('replace props', () => {
    instantiation.registerProps__(
      {
        classList: {},
      },
      true
    );
    expect(Object.keys(instantiation)).toEqual(['classList']);
  });
  test('revoke existing props', () => {
    instantiation.registerProps__({}, true);
    expect(Object.keys(instantiation)).toEqual([]);
  });
});

describe('Testing naming rule', () => {
  expect(Abstraction.satisfyNamingRule__('publicMethod__')).toBe(true);
  expect(Abstraction.satisfyNamingRule__('protectedMethod__')).toBe(true);
  expect(Abstraction.satisfyNamingRule__('__privateMethod')).toBe(true);
  expect(Abstraction.satisfyNamingRule__('publicField_')).toBe(true);
  expect(Abstraction.satisfyNamingRule__('protectedField_')).toBe(true);
  expect(Abstraction.satisfyNamingRule__('_privateField')).toBe(true);
  expect(Abstraction.satisfyNamingRule__('normalField')).toBe(false);
});
