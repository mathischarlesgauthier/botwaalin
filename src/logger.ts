import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(level = "info"): Logger {
  return pino({
    level,
    base: { service: "wa-agent" },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

/** Journal structuré de toutes les décisions métier (JSON). */
export function logDecision(
  log: Logger,
  decision: string,
  data: Record<string, unknown> = {},
): void {
  log.info({ decision, ...data }, "decision");
}
