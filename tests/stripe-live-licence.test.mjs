
import test from "node:test";
import assert from "node:assert/strict";
import { buildLiveLicence } from "../src/stripe-live-licence.js";


const sheet = {
  nome_associazione: "Associazione Test ODV",
  cf: "12345678901",
  tipo_ente: "ODV",
  runts: "Si",
  regione: "Lombardia",
  provincia: "Monza e Brianza",
  settore_principale: "Salute",
  finalita_statutarie: "Tutela della salute",
  capacita_progetti: "Organizzazione di iniziative",
  referente: "Referente Test",
  email_referente: "test@example.com",
  ack_completezza: "Sì",
  luogo_data: "Monza, 01/11/2026",
  compilatore: "Referente Test",
  privacy: "Sì",
  area_salute: "Salute e prevenzione",
  att_assistenza: "Assistenza ai pazienti",
  ben_pazienti: "Pazienti",
  progetti_interesse: "Progetti sanitari"
};

const order = {
  id: "ordine123",
  mode: "live",
  organization: sheet.nome_associazione,
  email: sheet.email_referente,
  entityType: sheet.tipo_ente,
  region: sheet.regione,
  sheet
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

test("conserva la scheda completa dell'associazione", () => {
  const licence = prepare();

  // Dati principali
  assert.equal(licence.profile.name, sheet.nome_associazione);
  assert.equal(licence.profile.type, sheet.tipo_ente);
  assert.equal(licence.profile.region, sheet.regione);
  assert.equal(licence.profile.province, sheet.provincia);

  // Informazioni utilizzate per la ricerca dei bandi
  assert.equal(
    licence.profile.sector,
    sheet.settore_principale
  );
  assert.equal(
    licence.profile.statutoryPurposes,
    sheet.finalita_statutarie
  );
  assert.equal(
    licence.profile.capabilities,
    sheet.capacita_progetti
  );
  assert.ok(licence.profile.areas.includes(sheet.area_salute));
  assert.ok(licence.profile.activities.includes(sheet.att_assistenza));
  assert.ok(licence.profile.beneficiaries.includes(sheet.ben_pazienti));

  // Conservazione della scheda originale
  assert.deepEqual(
  { ...licence.profile.sourceSheet },
  { ...sheet, partita_iva: '' }
);

  // Durata e riferimenti al pagamento
  assert.equal(licence.profile.durationMonths, 12);
  assert.equal(licence.payment.amount, 1990);
  assert.equal(licence.payment.currency, "eur");
});
