
/**
 * BANDOVERA - Preparazione licenze Stripe LIVE
 *
 * Nessuna scrittura su Cloudflare KV.
 * Nessun invio email.
 * Nessuna attivazione automatica.
 *
 * La sessione Stripe deve essere recuperata e
 * verificata dal server prima di chiamare
 * questa funzione.
 */

import { expiryAfterMonths } from "./stripe-licence-preparation.js";
import { validateSheet, mapSheet } from "./stripe-request-schema.js";
export function buildLiveLicence({ order, session, code, now }) {
  if (!order || order.mode !== "live") {
    throw new Error("Ordine reale non valido");
  }

  if (
    !session ||
    session.livemode !== true ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    !String(session.id || "").startsWith("cs_live_")
  ) {
    throw new Error("Pagamento Stripe LIVE non confermato");
  }

  if (
    session.client_reference_id !== order.id ||
    session.metadata?.request_id !== order.id ||
    (order.sessionId && session.id !== order.sessionId)
  ) {
    throw new Error("Ordine e pagamento non corrispondono");
  }

  if (
    session.amount_total !== 1990 ||
    session.currency !== "eur"
  ) {
    throw new Error("Importo del pagamento non valido");
  }

  if (!/^RB-\d{4,}$/.test(String(code || ""))) {
    throw new Error("Codice licenza non valido");
  }

  const sheet = validateSheet(order.sheet);
  const name = sheet.nome_associazione;

  if (
    order.organization !== name ||
    order.email !== sheet.email_referente
  ) {
    throw new Error("Scheda e ordine non corrispondono");
  }

  const createdAt = new Date(now).toISOString();
  const expiresAt = expiryAfterMonths(createdAt);

  return {
    license: code,
    name,
    active: true,
    price: 19.90,
    createdAt,
    updatedAt: createdAt,
    expiresAt,

   profile: {
      ...mapSheet(sheet),
      license: code,
      active: true,
      createdAt,
      expiresAt,
      durationMonths: 12,
      price: 19.90
    },

    payment: {
      provider: "stripe",
      mode: "live",
      orderId: order.id,
      sessionId: session.id,
      amount: 1990,
      currency: "eur"
    }
  };
}
