
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLivePaidCheckout } from '../src/stripe-live-verification.js';

function validEvent() {
  return {
    id: 'evt_live123456',
    type: 'checkout.session.completed',
    livemode: true,
    data: {
      object: {
        object: 'checkout.session',
        id: 'cs_live_example123',
        livemode: true,
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 1990,
        currency: 'eur',
        client_reference_id: 'ordine_live_0001',
        metadata: {
          request_id: 'ordine_live_0001'
        }
      }
    }
  };
}

test('riconosce una sessione LIVE valida', () => {
  const result = classifyLivePaidCheckout(validEvent());

  assert.deepEqual(result, {
    action: 'reconcile',
    eventId: 'evt_live123456',
    orderId: 'ordine_live_0001',
    sessionId: 'cs_live_example123',
    amount: 1990,
    currency: 'eur'
  });
});

test('rifiuta un evento Stripe TEST', () => {
  const event = validEvent();
  event.livemode = false;
  event.data.object.livemode = false;
  event.data.object.id = 'cs_test_example123';

  assert.equal(
    classifyLivePaidCheckout(event).action,
    'reject'
  );
});

test('rifiuta una sessione TEST in evento LIVE', () => {
  const event = validEvent();
  event.data.object.id = 'cs_test_example123';

  assert.equal(
    classifyLivePaidCheckout(event).action,
    'reject'
  );
});

test('non riconcilia un pagamento non confermato', () => {
  const event = validEvent();
  event.data.object.payment_status = 'unpaid';

  assert.equal(
    classifyLivePaidCheckout(event).action,
    'pending'
  );
});

test('rifiuta importi diversi da 19,90 euro', () => {
  const event = validEvent();
  event.data.object.amount_total = 1500;

  assert.equal(
    classifyLivePaidCheckout(event).action,
    'reject'
  );
});

test('rifiuta valute diverse da EUR', () => {
  const event = validEvent();
  event.data.object.currency = 'usd';

  assert.equal(
    classifyLivePaidCheckout(event).action,
    'reject'
  );
});

test('rifiuta riferimenti ordine discordanti', () => {
  const event = validEvent();
  event.data.object.metadata.request_id = 'ordine_live_9999';

  assert.equal(
    classifyLivePaidCheckout(event).action,
    'reject'
  );
});

test('rifiuta ordini senza riferimento', () => {
  const event = validEvent();
  event.data.object.client_reference_id = null;

  assert.equal(
    classifyLivePaidCheckout(event).action,
    'reject'
  );
});

test('ignora eventi non pertinenti', () => {
  const event = validEvent();
  event.type = 'customer.created';

  assert.equal(
    classifyLivePaidCheckout(event).action,
    'ignore'
  );
});

test('riconosce pagamenti asincroni confermati', () => {
  const event = validEvent();
  event.type = 'checkout.session.async_payment_succeeded';

  assert.equal(
    classifyLivePaidCheckout(event).action,
    'reconcile'
  );
});

test('rifiuta identificativi evento non validi', () => {
  const event = validEvent();
  event.id = 'evento_non_valido';

  assert.equal(
    classifyLivePaidCheckout(event).action,
    'reject'
  );
});

test('non modifica i dati originali', () => {
  const event = validEvent();
  const original = structuredClone(event);

  classifyLivePaidCheckout(event);

  assert.deepEqual(event, original);
});
