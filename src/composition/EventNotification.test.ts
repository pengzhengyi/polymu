import { EventNotifier } from './EventNotification';

describe('get event notification', () => {
  const notifier = new EventNotifier();
  test('single subscriber', () => {
    const subscriber = { count: 0 };
    notifier.subscribe(
      subscriber,
      'increaseCount',
      (eventName, source, subscriber, ...eventArgs) => (subscriber as { count: number }).count++
    );
    notifier.invoke('increaseCount');
    expect(subscriber.count).toBe(1);
    notifier.invoke('increaseCount');
    expect(subscriber.count).toBe(2);
  });
});
