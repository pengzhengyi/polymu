import { CircularArray } from "./CircularArray";

describe('CircularArray test', () => {
    test('basic adding', () => {
        const circularArray = new CircularArray(3);
        expect(circularArray.capacity).toEqual(3);
        expect(circularArray.length).toEqual(0);
        expect(circularArray.isEmpty).toBe(true);
        expect(circularArray.isFull).toBe(false);
        expect(Array.from(circularArray)).toEqual([]);

        circularArray.add(1);
        expect(circularArray.length).toEqual(1);
        expect(1).toEqual(circularArray.get(0));
        expect(circularArray.isEmpty).toBe(false);
        expect(circularArray.isFull).toBe(false);
        expect(Array.from(circularArray)).toEqual([1]);

        circularArray.add(2);
        expect(circularArray.length).toEqual(2);
        expect(1).toEqual(circularArray.get(0));
        expect(2).toEqual(circularArray.get(1));
        expect(circularArray.isEmpty).toBe(false);
        expect(circularArray.isFull).toBe(false);
        expect(Array.from(circularArray)).toEqual([1, 2]);

        circularArray.add(3);
        expect(circularArray.length).toEqual(3);
        expect(1).toEqual(circularArray.get(0));
        expect(2).toEqual(circularArray.get(1));
        expect(3).toEqual(circularArray.get(2));
        expect(circularArray.isEmpty).toBe(false);
        expect(circularArray.isFull).toBe(true);
        expect(Array.from(circularArray)).toEqual([1, 2, 3]);

        circularArray.add(4);
        expect(circularArray.length).toEqual(3);
        expect(2).toEqual(circularArray.get(0));
        expect(3).toEqual(circularArray.get(1));
        expect(4).toEqual(circularArray.get(2));
        expect(circularArray.isEmpty).toBe(false);
        expect(circularArray.isFull).toBe(true);
        expect(Array.from(circularArray)).toEqual([2, 3, 4]);
        
        circularArray.add(5);
        expect(circularArray.length).toEqual(3);
        expect(3).toEqual(circularArray.get(0));
        expect(4).toEqual(circularArray.get(1));
        expect(5).toEqual(circularArray.get(2));
        expect(circularArray.isEmpty).toBe(false);
        expect(circularArray.isFull).toBe(true);
        expect(Array.from(circularArray)).toEqual([3, 4, 5]);

        circularArray.add(6);
        expect(circularArray.length).toEqual(3);
        expect(4).toEqual(circularArray.get(0));
        expect(5).toEqual(circularArray.get(1));
        expect(6).toEqual(circularArray.get(2));
        expect(circularArray.isEmpty).toBe(false);
        expect(circularArray.isFull).toBe(true);
        expect(Array.from(circularArray)).toEqual([4, 5, 6]);
        expect(Array.from(circularArray.slice(0, 2))).toEqual([4, 5]);

        circularArray.add(7);
        expect(circularArray.length).toEqual(3);
        expect(5).toEqual(circularArray.get(0));
        expect(6).toEqual(circularArray.get(1));
        expect(7).toEqual(circularArray.get(2));
        expect(circularArray.isEmpty).toBe(false);
        expect(circularArray.isFull).toBe(true);
        expect(Array.from(circularArray)).toEqual([5, 6, 7]);
        expect(Array.from(circularArray.slice(1, 3))).toEqual([6, 7]);
    });

    test('capacity change', () => {
        const circularArray = new CircularArray(3);
        circularArray.add(1);
        circularArray.add(2);
        circularArray.add(3);
        expect(circularArray.length).toEqual(3);
        expect(circularArray.capacity).toEqual(3);
        expect(1).toEqual(circularArray.get(0));
        expect(2).toEqual(circularArray.get(1));
        expect(3).toEqual(circularArray.get(2));

        circularArray.capacity = 5;
        expect(circularArray.length).toEqual(3);
        expect(circularArray.capacity).toEqual(5);
        expect(1).toEqual(circularArray.get(0));
        expect(2).toEqual(circularArray.get(1));
        expect(3).toEqual(circularArray.get(2));

        circularArray.add(4);
        circularArray.add(5);
        circularArray.add(6);
        expect(circularArray.length).toEqual(5);
        expect(circularArray.capacity).toEqual(5);
        expect(Array.from(circularArray)).toEqual([2, 3, 4, 5, 6]);

        circularArray.capacity = 2;
        expect(circularArray.length).toEqual(2);
        expect(circularArray.capacity).toEqual(2);
        expect(Array.from(circularArray)).toEqual([2, 3]);

        circularArray.capacity = 4;
        expect(circularArray.length).toEqual(2);
        expect(circularArray.capacity).toEqual(4);
        expect(Array.from(circularArray)).toEqual([2, 3]);

        circularArray.add(4);
        circularArray.add(5);
        circularArray.add(6);
        circularArray.add(7);
        expect(circularArray.length).toEqual(4);
        expect(circularArray.capacity).toEqual(4);
        expect(Array.from(circularArray)).toEqual([4, 5, 6, 7]);

        circularArray.capacity = 5;
        expect(circularArray.length).toEqual(4);
        expect(circularArray.capacity).toEqual(5)
        expect(Array.from(circularArray)).toEqual([4, 5, 6, 7]);

        circularArray.capacity = 3;
        expect(circularArray.length).toEqual(3);
        expect(circularArray.capacity).toEqual(3)
        expect(Array.from(circularArray)).toEqual([4, 5, 6]);
    });
});