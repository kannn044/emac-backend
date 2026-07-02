import type { DomainEvent, EventBus } from '@/ports/index';
import type { Logger } from './logger';

/** In-process EventBus — เพียงพอสำหรับ single-process; สลับเป็น queue ภายหลังได้ */
export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<
    string,
    Array<(e: DomainEvent) => Promise<void>>
  >();

  constructor(private readonly logger: Logger) {}

  subscribe(type: string, handler: (e: DomainEvent) => Promise<void>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  async publish(event: DomainEvent): Promise<void> {
    const list = this.handlers.get(event.type) ?? [];
    await Promise.all(
      list.map((h) =>
        h(event).catch((err) =>
          this.logger.error({ err, eventType: event.type }, 'event handler failed'),
        ),
      ),
    );
  }
}
