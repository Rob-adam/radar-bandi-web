/**
 * BANDOVERA — verifica webhook Stripe, modulo isolato di sviluppo.
 * Nessuna rotta pubblica è collegata a questo modulo e NON attiva licenze.
 * Da utilizzare soltanto dopo aver configurato il routing, il registro ordini
 * transazionale e l'ambiente sandbox separato.
 */
const encoder = new TextEncoder();

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function fromHex(hex) {
  if (!/^[a-f0-9]{64}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/.{2}/g), pair => parseInt(pair, 16));
}

function parseSignature(header) {
  const parts = String(header || "").split(",").map(part => part.trim());
  let timestamp = null;
  const signatures = [];
  for (const part of parts) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i), value = part.slice(i + 1);
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1") {
      const bytes = fromHex(value);
      if (bytes) signatures.push(bytes);
    }
  }
  return {timestamp, signatures};
}

/**
 * Validates the *unmodified* HTTP request body and Stripe-Signature header.
 * Throws on malformed, expired or mismatched signatures.
 * @param {string} rawBody exact UTF-8 body received by the Worker
 * @param {string} signatureHeader Stripe-Signature
 * @param {string} webhookSecret whsec_... from Cloudflare secrets
 * @param {number} nowSeconds clock for tests, default current time
 */
export async function verifyStripeEvent(rawBody, signatureHeader, webhookSecret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof rawBody !== "string" || !rawBody || typeof webhookSecret !== "string" || !webhookSecret.startsWith("whsec_")) {
    throw new Error("Parametri webhook non validi");
  }
  const {timestamp, signatures} = parseSignature(signatureHeader);
  if (!Number.isSafeInteger(timestamp) || signatures.length === 0 || Math.abs(nowSeconds - timestamp) > 300) {
    throw new Error("Firma Stripe mancante o scaduta");
  }
  const hmacKey = await crypto.subtle.importKey("raw", encoder.encode(webhookSecret), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(timestamp + "." + rawBody)));
  if (!signatures.some(sig => timingSafeEqual(sig, mac))) throw new Error("Firma Stripe non valida");
  const event = JSON.parse(rawBody);
  if (!event || typeof event.id !== "string" || typeof event.type !== "string" || !event.data?.object) {
    throw new Error("Evento Stripe non valido");
  }
  return event;
}

/**
 * Produce an instruction to the order processor; NEVER grants access by itself.
 * The order processor must use an atomic, durable idempotency mechanism
 * and reconcile the paid session with an existing customer request.
 */
export function classifyPaidCheckout(event, {expectedAmount = 1990, expectedCurrency = "eur"} = {}) {
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event?.type)) {
    return {action: "ignore"};
  }
  const session = event.data.object;
  if (session.object !== "checkout" && session.object !== "checkout.session") return {action: "ignore"};
  if (session.mode !== "payment" || session.payment_status !== "paid") return {action: "pending"};
  if (session.livemode !== false || event.livemode !== false) return {action: "reject", reason: "non_sandbox"};
  if (session.amount_total !== expectedAmount || String(session.currency).toLowerCase() !== expectedCurrency) {
    return {action: "reject", reason: "importo_valuta"};
  }
  const requestId = session.client_reference_id || session.metadata?.request_id;
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(String(requestId || ""))) {
    return {action: "reject", reason: "richiesta_assente"};
  }
  return {action: "reconcile", eventId: event.id, sessionId: session.id, requestId, amount: session.amount_total, currency: session.currency};
}
