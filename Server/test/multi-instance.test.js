// Two "server instances" (two independent copies of collaboration.js) sharing one
// database: checks cross-server sync, safe concurrent saves and room cleanup.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const Y = require('yjs');
const { createFakeCode, freshCollaboration, sleep } = require('./helpers');

const textOf = (doc, name = 'main.js') => doc.getMap('files').get(name).toString();
const savedDoc = (Code) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Code.store.get('r1').yjsState);
  return doc;
};

describe('multiple server instances sharing one database', () => {
  let Code, A, B, docA, docB;

  before(async () => {
    Code = createFakeCode();
    await Code.create({ roomId: 'r1', creator: 'owner@x.com', files: [{ name: 'main.js', code: '' }] });
    A = freshCollaboration(Code);
    B = freshCollaboration(Code);
    // Wire the instances together the way server.js does through Redis.
    A.setPeerStateFetcher(async (id) => { const d = B.getLoadedDoc(id); return d ? [Y.encodeStateAsUpdate(d)] : []; });
    B.setPeerStateFetcher(async (id) => { const d = A.getLoadedDoc(id); return d ? [Y.encodeStateAsUpdate(d)] : []; });
  });

  it('loads two independent module instances', () => {
    assert.notEqual(A, B);
  });

  it('cold load on B merges A\'s unsaved edits', async () => {
    docA = await A.loadRoomDoc('r1');
    docA.getMap('files').get('main.js').insert(0, 'hello');
    docB = await B.loadRoomDoc('r1');
    assert.equal(textOf(docB), 'hello');
  });

  it('applies a live update forwarded from another server', async () => {
    let update;
    docA.once('update', (u) => { update = u; });
    docA.getMap('files').get('main.js').insert(5, ' world');
    B.applyPeerUpdate('r1', update);
    await sleep(20);
    assert.equal(textOf(docB), 'hello world');
  });

  it('ignores peer updates for rooms this server does not have open', async () => {
    B.applyPeerUpdate('not-open', Y.encodeStateAsUpdate(docA));
    await sleep(20);
    assert.equal(B.getLoadedDoc('not-open'), null);
  });

  it('keeps both servers\' edits when they save concurrently', async () => {
    // Simulate a lost pub/sub message: each server has an edit the other lacks.
    docA.getMap('files').get('main.js').insert(0, 'A:');
    const textB = docB.getMap('files').get('main.js');
    textB.insert(textB.length, ':B');
    await Promise.all([A.flushRoom('r1', docA), B.flushRoom('r1', docB)]);
    assert.equal(textOf(savedDoc(Code)), 'A:hello world:B');
  });

  it('increments the version on every save', () => {
    assert.equal(Code.store.get('r1').yjsVersion, 2);
  });

  it('keeps the readable files projection in sync with the saved state', () => {
    assert.equal(Code.store.get('r1').files[0].code, textOf(savedDoc(Code)));
  });

  it('retries and merges when another writer saves between read and write', async () => {
    let raced = false;
    Code.hooks.beforeUpdate = async (filter) => {
      if (raced || !('yjsVersion' in filter)) return;
      raced = true;
      const room = Code.store.get('r1');
      const other = new Y.Doc();
      Y.applyUpdate(other, room.yjsState);
      other.getMap('files').set('other.js', new Y.Text('from another server'));
      room.yjsState = Buffer.from(Y.encodeStateAsUpdate(other));
      room.yjsVersion += 1;
    };
    docA.getMap('files').get('main.js').insert(0, '!');
    await A.flushRoom('r1', docA);
    Code.hooks.beforeUpdate = null;

    const saved = savedDoc(Code);
    assert.ok(raced, 'the conflicting write was injected');
    assert.ok(saved.getMap('files').has('other.js'), 'the other writer\'s file is kept');
    assert.ok(textOf(saved).startsWith('!'), 'this server\'s edit is kept');
  });

  it('does not unload a room while local users remain', async () => {
    await A.evictRoomIfIdle('r1', () => true);
    assert.notEqual(A.getLoadedDoc('r1'), null);
  });

  it('unloads a room once its last local user leaves', async () => {
    await A.evictRoomIfIdle('r1', () => false);
    assert.equal(A.getLoadedDoc('r1'), null);
  });

  it('reloads the latest saved state after unloading', async () => {
    const reloaded = await A.loadRoomDoc('r1');
    assert.ok(reloaded.getMap('files').has('other.js'));
    assert.ok(textOf(reloaded).startsWith('!'));
  });

  it('two servers migrating the same legacy room at once do not lose edits', async () => {
    const LegacyCode = createFakeCode();
    await LegacyCode.create({ roomId: 'legacy', creator: 'o@x.com', files: [{ name: 'main.js', code: 'old' }] });
    const C = freshCollaboration(LegacyCode);
    const D = freshCollaboration(LegacyCode);
    // No peer wiring: both convert the old `files` array to Yjs independently.
    const docC = await C.loadRoomDoc('legacy');
    const docD = await D.loadRoomDoc('legacy');
    docC.getMap('files').get('main.js').insert(0, 'C');
    Y.applyUpdate(docD, Y.encodeStateAsUpdate(docC));
    assert.equal(textOf(docD), 'Cold');
  });
});
