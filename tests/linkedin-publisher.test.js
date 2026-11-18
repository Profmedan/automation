// Aucun appel réseau ni lecture des identifiants réels : on vérifie les requêtes du parcours complet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const override of [undefined, '202609']) {
  test(`publication vidéo : version ${override || '202610 par défaut'} sur tous les appels REST`, async () => {
    const rest = [];
    let uploaded = false;
    const http = {
      get: async () => ({ data: { sub: 'test-person' } }),
      put: async () => { uploaded = true; return { headers: { etag: 'test-part' } }; },
      post: async (url, body, options) => {
        if (url.includes('/rest/')) {
          rest.push(url);
          assert.equal(options.headers['LinkedIn-Version'], override || '202610');
        }
        if (url.includes('initializeUpload')) return { data: { value: { video: 'urn:li:video:test', uploadInstructions: [{ firstByte: 0, lastByte: 3, uploadUrl: 'https://upload.test/video' }] } } };
        if (url.includes('finalizeUpload')) { assert.ok(uploaded); return {}; }
        if (url.endsWith('/rest/posts')) return { headers: { 'x-restli-id': 'urn:li:share:123' }, data: {} };
        if (url.endsWith('/rest/comments')) return {};
        // Exerce aussi les chemins de secours du commentaire.
        throw Object.assign(new Error('Comment endpoint unavailable'), { response: { status: 403 } });
      }
    };
    const fakeFs = { promises: { readFile: async file => file.endsWith('linkedin-token.json')
      ? JSON.stringify({ access_token: 'fake-token', created_at: Date.now(), expires_in: 3600 }) : Buffer.from('test') },
      statSync: () => ({ size: 4 }) };
    const context = { module: { exports: {} }, __dirname: path.resolve(__dirname, '../scripts'),
      process: { env: override ? { LINKEDIN_API_VERSION: override } : {}, argv: [] },
      console: { log() {}, error() {} }, setTimeout: callback => callback(),
      require: name => {
        if (name === 'axios') return http;
        if (name === 'fs') return fakeFs;
        if (name === 'dotenv') return { config() {} };
        if (name === 'path') return path;
        throw Error(`Dépendance inattendue : ${name}`);
      } };
    const filename = path.resolve(__dirname, '../scripts/linkedin-publisher.js');
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
    const result = await context.module.exports.publishToLinkedIn('/fake/video.mp4', { caption: 'Vidéo approuvée', hashtags: ['#IA'], blogUrl: 'https://example.com/article' });
    assert.equal(result.postId, 'urn:li:share:123');
    assert.equal(rest.length, 5, 'initialisation, finalisation, post et deux chemins REST du commentaire');
  });
}
