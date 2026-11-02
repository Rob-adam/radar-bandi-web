
/**
 * BANDOVERA - Classificazione pagamenti Stripe LIVE.
 *
 * Non crea licenze, non registra incassi e non invia email.
 * Da utilizzare soltanto dopo la verifica della firma webhook.
 * Il coordinatore deve recuperare la sessione dalle API Stripe
 * prima di considerare il pagamento definitivamente verificato.
 */

import { verifyStripeEvent } from './stripe-webhook-verification.js';

const VALID_ORDER_ID = /^[a-zA-Z0-9_-]{8,100}$/;

export { verifyStripeEvent };

export function classifyLivePaidCheckout(event) {
  if (
    ![
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded'
    ].includes(event?.type)
  ) {
    return { action: 'ignore' };
  }

  const session = event?.data?.object;

  if (!session || session.object !== 'checkout.session') {
    return { action: 'reject', reason: 'sessione_non_valida' };
  }

  if (event.livemode !== true || session.livemode !== true) {
    return { action: 'reject', reason: 'non_live' };
  }

  if (
    typeof session.id !== 'string' ||
    !session.id.startsWith('cs_live_')
  ) {
    return { action: 'reject', reason: 'sessione_non_live' };
  }

  if (
    session.mode !== 'payment' ||
    session.payment_status !== 'paid'
  ) {
    return { action: 'pending' };
  }

  if (
    session.amount_total !== 1990 ||
    session.currency !== 'eur'
  ) {
    return { action: 'reject', reason: 'importo_valuta' };
  }

  const reference = session.client_reference_id;
  const metadataReference = session.metadata?.request_id;

  if (
    !VALID_ORDER_ID.test(String(reference || '')) ||
    reference !== metadataReference
  ) {
    return { action: 'reject', reason: 'ordine_non_corrispondente' };
  }

  if (
    typeof event.id !== 'string' ||
    !/^evt_[a-zA-Z0-9]+$/.test(event.id)
  ) {
    return { action: 'reject', reason: 'evento_non_valido' };
  }

  return {
    action: 'reconcile',
    eventId: event.id,
    orderId: reference,
    sessionId: session.id,
    amount: session.amount_total,
    currency: session.currency
  };
}
