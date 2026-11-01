
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StripeLiveFulfillment } from '../src/stripe-live-fulfillment.js';

function createEnvironment() {
  const stored = new Map();
  const licences = new Map();

  const storage = {
    get: async key => stored.get(key),
    transaction: async callback => callback({
      get: async key => stored.get(key),
      put: async (key, value) => {
        stored.set(key, structuredClone(value));
      }
    })
  };

  const env = {
    LICENSES: {
      get: async key => licences.get(key) ?? null
    }
  };

  return {
    worker: new StripeLiveFulfillment({ storage }, env),
    stored,
    licences
  };
}

test('due ordini diversi ricevono codici diversi', async () => {
  const { worker } = createEnvironment();

  const first = await worker.reserveCode('ordine_live_0001');
  const second = await worker.reserveCode('ordine_live_0002');

  assert.equal(first, 'RB-9000001');
  assert.equal(second, 'RB-9000002');
  assert.notEqual(first, second);
});

test('lo stesso ordine conserva il codice prenotato', async () => {
  const { worker } = createEnvironment();

  const first = await worker.reserveCode('ordine_live_0003');
  const second = await worker.reserveCode('ordine_live_0003');

  assert.equal(first, second);
});

test('una licenza gia esistente non viene riutilizzata', async () => {
  const { worker, licences } = createEnvironment();

  licences.set('license:RB-9000001', {
    license: 'RB-9000001',
    name: 'Cliente gia esistente'
  });

  const code = await worker.reserveCode('ordine_live_0004');

  assert.equal(code, 'RB-9000002');
});

test('rifiuta identificativi ordine non validi', async () => {
  const { worker } = createEnvironment();

  await assert.rejects(
    worker.reserveCode('../'),
    /Identificativo ordine non valido/
  );
});

test('gli endpoint restano disattivati', async () => {
  const { worker } = createEnvironment();

  const response = await worker.fetch(
    new Request('https://test.local/paid', { method: 'POST' })
  );

  assert.equal(response.status, 503);
});

test('richieste simultanee: verifica preliminare', async () => {
  const { worker } = createEnvironment();

  const results = await Promise.all([
    worker.reserveCode('ordine_live_0005'),
    worker.reserveCode('ordine_live_0006')
  ]);

  assert.equal(new Set(results).size, 2);
});

/**
 * Verifica indipendente dei pagamenti Stripe LIVE.
 * Le risposte Stripe sono simulate: nessuna richiesta reale.
 */

function createPaymentVerifier() {
  const env = {
    STRIPE_LIVE_SECRET_KEY: 'sk_live_chiave_fittizia_solo_test'
  };

  const worker = new StripeLiveFulfillment(
    { storage: {} },
    env
  );

  const order = {
    id: 'ordine_live_0001',
    mode: 'live',
    sessionId: 'cs_live_sessione123'
  };

  const session = {
    id: order.sessionId,
    livemode: true,
    mode: 'payment',
    payment_status: 'paid',
    amount_total: 1990,
    currency: 'eur',
    client_reference_id: order.id,
    metadata: {
      request_id: order.id
    }
  };

  return { worker, order, session };
}

async function withMockStripe(session, callback, status = 200) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    assert.ok(
      String(url).startsWith(
        'https://api.stripe.com/v1/checkout/sessions/'
      )
    );

    assert.equal(options.method, 'GET');

    return new Response(JSON.stringify(session), {
      status,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('verifica direttamente una sessione LIVE pagata', async () => {
  const { worker, order, session } = createPaymentVerifier();

  await withMockStripe(session, async () => {
    const result = await worker.verifyLivePayment(order);

    assert.equal(result.id, order.sessionId);
    assert.equal(result.payment_status, 'paid');
    assert.equal(result.amount_total, 1990);
  });
});

test('rifiuta una sessione Stripe TEST', async () => {
  const { worker, order, session } = createPaymentVerifier();
  session.livemode = false;

  await withMockStripe(session, async () => {
    await assert.rejects(
      worker.verifyLivePayment(order),
      /Pagamento LIVE non verificato/
    );
  });
});

test('rifiuta un pagamento non confermato', async () => {
  const { worker, order, session } = createPaymentVerifier();
  session.payment_status = 'unpaid';

  await withMockStripe(session, async () => {
    await assert.rejects(
      worker.verifyLivePayment(order),
      /Pagamento LIVE non verificato/
    );
  });
});

test('rifiuta un importo diverso da 19,90 euro', async () => {
  const { worker, order, session } = createPaymentVerifier();
  session.amount_total = 1500;

  await withMockStripe(session, async () => {
    await assert.rejects(
      worker.verifyLivePayment(order),
      /Pagamento LIVE non verificato/
    );
  });
});

test('rifiuta una valuta diversa da EUR', async () => {
  const { worker, order, session } = createPaymentVerifier();
  session.currency = 'usd';

  await withMockStripe(session, async () => {
    await assert.rejects(
      worker.verifyLivePayment(order),
      /Pagamento LIVE non verificato/
    );
  });
});

test('rifiuta un ordine Stripe discordante', async () => {
  const { worker, order, session } = createPaymentVerifier();
  session.metadata.request_id = 'ordine_live_9999';

  await withMockStripe(session, async () => {
    await assert.rejects(
      worker.verifyLivePayment(order),
      /Pagamento LIVE non verificato/
    );
  });
});

test('rifiuta errori restituiti dalle API Stripe', async () => {
  const { worker, order, session } = createPaymentVerifier();

  await withMockStripe(session, async () => {
    await assert.rejects(
      worker.verifyLivePayment(order),
      /Verifica Stripe non disponibile/
    );
  }, 503);
});

test('rifiuta una credenziale Stripe TEST', async () => {
  const { worker, order } = createPaymentVerifier();
  worker.env.STRIPE_LIVE_SECRET_KEY = 'sk_test_chiave_fittizia';

  await assert.rejects(
    worker.verifyLivePayment(order),
    /Credenziale Stripe LIVE non configurata/
  );
});
