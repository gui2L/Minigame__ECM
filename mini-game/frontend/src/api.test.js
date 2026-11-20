import assert from 'node:assert/strict';
import test from 'node:test';
import {createApi, jsonBody} from './api.js';

test('204 does not try to parse an empty body', async () => {
  const api = createApi('http://localhost:5001/', async (url, options) => {
    assert.equal(url, 'http://localhost:5001/tasks/7');
    assert.equal(options.method, 'DELETE');
    return new Response(null, {status: 204});
  });
  assert.equal(await api('/tasks/7', {method: 'DELETE'}), null);
});

test('a failed delete is rejected instead of treated as success', async () => {
  const api = createApi('http://localhost:5001', async () => new Response('', {status: 500}));
  await assert.rejects(api('/tasks/7', {method: 'DELETE'}), /500/);
});

test('PATCH sends a boolean in a JSON body', () => {
  const options = jsonBody('PATCH', {done: false});
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(options.body).done, false);
});

test('network failures explain the next diagnostic step', async () => {
  const api = createApi('http://localhost:5001', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api('/tasks/'), /backend.*URL.*CORS/);
});
