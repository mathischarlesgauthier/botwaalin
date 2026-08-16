import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebounceQueue, type InboundItem } from "../src/queue";

describe("DebounceQueue (débounce 2,5 s)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("regroupe 3 messages d'affilée en un seul traitement", async () => {
    const handler = vi.fn<(waId: string, items: InboundItem[]) => Promise<void>>(
      async () => {},
    );
    const queue = new DebounceQueue(2500, handler);

    queue.push("336000", { text: "salut" });
    await vi.advanceTimersByTimeAsync(1000);
    queue.push("336000", { text: "je veux un site" });
    await vi.advanceTimersByTimeAsync(2000);
    queue.push("336000", { text: "un site vitrine" });

    // Le timer est réinitialisé à chaque message : rien ne part avant le silence.
    expect(handler).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2500);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("336000", [
      { text: "salut" },
      { text: "je veux un site" },
      { text: "un site vitrine" },
    ]);
  });

  it("ne déclenche pas avant le délai de silence", async () => {
    const handler = vi.fn(async () => {});
    const queue = new DebounceQueue(2500, handler);

    queue.push("336000", { text: "hello" });
    await vi.advanceTimersByTimeAsync(2499);
    expect(handler).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("traite chaque contact indépendamment", async () => {
    const handler = vi.fn(async () => {});
    const queue = new DebounceQueue(2500, handler);

    queue.push("contact-a", { text: "a1" });
    queue.push("contact-b", { text: "b1" });
    await vi.advanceTimersByTimeAsync(2500);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith("contact-a", [{ text: "a1" }]);
    expect(handler).toHaveBeenCalledWith("contact-b", [{ text: "b1" }]);
  });

  it("sérialise les batchs successifs d'un même contact", async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const firstDone = new Promise<void>((r) => {
      release = r;
    });
    const handler = vi.fn(async (_waId: string, items: InboundItem[]) => {
      order.push(`start:${items[0]?.text}`);
      if (items[0]?.text === "batch1") await firstDone;
      order.push(`end:${items[0]?.text}`);
    });
    const queue = new DebounceQueue(2500, handler);

    queue.push("336000", { text: "batch1" });
    await vi.advanceTimersByTimeAsync(2500);
    queue.push("336000", { text: "batch2" });
    await vi.advanceTimersByTimeAsync(2500);

    // batch2 attend la fin de batch1.
    expect(order).toEqual(["start:batch1"]);
    release();
    await vi.runAllTimersAsync();
    expect(order).toEqual(["start:batch1", "end:batch1", "start:batch2", "end:batch2"]);
  });

  it("signale les erreurs du handler via onError sans casser la file", async () => {
    const onError = vi.fn();
    const queue = new DebounceQueue(
      2500,
      async () => {
        throw new Error("boom");
      },
      onError,
    );
    queue.push("336000", { text: "x" });
    await vi.advanceTimersByTimeAsync(2500);
    await vi.runAllTimersAsync();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
