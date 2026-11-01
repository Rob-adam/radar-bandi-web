
import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/dashboard-wrapper.js';
import { accessHash } from '../src/client-access.js';
test('aggiornamento amministrativo conserva pagamento Stripe e accesso privato', async () => {
const TEST_TOKEN = 'token-privato-di-prova';
const TEST_HASH = await accessHash(TEST_TOKEN);
  const code = 'RB-9876543';
  const payment = {
    provider: 'stripe',
    mode: 'live',
    orderId: 'ordine-fittizio-001',
    sessionId: 'cs_live_simulata_001',
    amount: 1990,
    currency: 'eur'
  };

  const original = {
    license: code,
    name: 'Associazione di prova',
    active: true,
    price: 19.90,
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
    expiresAt: '2027-11-01T09:00:00.000Z',
    accessToken: TEST_TOKEN,
    accessTokenHash: TEST_HASH,
    payment,
    profile: {
      license: code,
      name: 'Associazione di prova',
      type: 'APS',
      region: 'Lombardia'
    }
  };

  const records = new Map([
    ['license:' + code, structuredClone(original)]
  ]);

  const env = {
    ADMIN_API_KEY: 'chiave-amministratore-solo-per-test',
    LICENSES: {
      get: async key => structuredClone(records.get(key) ?? null),
      put: async (key, value) => {
        records.set(key, JSON.parse(value));
      }
    }
  };

  const response = await app.fetch(
    new Request('https://test.local/api/admin/license', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + env.ADMIN_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        license: code,
        name: 'Associazione aggiornata',
        active: true,
        expiresAt: '2027-12-01T09:00:00.000Z',
        payment: {
          provider: 'fake',
          amount: 0
        },
        createdAt: '2000-01-01T00:00:00.000Z'
      })
    }),
    env
  );

  assert.equal(response.status, 200);

  const updated = records.get('license:' + code);

  assert.equal(updated.name, 'Associazione aggiornata');
  assert.equal(updated.expiresAt, '2027-12-01T09:00:00.000Z');
  assert.deepEqual(updated.payment, payment);
  assert.equal(updated.createdAt, original.createdAt);
  assert.equal(updated.accessToken, original.accessToken);
  assert.equal(updated.accessTokenHash, original.accessTokenHash);
});
