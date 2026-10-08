import { Injectable } from '@nestjs/common';

@Injectable()
export class PublicCacheSignals {
  private readonly listeners = new Set<() => void>();

  onAcknowledged(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  acknowledged() {
    for (const listener of this.listeners) listener();
  }
}
