
/**
 * BANDOVERA - Preparazione ordini Stripe LIVE
 *
 * Modulo senza effetti esterni:
 * - non chiama Stripe
 * - non scrive in Cloudflare
 * - non attiva licenze
 * - non invia email
 */

import { validateSheet } from './stripe-request-schema.js';

export function buildLiveOrder({
  id,
  sheet: submittedSheet,
  now = new Date().toISOString()
}) {
  if (
    typeof id !== 'string' ||
    !/^[a-f0-9]{32}$/.test(id)
  ) {
    throw new Error('Identificativo ordine non valido');
  }

  const sheet = validateSheet(submittedSheet);

  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Data ordine non valida');
  }

  return {
    id,
    mode: 'live',
    status: 'pending_payment',
    organization: sheet.nome_associazione,
    email: sheet.email_referente,
    entityType: sheet.tipo_ente,
    region: sheet.regione,
    sheet: { ...sheet },
    sessionId: null,
    license: null,
    emailState: 'not_started',
    createdAt: date.toISOString(),
    updatedAt: date.toISOString()
  };
}
