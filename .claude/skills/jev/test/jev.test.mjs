import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { ask, askBatched, hasKey } from '../bin/lib/jev.mjs';
import { env, mockApi } from './helpers.mjs';

let api;
const use = async (behave) => {
  await api?.close();
  api = await mockApi(behave);
  Object.assign(process.env, env(api.url));
};
beforeEach(() => {
  delete process.env.TYPESAFE_API_KEY;
  process.env.JEV_ENV_FILE = '/nonexistent/jev.env';
});
after(() => api?.close());

const Q = { q: { type: 'noul', instructions: 'Is this good news?' } };

test('no key: null without a request', async () => {
  await use();
  delete process.env.TYPESAFE_API_KEY;
  assert.equal(hasKey(), false);
  assert.equal(await ask('x', Q), null);
  assert.equal(api.requests.length, 0);
});

test('answers, with the contract the API documents', async () => {
  await use(() => ({ noul: () => 0.9 }));
  const res = await ask({ a: 1 }, Q);
  assert.equal(res.answers.q.noul, 0.9);
  assert.equal(api.requests[0].auth, 'Bearer test-key');
  assert.deepEqual(Object.keys(api.requests[0].body).sort(), ['model', 'questions', 'state']);
  assert.equal(api.requests[0].body.model, 'jev-latest');
});

test('one retry on 429 and 529, then gives up', async () => {
  await use((_, n) => (n === 1 ? { status: 429 } : { noul: () => 0.7 }));
  assert.equal((await ask('x', Q)).answers.q.noul, 0.7);
  await use(() => ({ status: 529 }));
  assert.equal(await ask('x', Q), null);
  assert.equal(api.requests.length, 2);
});

test('500, malformed body and a hanging server all return null', async () => {
  await use(() => ({ status: 500 }));
  assert.equal(await ask('x', Q), null);
  await use(() => ({ raw: '{"answers": {"q": ' }));
  assert.equal(await ask('x', Q), null);
  await use(() => ({ raw: '{"model": "jev"}' }));
  assert.equal(await ask('x', Q), null);
  await use(() => 'hang');
  const started = Date.now();
  assert.equal(await ask('x', Q, { timeoutMs: 300 }), null);
  assert.ok(Date.now() - started < 1500);
});

test('askBatched splits, merges and survives a failed batch', async () => {
  await use((body, n) => (n === 2 ? { status: 500 } : { noul: () => 0.6 }));
  const qs = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`c${i}`, { type: 'noul', instructions: 'x' }]));
  const res = await askBatched('s', qs, { size: 2 });
  assert.equal(res.requests, 3);
  assert.equal(res.failed, 1);
  assert.equal(Object.keys(res.answers).length, 3);
});
