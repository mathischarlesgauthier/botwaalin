import type { Logger } from "./logger";
import { logDecision } from "./logger";

export interface TelegramNotifier {
  notifyAdmin(text: string): Promise<boolean>;
}

export function createTelegramNotifier(
  opts: { botToken: string; chatId: string; fetchFn?: typeof fetch },
  log: Logger,
): TelegramNotifier {
  const fetchFn = opts.fetchFn ?? fetch;
  return {
    async notifyAdmin(text: string): Promise<boolean> {
      if (!opts.botToken || !opts.chatId) {
        log.warn(
          { hasToken: Boolean(opts.botToken), hasChatId: Boolean(opts.chatId) },
          "telegram_not_configured",
        );
        return false;
      }
      try {
        const response = await fetchFn(
          `https://api.telegram.org/bot${opts.botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: opts.chatId, text }),
          },
        );
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          log.error(
            { status: response.status, body: body.slice(0, 300) },
            "telegram_notify_failed",
          );
          return false;
        }
        logDecision(log, "admin_notified", { channel: "telegram" });
        return true;
      } catch (err) {
        log.error({ err: String(err) }, "telegram_notify_error");
        return false;
      }
    },
  };
}
