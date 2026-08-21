import { verifySignature } from "@arbi/core";
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { silentLogger, testCore } from "./helpers";

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";

function sign(body: string, secret: string = APP_SECRET): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

const SAMPLE_PAYLOAD = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            contacts: [{ wa_id: "33612345678", profile: { name: "Client Test" } }],
            messages: [
              {
                id: "wamid.test-1",
                from: "33612345678",
                timestamp: "1700000000",
                type: "text",
                text: { body: "Bonjour" },
              },
            ],
          },
        },
      ],
    },
  ],
});

describe("verifySignature", () => {
  it("accepte une signature HMAC SHA256 valide", () => {
    expect(verifySignature(APP_SECRET, Buffer.from(SAMPLE_PAYLOAD), sign(SAMPLE_PAYLOAD))).toBe(true);
  });
  it("rejette un mauvais secret, un header absent ou mal formé", () => {
    const body = Buffer.from(SAMPLE_PAYLOAD);
    expect(verifySignature(APP_SECRET, body, sign(SAMPLE_PAYLOAD, "wrong"))).toBe(false);
    expect(verifySignature(APP_SECRET, body, undefined)).toBe(false);
    expect(verifySignature(APP_SECRET, body, "md5=abcdef")).toBe(false);
  });
});

describe("POST /webhook", () => {
  let core: ReturnType<typeof testCore>;
  let pushed: Array<{ waId: string; text: string; buttonId?: string }>;
  let app: ReturnType<typeof buildServer>;

  beforeEach(() => {
    core = testCore();
    pushed = [];
    app = buildServer({
      config: { VERIFY_TOKEN, APP_SECRET },
      core,
      queue: {
        push: (waId, item) => pushed.push({ waId, text: item.text, buttonId: item.buttonId }),
      },
      log: silentLogger(),
    });
  });

  afterEach(async () => {
    await app.close();
    core.close();
  });

  it("accepte un payload signé et met le message en file", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: SAMPLE_PAYLOAD,
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(SAMPLE_PAYLOAD) },
    });
    expect(response.statusCode).toBe(200);
    expect(pushed).toEqual([{ waId: "33612345678", text: "Bonjour", buttonId: undefined }]);
    expect(core.messages.history("33612345678")).toHaveLength(1);
  });

  it("rejette en 401 une signature invalide ou absente", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: SAMPLE_PAYLOAD,
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(SAMPLE_PAYLOAD, "x") },
    });
    expect(bad.statusCode).toBe(401);
    const none = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: SAMPLE_PAYLOAD,
      headers: { "content-type": "application/json" },
    });
    expect(none.statusCode).toBe(401);
    expect(pushed).toHaveLength(0);
  });

  it("déduplique les retries Meta (même wamid)", async () => {
    const headers = {
      "content-type": "application/json",
      "x-hub-signature-256": sign(SAMPLE_PAYLOAD),
    };
    await app.inject({ method: "POST", url: "/webhook", payload: SAMPLE_PAYLOAD, headers });
    await app.inject({ method: "POST", url: "/webhook", payload: SAMPLE_PAYLOAD, headers });
    expect(pushed).toHaveLength(1);
  });

  it("route un clic de bouton interactif avec son buttonId", async () => {
    const buttonPayload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    id: "wamid.btn-1",
                    from: "33612345678",
                    timestamp: "1700000000",
                    type: "interactive",
                    interactive: {
                      type: "button_reply",
                      button_reply: { id: "btn_alerte", title: "🔔 Laisser une alerte" },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: buttonPayload,
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(buttonPayload) },
    });
    expect(response.statusCode).toBe(200);
    expect(pushed).toEqual([
      { waId: "33612345678", text: "[Bouton] 🔔 Laisser une alerte", buttonId: "btn_alerte" },
    ]);
  });

  it("ignore les réactions emoji (rien en base, fenêtre 24 h intacte)", async () => {
    const reactionPayload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    id: "wamid.reaction-1",
                    from: "33612345678",
                    timestamp: "1700000000",
                    type: "reaction",
                    reaction: { message_id: "wamid.test-1", emoji: "👍" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: reactionPayload,
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(reactionPayload) },
    });
    expect(response.statusCode).toBe(200);
    expect(pushed).toHaveLength(0);
    expect(core.messages.lastInboundTs("33612345678")).toBeNull();
  });
});

describe("GET /webhook (vérification Meta)", () => {
  it("renvoie le challenge si le verify_token correspond, 403 sinon", async () => {
    const core = testCore();
    const app = buildServer({
      config: { VERIFY_TOKEN, APP_SECRET },
      core,
      queue: { push: () => {} },
      log: silentLogger(),
    });
    const ok = await app.inject({
      method: "GET",
      url: `/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe("12345");
    const ko = await app.inject({
      method: "GET",
      url: "/webhook?hub.mode=subscribe&hub.verify_token=mauvais&hub.challenge=12345",
    });
    expect(ko.statusCode).toBe(403);
    await app.close();
    core.close();
  });
});
