export class NotImplemented extends Error {
  constructor(message = '') {
    super(message);
    this.name = 'NotImplementedError';
    this.message = message;
  }
}

export class NotSupported extends Error {
  constructor(message = '') {
    super(message);
    this.name = 'NotSupportedError';
    this.message = message;
  }
}
