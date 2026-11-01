
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
