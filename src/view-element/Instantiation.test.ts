import {
  DomFallthroughInstantiation,
  DomForwardingInstantiation,
  ForwardingInstantiation,
} from './Instantiation';
import { NotImplemented } from '../utils/errors';

describe('set forwarding target', () => {
  const forwardingTarget = { id: 'foo' };
  const instantiation = new ForwardingInstantiation(
    {
      id: {
        get(forwardingTo: any, thisArgument: ForwardingInstantiation) {
          return forwardingTo.id;
        },
        set(v: any, forwardingTo: any, thisArgument: ForwardingInstantiation) {
          forwardingTo.id = v;
        },
      },
    },
    forwardingTarget
  );

  test('Initial get and set modifies the object', () => {
    expect((instantiation as any).id).toBe('foo');
    (instantiation as any).id = 'bar';
    expect((instantiation as any).id).toBe('bar');
    expect(forwardingTarget.id).toBe('bar');
  });

  test('Change forwarding target', () => {
    const newForwardingTarget = document.createElement('div');
    instantiation.setForwardingTo__(newForwardingTarget);
    expect((instantiation as any).id).toBe('');
    (instantiation as any).id = 'bar';
    expect((instantiation as any).id).toBe('bar');
    expect(newForwardingTarget.id).toBe('bar');
  });
});

describe('Unimplemented getter and setter', () => {
  const forwardingTarget = { id: 'foo' };
  const instantiation = new ForwardingInstantiation(
    {
      id: {},
    },
    forwardingTarget
  );
  test('throwing NotImplemented error', () => {
    expect(() => (instantiation as any).id).toThrow(NotImplemented);
    expect(() => ((instantiation as any).id = 'foo')).toThrow(NotImplemented);
  });
});

describe('DomForwardingInstantiation', () => {
  const forwardingTarget = document.createElement('div');
  const instantiation = new DomForwardingInstantiation(
    {
      id: undefined,
      secret: {
        get(forwardingTo: any, thisArgument: DomForwardingInstantiation) {
          return 24;
        },
      },
    },
    forwardingTarget
  );

  test('default forwarding property descriptor', () => {
    expect((instantiation as any).element_).toBe(forwardingTarget);
    expect((instantiation as any).id).toBe('');
    (instantiation as any).id = 'bar';
    expect((instantiation as any).id).toBe('bar');
    expect(forwardingTarget.id).toBe('bar');
  });

  test('overriden forwarding property descriptor', () => {
    expect((instantiation as any).secret).toBe(24);
  });

  test('unimplemented descriptor', () => {
    expect(() => ((instantiation as any).secret = 44)).toThrow(NotImplemented);
  });

  test('change forwarding target', () => {
    const newTarget = document.createElement('input');
    newTarget.id = 'target-input';
    (instantiation as any).element_ = newTarget;
    expect((instantiation as any).element_).toBe(newTarget);
    expect((instantiation as any).id).toBe('target-input');
  });
});

describe('DomFallthroughInstantiation', () => {
  const forwardingTarget = document.createElement('div');
  forwardingTarget.id = 'target';
  forwardingTarget.textContent = 'Hello World!';
  const instantiation = new DomFallthroughInstantiation(forwardingTarget);

  test('get and set property', () => {
    expect((instantiation as any).id).toBe('target');
    expect((instantiation as any).textContent).toBe('Hello World!');
    expect((instantiation as any).children).toHaveLength(0);

    instantiation.asDomElement__().id = 'polymu';
    expect(forwardingTarget.id).toBe('polymu');
    (instantiation as any).textContent = 'polymu';
    expect(instantiation.asDomElement__().textContent).toBe('polymu');
  });

  test('in', () => {
    expect('getAttribute' in instantiation).toBe(true);
    expect('appendChild' in instantiation).toBe(true);
  });

  test('define custom property', () => {
    // define on element
    Object.defineProperty(instantiation, '__id_', {
      value: 'hidden id',
      writable: true,
    });
    expect((forwardingTarget as any)._id).toBe('hidden id');
    Object.defineProperty(instantiation, 'random-value', {
      value: '0',
      writable: true,
    });
    expect((forwardingTarget as any)['random-value']).toBe('0');

    // define on instantiation
    Object.defineProperty(instantiation, '_numAttributes', {
      get() {
        return this.propNames_.size;
      },
    });
    expect((instantiation as any)._numAttributes).toBeGreaterThan(100);
  });
});
