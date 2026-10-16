// End-to-end tests of the real server.js over HTTP and Socket.IO, with MongoDB,
// Redis and the BullMQ queue replaced by in-memory fakes.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('path');
const { SERVER_DIR, createFakeCode, installModule, installPackage, sleep } = require('./helpers');

// Set before server.js loads; dotenv never overrides variables that already exist.
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '0';                  // any free port
process.env.REDIS_URL = 'redis://unused';
process.env.RUN_WORKER_IN_API = 'false'; // never start a real BullMQ worker
delete process.env.DNS_SERVERS;

const Code = createFakeCode();
installModule('models/Code.js', Code);

const runs = [];
const rateCounts = new Map();
installModule('redis.js', {
  redis: {},
  createRedis: () => ({ duplicate() { return this; } }),
  isRateLimited: async (key, limit) => {
    const count = (rateCounts.get(key) || 0) + 1;
    rateCounts.set(key, count);
    return count > limit;
  },
});
installModule('codeRunQueue.js', {
  CODE_RUN_QUEUE: 'code-runs',
  runCode: async ({ code }) => { runs.push(code); return [`ran ${code}`]; },
});

// Single-process stand-in for the Redis adapter (no other servers to talk to).
const { Adapter } = require(require.resolve('socket.io-adapter', { paths: [SERVER_DIR] }));
class SingleNodeAdapter extends Adapter {
  serverSideEmit(packet) {
    const ack = packet.at(-1);
    if (typeof ack === 'function') ack(null, []);
  }
}
installPackage('@socket.io/redis-adapter', { createAdapter: () => SingleNodeAdapter });

const mongoose = require('mongoose');
mongoose.connect = async () => {};

const jwt = require('jsonwebtoken');
const Y = require('yjs');
const { io: connectClient } = require('socket.io-client');

const OWNER = 'owner@x.com';
const GUEST = 'guest@x.com';
const STRANGER = 'stranger@x.com';
const tokenFor = (email) => jwt.sign({ email, name: email.split('@')[0], picture: '' }, 'test-secret');
const textOf = (doc) => doc.getMap('files').get('main.js')?.toString();

