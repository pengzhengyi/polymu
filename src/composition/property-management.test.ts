import { Property, PropertyManager, UpdateBehavior } from './property-management';

interface TInstance {
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
}

/**
 * Prerequisite Tree
 *
 * ```
 *   A      -- Tier 0
 *  ⬋↓⬊
 * D ↓ B    -- Tier 1
 *  ⬊↓⬋ ⬊
 *   C   E  -- Tier 2
 * ```
 *
 * Dependency Tree
 *
 * ```
 *   A      -- Tier 0
 *  ⬈↑⬉
 * D ↑ B    -- Tier 1
 *  ⬉↑⬈ ⬉
 *   C   E  -- Tier 2
 * ```
 */
describe('Property Management Basic Scenario', () => {
  let AValue: number,
    propertyA: Property<any>,
    propertyB: Property<any>,
    propertyC: Property<any>,
    propertyD: Property<any>,
    propertyE: Property<any>,
    propertyManager: PropertyManager;

  beforeEach(() => {
    AValue = 0;
    propertyA = new Property('A', () => AValue, UpdateBehavior.Immediate);
    // B = A + 1
    propertyB = new Property(
      'B',
      (thisValue, manager) => {
        const propertyAValue: number = manager.getPropertyValue('A');
        const result = propertyAValue + 1;
        thisValue.shouldReuseLastValue = (thisValue, manager) =>
          manager.getPropertyValue('A') === propertyAValue;
        return result;
      },
      UpdateBehavior.Immediate
    );
    // D = A + 1
    propertyD = new Property(
      'D',
      (thisValue, manager) => {
        const propertyAValue: number = manager.getPropertyValue('A');
        const result = propertyAValue + 1;
        thisValue.shouldReuseLastValue = (thisValue, manager) =>
          manager.getPropertyValue('A') === propertyAValue;
        return result;
      },
      UpdateBehavior.Immediate
    );
    // C = B + D + 1
    propertyC = new Property(
      'C',
      (thisValue, manager) => {
        const propertyBValue: number = manager.getPropertyValue('B');
        const propertyDValue: number = manager.getPropertyValue('D');
        const result = propertyBValue + propertyDValue + 1;
        thisValue.shouldReuseLastValue = (thisValue, manager) =>
          manager.getPropertyValue('B') === propertyBValue &&
          manager.getPropertyValue('D') === propertyDValue;
        return result;
      },
      UpdateBehavior.Immediate
    );
    // E = B + 1
    propertyE = new Property(
      'E',
      (thisValue, manager) => {
        const propertyBValue: number = manager.getPropertyValue('B');
        const result = propertyBValue + 1;
        thisValue.shouldReuseLastValue = (thisValue, manager) =>
          manager.getPropertyValue('B') === propertyBValue;
        return result;
      },
      UpdateBehavior.Immediate
    );

    propertyManager = new PropertyManager([propertyA, propertyB, propertyC, propertyD, propertyE]);
  });

  test('dependency analysis', () => {
    expect(propertyManager.propertyToActiveDependencies.get(propertyA)).toEqual(
      new Set([propertyB, propertyD])
    );
    expect(propertyManager.propertyToActiveDependencies.get(propertyB)).toEqual(
      new Set([propertyC, propertyE])
    );
    expect([undefined, new Set()]).toContainEqual(
      propertyManager.propertyToActiveDependencies.get(propertyC)
    );
    expect(propertyManager.propertyToActiveDependencies.get(propertyD)).toEqual(
      new Set([propertyC])
    );
    expect([undefined, new Set()]).toContainEqual(
      propertyManager.propertyToActiveDependencies.get(propertyE)
    );

    expect(propertyManager.propertyToDependencyTier.get(propertyA)).toEqual(0);
    expect(propertyManager.propertyToDependencyTier.get(propertyB)).toEqual(1);
    expect(propertyManager.propertyToDependencyTier.get(propertyC)).toEqual(2);
    expect(propertyManager.propertyToDependencyTier.get(propertyD)).toEqual(1);
    expect(propertyManager.propertyToDependencyTier.get(propertyE)).toEqual(2);
  });

  test('bind and change value', () => {
    // @ts-ignore
    const obj: TInstance = {};
    propertyManager.bind(obj);

    expect('A' in obj).toBe(true);
    expect('B' in obj).toBe(true);
    expect('C' in obj).toBe(true);
    expect('D' in obj).toBe(true);
    expect('E' in obj).toBe(true);

    expect(AValue).toEqual(0);
    expect(obj.A).toBe(AValue);
    expect(obj.B).toBe(AValue + 1);
    expect(obj.C).toBe((AValue + 1) * 2 + 1);
    expect(obj.D).toBe(AValue + 1);
    expect(obj.E).toBe(AValue + 1 + 1);

    const initialVersion = propertyManager.getPropertyValueSnapshotVersionWithName('A');

    AValue = 100;
    expect(AValue).toEqual(100);
    expect(obj.A).toBe(AValue);
    expect(obj.B).toBe(AValue + 1);
    expect(obj.C).toBe((AValue + 1) * 2 + 1);
    expect(obj.D).toBe(AValue + 1);
    expect(obj.E).toBe(AValue + 1 + 1);

    const newVersion = propertyManager.getPropertyValueSnapshotVersionWithName('A');
    expect(initialVersion).toBeLessThan(newVersion);

    expect(newVersion).toEqual(propertyManager.getPropertyValueSnapshotVersionWithName('A'));
  });

  test('lazy properties', () => {
    propertyA = new Property('A', () => AValue, UpdateBehavior.Lazy);
    // B = A + 1
    propertyB = new Property(
      'B',
      (thisValue, manager) => {
        const propertyAValue: number = manager.getPropertyValue('A');
        const result = propertyAValue + 1;
        thisValue.shouldReuseLastValue = (thisValue, manager) =>
          manager.getPropertyValue('A') === propertyAValue;
        return result;
      },
      UpdateBehavior.Lazy
    );
    // D = A + 1
    propertyD = new Property(
      'D',
      (thisValue, manager) => {
        const propertyAValue: number = manager.getPropertyValue('A');
        const result = propertyAValue + 1;
        thisValue.shouldReuseLastValue = (thisValue, manager) =>
          manager.getPropertyValue('A') === propertyAValue;
        return result;
      },
      UpdateBehavior.Lazy
    );
    // C = B + D + 1
    propertyC = new Property(
      'C',
      (thisValue, manager) => {
        const propertyBValue: number = manager.getPropertyValue('B');
        const propertyDValue: number = manager.getPropertyValue('D');
        const result = propertyBValue + propertyDValue + 1;
        thisValue.shouldReuseLastValue = (thisValue, manager) =>
          manager.getPropertyValue('B') === propertyBValue &&
          manager.getPropertyValue('D') === propertyDValue;
        return result;
      },
      UpdateBehavior.Lazy
    );

    propertyManager = new PropertyManager([propertyA, propertyB, propertyC, propertyD, propertyE]);

    expect(propertyA.updateBehavior).toBe(UpdateBehavior.Immediate);
    expect(propertyB.updateBehavior).toBe(UpdateBehavior.Immediate);
    expect(propertyC.updateBehavior).toBe(UpdateBehavior.Lazy);
    expect(propertyD.updateBehavior).toBe(UpdateBehavior.Lazy);
    expect(propertyE.updateBehavior).toBe(UpdateBehavior.Immediate);

    // value is up-to-date at fetch time
    // @ts-ignore
    const obj: TInstance = {};
    propertyManager.bind(obj);

    expect('A' in obj).toBe(true);
    expect('B' in obj).toBe(true);
    expect('C' in obj).toBe(true);
    expect('D' in obj).toBe(true);
    expect('E' in obj).toBe(true);

    expect(AValue).toEqual(0);
    expect(obj.A).toBe(AValue);
    expect(obj.B).toBe(AValue + 1);
    expect(obj.C).toBe((AValue + 1) * 2 + 1);
    expect(obj.D).toBe(AValue + 1);
    expect(obj.E).toBe(AValue + 1 + 1);

    AValue = 100;
    expect(AValue).toEqual(100);

    // C, D has outdated values because they are lazy
    expect(propertyManager.getPropertyValueSnapshot(propertyC)).toEqual(3);
    expect(propertyManager.getPropertyValueSnapshot(propertyD)).toEqual(1);

    expect(obj.A).toBe(AValue);
    expect(obj.B).toBe(AValue + 1);
    expect(obj.C).toBe((AValue + 1) * 2 + 1);
    expect(obj.D).toBe(AValue + 1);
    expect(obj.E).toBe(AValue + 1 + 1);
  });
});
