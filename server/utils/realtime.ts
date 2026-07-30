import { EventEmitter } from 'node:events';

class RealtimeEvents extends EventEmitter {}

if (!(globalThis as any).__logEvents) {
  const emitter = new RealtimeEvents();
  emitter.setMaxListeners(100);
  (globalThis as any).__logEvents = emitter;
}

export const logEvents = (globalThis as any).__logEvents;
