export interface InboundItem {
  text: string;
  profileName?: string;
}

export type BatchHandler = (waId: string, items: InboundItem[]) => Promise<void>;

interface PendingBatch {
  items: InboundItem[];
  timer: NodeJS.Timeout;
}

/**
 * File d'attente en mémoire avec débounce par contact : si le client envoie
 * plusieurs messages d'affilée, on ne déclenche qu'une seule réponse une fois
 * le silence de `delayMs` écoulé. Les traitements d'un même contact sont
 * sérialisés pour éviter deux réponses entrelacées.
 */
export class DebounceQueue {
  private readonly pending = new Map<string, PendingBatch>();
  private readonly processing = new Map<string, Promise<void>>();

  constructor(
    private readonly delayMs: number,
    private readonly handler: BatchHandler,
    private readonly onError?: (err: unknown, waId: string) => void,
  ) {}

  push(waId: string, item: InboundItem): void {
    const existing = this.pending.get(waId);
    if (existing) {
      existing.items.push(item);
      clearTimeout(existing.timer);
      existing.timer = this.schedule(waId);
    } else {
      this.pending.set(waId, { items: [item], timer: this.schedule(waId) });
    }
  }

  /** Nombre de contacts avec un batch en attente (introspection/tests). */
  get pendingCount(): number {
    return this.pending.size;
  }

  private schedule(waId: string): NodeJS.Timeout {
    return setTimeout(() => this.flush(waId), this.delayMs);
  }

  private flush(waId: string): void {
    const batch = this.pending.get(waId);
    if (!batch) return;
    this.pending.delete(waId);

    const previous = this.processing.get(waId) ?? Promise.resolve();
    const entry: Promise<void> = previous
      .then(() => this.handler(waId, batch.items))
      .catch((err) => this.onError?.(err, waId))
      .then(() => {
        // Ne se retire de la map que si aucun batch suivant ne s'est enchaîné.
        if (this.processing.get(waId) === entry) this.processing.delete(waId);
      });
    this.processing.set(waId, entry);
  }
}
