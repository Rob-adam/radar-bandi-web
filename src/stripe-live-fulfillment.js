
/**
 * BANDOVERA - Coordinatore licenze Stripe LIVE
 *
 * Prima fase: prenotazione centralizzata dei codici.
 *
 * Non riscuote pagamenti.
 * Non attiva licenze.
 * Non invia email.
 * Non espone ancora endpoint operativi.
 */

const INITIAL_SEQUENCE = 9000000;

function validOrderId(value) {
  return typeof value === 'string' &&
    /^[a-zA-Z0-9_-]{8,100}$/.test(value);
}

export class StripeLiveFulfillment {
  constructor(state, env) {
  this.state = state;
  this.env = env;
  this.queue = Promise.resolve();
}

  /**
   * Riserva un codice per un ordine.
   *
   * Deve essere richiamato esclusivamente dal
   * coordinatore interno, dopo la verifica Stripe.
   *
   * La stessa richiesta restituisce sempre
   * il codice gia' prenotato.
   */
  reserveCode(orderId) {
  const result = this.queue.then(() => this.reserveCodeInternal(orderId));
  this.queue = result.catch(() => {});
  return result;
}

async reserveCodeInternal(orderId) {
    if (!validOrderId(orderId)) {
      throw new Error('Identificativo ordine non valido');
    }

    if (!this.env.LICENSES) {
      throw new Error('Archivio LICENSES non disponibile');
    }

    return this.state.storage.transaction(async tx => {
      const reservationKey = 'reservation:' + orderId;
      const existingReservation =
        await tx.get(reservationKey);

      if (existingReservation) {
        return existingReservation.code;
      }

      let sequence =
        (await tx.get('license_sequence')) ??
        INITIAL_SEQUENCE;

      let code;

      do {
        sequence += 1;

        if (sequence > 99999999) {
          throw new Error('Sequenza licenze esaurita');
        }

        code = 'RB-' + sequence;

        const alreadyInKV =
          await this.env.LICENSES.get('license:' + code);

        const alreadyReserved =
          await tx.get('reserved_code:' + code);

        if (!alreadyInKV && !alreadyReserved) {
          break;
        }
      } while (true);

      await tx.put('license_sequence', sequence);

      await tx.put(reservationKey, {
        orderId,
        code,
        reservedAt: new Date().toISOString()
      });

      await tx.put('reserved_code:' + code, orderId);

      return code;
    });
  }

  /**
   * Recupera direttamente da Stripe una sessione LIVE
   * e verifica la corrispondenza con l'ordine registrato.
   *
   * Non crea licenze e non registra incassi.
   */
  async verifyLivePayment(order) {
    if (
      !order ||
      order.mode !== 'live' ||
      !validOrderId(order.id) ||
      typeof order.sessionId !== 'string' ||
      !/^cs_live_[a-zA-Z0-9_]+$/.test(order.sessionId)
    ) {
      throw new Error('Ordine LIVE non valido');
    }

    const secret = this.env.STRIPE_LIVE_SECRET_KEY;

    if (
      typeof secret !== 'string' ||
      !secret.startsWith('sk_live_')
    ) {
      throw new Error('Credenziale Stripe LIVE non configurata');
    }

    const response = await fetch(
      'https://api.stripe.com/v1/checkout/sessions/' +
        encodeURIComponent(order.sessionId),
      {
        method: 'GET',
        headers: {
          authorization: 'Bearer ' + secret
        }
      }
    );

    if (!response.ok) {
      throw new Error('Verifica Stripe non disponibile');
    }

    const session = await response.json();

    if (
      session.id !== order.sessionId ||
      session.livemode !== true ||
      session.mode !== 'payment' ||
      session.payment_status !== 'paid' ||
      session.amount_total !== 1990 ||
      session.currency !== 'eur' ||
      session.client_reference_id !== order.id ||
      session.metadata?.request_id !== order.id
    ) {
      throw new Error('Pagamento LIVE non verificato');
    }

    return session;
  }


  /**
   * Sicurezza iniziale:
   * nessun endpoint pubblico operativo.
   */
  async fetch() {
    return Response.json(
      {
        error: 'stripe_live_not_enabled'
      },
      { status: 503 }
    );
  }
}
