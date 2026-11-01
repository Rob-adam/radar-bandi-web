
import test from "node:test";
import assert from "node:assert/strict";
import { buildLiveLicence } from "../src/stripe-live-licence.js";

const order = {
  id: "ordine123",
  mode: "live",
  organization: "Associazione Test ODV",
  email: "test@example.com",
  entityType: "ODV",
  region: "Lombardia"
};

const session = {
  id: "cs_live_esempio123",
  livemode: true,
  mode: "payment",
  payment_status: "paid",
  amount_total: 1990,
  currency: "eur",
  client_reference_id: order.id,
  metadata: { request_id: order.id }
};

const prepare = (overrides = {}) =>
  buildLiveLicence({
    order,
    session,
    code: "RB-9999",
    now: "2026-11-01T10:00:00Z",
    ...overrides
  });

test("crea licenza LIVE valida per 12 mesi", () => {
  const licence = prepare();

  assert.equal(licence.license, "RB-9999");
  assert.equal(licence.expiresAt, "2027-11-01");
  assert.equal(licence.price, 19.90);
  assert.equal(licence.active, true);
  assert.equal(licence.payment.mode, "live");
});

test("rifiuta sessioni Stripe di prova", () => {
  assert.throws(() =>
    prepare({
      session: { ...session, id: "cs_test_123", livemode: false }
    })
  );
});

test("rifiuta pagamenti non confermati", () => {
  assert.throws(() =>
    prepare({
      session: { ...session, payment_status: "unpaid" }
    })
  );
});

test("rifiuta importi differenti da 19,90 euro", () => {
  assert.throws(() =>
    prepare({
      session: { ...session, amount_total: 1500 }
    })
  );
});

test("rifiuta ordini discordanti", () => {
  assert.throws(() =>
    prepare({
      session: { ...session, client_reference_id: "altro_ordine" }
    })
  );
});

test("rifiuta codici licenza non validi", () => {
  assert.throws(() =>
    prepare({ code: "LICENZA-ERRATA" })
  );
});

test("rifiuta ordini non LIVE", () => {
  assert.throws(() =>
    prepare({
      order: { ...order, mode: "test" }
    })
  );
});

test("rifiuta sessioni diverse da quella dell'ordine", () => {
  assert.throws(() =>
    prepare({
      order: { ...order, sessionId: "cs_live_altra_sessione" }
    })
  );
});

test("non modifica i dati originali", () => {
  const originalOrder = structuredClone(order);
  const originalSession = structuredClone(session);

  prepare();

  assert.deepEqual(order, originalOrder);
  assert.deepEqual(session, originalSession);
});
