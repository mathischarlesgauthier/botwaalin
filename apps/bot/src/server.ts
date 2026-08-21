import { logDecision, verifySignature, type Core, type Logger } from "@arbi/core";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import type { InboundItem } from "./queue";

export interface ServerConfig {
  VERIFY_TOKEN: string;
  APP_SECRET: string;
}

export interface InboundQueue {
  push(waId: string, item: InboundItem): void;
}

export interface ServerDeps {
  config: ServerConfig;
  core: Core;
  queue: InboundQueue;
  log: Logger;
}

const webhookMessageSchema = z.looseObject({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.string(),
  text: z.looseObject({ body: z.string() }).optional(),
  interactive: z
    .looseObject({
      type: z.string().optional(),
      list_reply: z.looseObject({ id: z.string(), title: z.string() }).optional(),
      button_reply: z.looseObject({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
  button: z.looseObject({ text: z.string().optional() }).optional(),
});

const webhookSchema = z.looseObject({
  object: z.string(),
  entry: z
    .array(
      z.looseObject({
        changes: z
          .array(
            z.looseObject({
              field: z.string().optional(),
              value: z.looseObject({
                contacts: z
                  .array(
                    z.looseObject({
                      wa_id: z.string(),
                      profile: z.looseObject({ name: z.string().optional() }).optional(),
                    }),
                  )
                  .optional(),
                messages: z.array(webhookMessageSchema).optional(),
                statuses: z.array(z.unknown()).optional(),
              }),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

type WebhookMessage = z.infer<typeof webhookMessageSchema>;

export function extractInbound(message: WebhookMessage): { text: string; buttonId?: string } {
  switch (message.type) {
    case "text":
      return { text: message.text?.body ?? "" };
    case "interactive": {
      const listReply = message.interactive?.list_reply;
      if (listReply) return { text: `[Choix menu] ${listReply.title}` };
      const buttonReply = message.interactive?.button_reply;
      if (buttonReply) {
        return { text: `[Bouton] ${buttonReply.title}`, buttonId: buttonReply.id };
      }
      return { text: "" };
    }
    case "button":
      return { text: message.button?.text ?? "" };
    case "reaction":
    case "system":
      // Ni un tour de conversation, ni une réouverture de la fenêtre 24 h.
      return { text: "" };
    default:
      return {
        text: `[Le client a envoyé un message de type "${message.type}" que tu ne peux pas lire — demande-lui poliment de préciser par écrit]`,
      };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { config, core, queue, log } = deps;
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req: FastifyRequest, body: Buffer, done) => {
      req.rawBody = body;
      if (body.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body.toString("utf8")));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/webhook", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    if (mode === "subscribe" && token === config.VERIFY_TOKEN && challenge) {
      logDecision(log, "webhook_verified", {});
      return reply.code(200).type("text/plain").send(challenge);
    }
    logDecision(log, "webhook_verification_rejected", { mode });
    return reply.code(403).send({ error: "verification failed" });
  });

  app.post("/webhook", async (request, reply) => {
    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    if (!request.rawBody || !verifySignature(config.APP_SECRET, request.rawBody, signature)) {
      logDecision(log, "webhook_rejected_signature", { hasSignature: Boolean(signature) });
      return reply.code(401).send({ error: "invalid signature" });
    }

    const parsed = webhookSchema.safeParse(request.body);
    if (!parsed.success) {
      log.warn({ issues: parsed.error.issues.slice(0, 3) }, "webhook_payload_unexpected");
      return reply.code(200).send({ received: true });
    }
    if (parsed.data.object !== "whatsapp_business_account") {
      return reply.code(200).send({ received: true });
    }

    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (value.statuses?.length) {
          log.debug({ count: value.statuses.length }, "statuses_received");
        }
        if (!value.messages?.length) continue;

        const profileByWaId = new Map(
          (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]),
        );

        for (const message of value.messages) {
          if (core.messages.hasWamid(message.id)) {
            logDecision(log, "duplicate_message_skipped", { wamid: message.id });
            continue;
          }
          const inbound = extractInbound(message);
          if (!inbound.text) {
            logDecision(log, "inbound_ignored", { waId: message.from, type: message.type });
            continue;
          }

          const ts = message.timestamp ? Number(message.timestamp) * 1000 : Date.now();
          const profileName = profileByWaId.get(message.from);
          core.contacts.upsert(message.from, profileName ?? null);
          core.messages.insert(message.from, "user", inbound.text, message.id, ts);
          queue.push(message.from, {
            text: inbound.text,
            profileName,
            ...(inbound.buttonId ? { buttonId: inbound.buttonId } : {}),
          });
          logDecision(log, "inbound_queued", {
            waId: message.from,
            type: message.type,
            wamid: message.id,
            buttonId: inbound.buttonId,
          });
        }
      }
    }

    return reply.code(200).send({ received: true });
  });

  return app;
}
