import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "../src/db";
import { buildServer } from "../src/server";
import { verifySignature } from "../src/whatsapp";
import { silentLogger, testConfig, TEST_APP_SECRET, TEST_VERIFY_TOKEN } from "./helpers";

function sign(body: string, secret: string = TEST_APP_SECRET): string {
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
    const body = Buffer.from(SAMPLE_PAYLOAD);
    expect(verifySignature(TEST_APP_SECRET, body, sign(SAMPLE_PAYLOAD))).toBe(true);
  });

  it("rejette une signature calculée avec un autre secret", () => {
    const body = Buffer.from(SAMPLE_PAYLOAD);
    expect(
      verifySignature(TEST_APP_SECRET, body, sign(SAMPLE_PAYLOAD, "wrong-secret")),
    ).toBe(false);
  });

  it("rejette un header absent ou mal formé", () => {
    const body = Buffer.from(SAMPLE_PAYLOAD);
    expect(verifySignature(TEST_APP_SECRET, body, undefined)).toBe(false);
    expect(verifySignature(TEST_APP_SECRET, body, "md5=abcdef")).toBe(false);
    expect(verifySignature(TEST_APP_SECRET, body, "sha256=nothex")).toBe(false);
  });
});

describe("POST /webhook", () => {
  let db: Db;
  let pushed: Array<{ waId: string; text: string }>;
  let app: ReturnType<typeof buildServer>;

  beforeEach(() => {
    db = createDb(":memory:");
    pushed = [];
    app = buildServer({
      config: testConfig(),
      db,
      queue: {
        push: (waId, item) => {
          pushed.push({ waId, text: item.text });
        },
      },
      log: silentLogger(),
    });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    vi.restoreAllMocks();
  });

  it("accepte un payload correctement signé et met le message en file", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: SAMPLE_PAYLOAD,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(SAMPLE_PAYLOAD),
      },
    });
    expect(response.statusCode).toBe(200);
    expect(pushed).toEqual([{ waId: "33612345678", text: "Bonjour" }]);
    expect(db.getHistory("33612345678")).toHaveLength(1);
  });

  it("rejette en 401 une signature invalide sans rien traiter", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: SAMPLE_PAYLOAD,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(SAMPLE_PAYLOAD, "wrong-secret"),
      },
    });
    expect(response.statusCode).toBe(401);
    expect(pushed).toHaveLength(0);
  });

  it("rejette en 401 une requête sans signature", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: SAMPLE_PAYLOAD,
      headers: { "content-type": "application/json" },
    });
    expect(response.statusCode).toBe(401);
    expect(pushed).toHaveLength(0);
  });

  it("ignore les réactions emoji : rien en base, rien en file, fenêtre 24 h intacte", async () => {
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
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(reactionPayload),
      },
    });
    expect(response.statusCode).toBe(200);
    expect(pushed).toHaveLength(0);
    expect(db.getHistory("33612345678")).toHaveLength(0);
    expect(db.lastInboundTs("33612345678")).toBeNull();
  });

  it("déduplique un message déjà reçu (retry Meta)", async () => {
    const headers = {
      "content-type": "application/json",
      "x-hub-signature-256": sign(SAMPLE_PAYLOAD),
    };
    await app.inject({ method: "POST", url: "/webhook", payload: SAMPLE_PAYLOAD, headers });
    await app.inject({ method: "POST", url: "/webhook", payload: SAMPLE_PAYLOAD, headers });
    expect(pushed).toHaveLength(1);
    expect(db.getHistory("33612345678")).toHaveLength(1);
  });
});

describe("GET /webhook (vérification Meta)", () => {
  it("renvoie le challenge si le verify_token correspond", async () => {
    const db = createDb(":memory:");
    const app = buildServer({
      config: testConfig(),
      db,
      queue: { push: () => {} },
      log: silentLogger(),
    });
    const response = await app.inject({
      method: "GET",
      url: `/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=12345`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("12345");
    await app.close();
    db.close();
  });

  it("refuse en 403 un verify_token incorrect", async () => {
    const db = createDb(":memory:");
    const app = buildServer({
      config: testConfig(),
      db,
      queue: { push: () => {} },
      log: silentLogger(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/webhook?hub.mode=subscribe&hub.verify_token=mauvais&hub.challenge=12345",
    });
    expect(response.statusCode).toBe(403);
    await app.close();
    db.close();
  });
});
