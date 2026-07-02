import { randomUUID } from 'node:crypto';
import type { Clock, IdGenerator } from '@/ports/index';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Clock คงที่สำหรับ test (deterministic) */
export class FixedClock implements Clock {
  constructor(private readonly fixed: Date) {}
  now(): Date {
    return new Date(this.fixed);
  }
}

export class UuidGenerator implements IdGenerator {
  uuid(): string {
    return randomUUID();
  }
}