describe('server (HTTP + Socket.IO)', () => {
  let app, url, collab;
  const clients = [];

  const api = (route, email, body) => fetch(`${url}/api/room${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(email && { authorization: `Bearer ${tokenFor(email)}` }) },
    body: body && JSON.stringify(body),
  });

  // A socket.io client that records every event it receives.
  function connect(email) {
    const socket = connectClient(url, { auth: email ? { token: tokenFor(email) } : {}, forceNew: true, reconnection: false });
    const events = [];
    socket.onAny((name, payload) => events.push({ name, payload }));
    const client = {
      socket,
      events,
      async wait(name, ms = 2000) {
        const start = Date.now();
        while (Date.now() - start < ms) {
          const event = events.find((e) => e.name === name);
          if (event) return event.payload ?? true;
          await sleep(20);
        }
        return null;
      },
    };
    clients.push(client);
    return client;
  }

  // A client-side Y.Doc wired the same way as frontend/src/components/Editor.js,
  // including sync step 2 (send back whatever the server is missing).
  function attachDoc(client, roomId, doc = new Y.Doc()) {
    const remote = {};
    client.socket.on('YJS_UPDATE', ({ update }) => Y.applyUpdate(doc, new Uint8Array(update), remote));
    client.socket.on('YJS_SYNC', ({ update, stateVector }) => {
      Y.applyUpdate(doc, new Uint8Array(update), remote);
      const missing = Y.encodeStateAsUpdate(doc, new Uint8Array(stateVector));
      if (missing.length > 2) client.socket.emit('YJS_UPDATE', { roomId, update: missing });
    });
    doc.on('update', (update, origin) => {
      if (origin !== remote) client.socket.emit('YJS_UPDATE', { roomId, update });
    });
    return doc;
  }

  before(async () => {
    app = require(path.join(SERVER_DIR, 'server.js'));
    if (!app.server.listening) await once(app.server, 'listening');
    url = `http://localhost:${app.server.address().port}`;
    collab = require(path.join(SERVER_DIR, 'collaboration.js'));
  });

  after(async () => {
    clients.forEach((c) => c.socket.close());
    await sleep(900); // let debounced saves finish
    await new Promise((resolve) => app.io.close(resolve));
  });

  describe('room REST API', () => {
    it('rejects room creation without a login token', async () => {
      assert.equal((await api('/create', null, { roomId: 'r1', password: 'pw' })).status, 401);
    });

    it('creates a room for a signed-in user', async () => {
      assert.equal((await api('/create', OWNER, { roomId: 'r1', password: 'pw', creator: 'spoof@x.com' })).status, 200);
    });

    it('takes the creator from the JWT, not the request body', () => {
      assert.equal(Code.store.get('r1').creator, OWNER);
    });

    it('stores the room password as a bcrypt hash', () => {
      const { password } = Code.store.get('r1');
      assert.ok(password.startsWith('$2'));
      assert.notEqual(password, 'pw');
    });

    it('rejects a wrong password', async () => {
      assert.equal((await api('/join', GUEST, { roomId: 'r1', password: 'nope' })).status, 401);
    });

    it('accepts the right password', async () => {
      assert.equal((await api('/join', GUEST, { roomId: 'r1', password: 'pw' })).status, 200);
    });

    it('adds a user who joined to the room members', () => {
      assert.ok(Code.store.get('r1').members.includes(GUEST));
    });

    it('hides checkpoints from non-members', async () => {
      assert.equal((await api('/r1/checkpoints', STRANGER)).status, 403);
    });

    it('shows checkpoints to members', async () => {
      assert.equal((await api('/r1/checkpoints', GUEST)).status, 200);
    });

    it('still accepts an old plain-text room password', async () => {
      await Code.create({ roomId: 'legacy', creator: OWNER, password: 'plain', files: [{ name: 'main.js', code: 'old' }] });
      assert.equal((await api('/join', GUEST, { roomId: 'legacy', password: 'plain' })).status, 200);
    });

    it('upgrades an old plain-text password to a hash on join', () => {
      assert.ok(Code.store.get('legacy').password.startsWith('$2'));
    });

    it('rate-limits password guessing (11th attempt in a minute)', async () => {
      rateCounts.clear();
      let last;
      for (let i = 0; i < 11; i += 1) last = await api('/join', STRANGER, { roomId: 'r1', password: `guess${i}` });
      assert.equal(last.status, 429);
    });
  });

  describe('socket authentication and membership', () => {
    it('rejects a socket without a JWT', async () => {
      const anon = connect(null);
      const [err] = await once(anon.socket, 'connect_error');
      assert.equal(err.message, 'UNAUTHORIZED');
    });

    it('rejects JOIN from a signed-in user who is not a member', async () => {
      const stranger = connect(STRANGER);
      stranger.socket.emit('JOIN', { roomId: 'r1', username: 'mallory' });
      assert.ok(await stranger.wait('JOIN_ERROR'));
    });
  });

  describe('collaborative editing', () => {
    let owner, guest, ownerDoc, guestDoc;

    it('sends a member the room state with a state vector on JOIN', async () => {
      owner = connect(OWNER);
      ownerDoc = attachDoc(owner, 'r1');
      owner.socket.emit('JOIN', { roomId: 'r1', username: 'Olivia' });
      const sync = await owner.wait('YJS_SYNC');
      assert.ok(sync?.stateVector);
    });

    it('recovers edits made while offline through sync step 2', async () => {
      guest = connect(GUEST);
      guestDoc = new Y.Doc();
      Y.applyUpdate(guestDoc, Y.encodeStateAsUpdate(ownerDoc));
      guestDoc.getMap('files').get('main.js').insert(0, 'offline-edit;'); // typed before (re)connecting
      attachDoc(guest, 'r1', guestDoc);
      guest.socket.emit('JOIN', { roomId: 'r1', username: 'Gus' });
      await guest.wait('YJS_SYNC');
      await sleep(200);
      assert.ok(textOf(ownerDoc).includes('offline-edit;'));
    });

    it('lists both users with emails from their JWTs', () => {
      const joined = owner.events.filter((e) => e.name === 'JOINED').at(-1)?.payload;
      assert.equal(joined.clients.length, 2);
      assert.ok(joined.clients.some((c) => c.email === GUEST));
    });

    it('converges when two users type at the same time', async () => {
      ownerDoc.getMap('files').get('main.js').insert(0, 'O');
      guestDoc.getMap('files').get('main.js').insert(0, 'G');
      await sleep(300);
      assert.equal(textOf(ownerDoc), textOf(guestDoc));
    });

    it('saves the converged state to the database after the debounce', async () => {
      await sleep(900);
      const saved = new Y.Doc();
      Y.applyUpdate(saved, Code.store.get('r1').yjsState);
      assert.equal(textOf(saved), textOf(ownerDoc));
    });

    it('sets the chat username on the server, ignoring the client value', async () => {
      guest.socket.emit('CHAT_MESSAGE', { roomId: 'r1', username: 'FakeOwner', message: 'hi' });
      const chat = await owner.wait('CHAT_MESSAGE');
      assert.equal(chat.username, 'Gus');
    });

    it('drops chat messages from non-members', async () => {
      const stranger = connect(STRANGER);
      stranger.socket.emit('CHAT_MESSAGE', { roomId: 'r1', message: 'spam' });
      await sleep(200);
      assert.ok(!owner.events.some((e) => e.name === 'CHAT_MESSAGE' && e.payload.message === 'spam'));
    });

    it('stops a guest deleting files, even when spoofing the owner as requester', async () => {
      guest.socket.emit('DELETE_FILE', { roomId: 'r1', fileName: 'main.js', requester: OWNER });
      assert.equal((await guest.wait('ERROR'))?.message, 'Only the owner can delete files.');
    });

    it('stops a guest kicking other users', async () => {
      guest.events.length = 0;
      guest.socket.emit('KICK_USER', { roomId: 'r1', socketId: owner.socket.id });
      assert.equal((await guest.wait('ERROR'))?.message, 'Only the owner can remove users.');
    });

    it('runs code through the job queue', async () => {
      guest.socket.emit('RUN_CODE', { roomId: 'r1', code: 'print(1)', languageId: 71 });
      assert.equal((await guest.wait('CODE_OUTPUT'))?.output[0], 'ran print(1)');
    });

    it('refuses to run code for non-members', async () => {
      const stranger = connect(STRANGER);
      stranger.socket.emit('RUN_CODE', { roomId: 'r1', code: 'x' });
      await sleep(200);
      assert.ok(!runs.includes('x'));
    });

    it('rate-limits code runs (11th run in a minute)', async () => {
      rateCounts.clear();
      for (let i = 0; i < 10; i += 1) rateCounts.set(`ratelimit:run:${GUEST}`, i + 1);
      guest.events.length = 0;
      guest.socket.emit('RUN_CODE', { roomId: 'r1', code: 'one too many' });
      const output = await guest.wait('CODE_OUTPUT');
      assert.match(output.output[0], /Too many runs/);
    });

    it('lets the owner kick a user', async () => {
      owner.socket.emit('KICK_USER', { roomId: 'r1', socketId: guest.socket.id });
      assert.ok(await guest.wait('KICKED'));
    });

    it('removes a kicked user from the room members', async () => {
      await sleep(100);
      assert.ok(!Code.store.get('r1').members.includes(GUEST));
    });

    it('keeps the room in memory while a user is connected', () => {
      assert.notEqual(collab.getLoadedDoc('r1'), null);
    });

    it('frees the room from memory after the last user leaves', async () => {
      owner.socket.disconnect();
      await sleep(300);
      assert.equal(collab.getLoadedDoc('r1'), null);
    });
  });
});
