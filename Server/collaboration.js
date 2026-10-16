const Y = require('yjs');
const Code = require('./models/Code');

const FILES_KEY = 'files';
const roomDocs = new Map();
const roomLoads = new Map();
const persistTimers = new Map();
const roomQueues = new Map();

// Set by server.js: asks the other server instances for their copy of a room.
let fetchPeerStates = async () => [];
function setPeerStateFetcher(fn) {
  fetchPeerStates = fn;
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Uint8Array.from(value.data);
  }
  if (Array.isArray(value)) return Uint8Array.from(value);
  return new Uint8Array(value || []);
}

function getFiles(doc) {
  const files = doc.getMap(FILES_KEY);
  return Array.from(files.entries())
    .filter(([, text]) => text instanceof Y.Text)
    .map(([name, text]) => ({ name, code: text.toString() }));
}

async function loadRoomDoc(roomId) {
  if (roomDocs.has(roomId)) return roomDocs.get(roomId);
  if (roomLoads.has(roomId)) return roomLoads.get(roomId);

  const load = (async () => {
    const room = await Code.findOne({ roomId });
    if (!room) return null;

    const doc = new Y.Doc();
    if (room.yjsState?.length) {
      Y.applyUpdate(doc, toUint8Array(room.yjsState));
    } else {
      // One-time lazy migration for rooms created before Yjs was introduced.
      // A fixed clientID makes every server build byte-identical CRDT items, so
      // two servers migrating the same room at once merge instead of each
      // creating its own competing `main.js` (where only one would survive).
      const seed = new Y.Doc();
      seed.clientID = 0;
      const files = seed.getMap(FILES_KEY);
      const legacyFiles = room.files?.length ? room.files : [{ name: 'main.js', code: '' }];
      legacyFiles.forEach(({ name, code }) => files.set(name, new Y.Text(code || '')));
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
      seed.destroy();
    }

    // MongoDB can be up to one debounce (750ms) behind a server that already has
    // this room open. Merging that server's live state closes the gap; CRDT
    // merges are idempotent, so overlapping state is harmless.
    const peerStates = await fetchPeerStates(roomId);
    peerStates.forEach((state) => state && Y.applyUpdate(doc, state));

    roomDocs.set(roomId, doc);
    return doc;
  })();

  roomLoads.set(roomId, load);
  try {
    return await load;
  } finally {
    roomLoads.delete(roomId);
  }
}

function getLoadedDoc(roomId) {
  return roomDocs.get(roomId) || null;
}

function queueRoomWork(roomId, work) {
  const previous = roomQueues.get(roomId) || Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  roomQueues.set(roomId, next);
  next.finally(() => {
    if (roomQueues.get(roomId) === next) roomQueues.delete(roomId);
  }).catch(() => {});
  return next;
}

// An update made on another server instance. Only rooms open here need it:
// a room that is not open will read the latest state when it is next loaded.
function applyPeerUpdate(roomId, update) {
  if (!roomDocs.has(roomId) && !roomLoads.has(roomId)) return;
  queueRoomWork(roomId, async () => {
    const doc = await loadRoomDoc(roomId);
    if (doc) Y.applyUpdate(doc, update);
  }).catch((err) => console.error('Peer Yjs update error:', err));
}

async function persistRoom(roomId, doc) {
  persistTimers.delete(roomId);
  const localState = Y.encodeStateAsUpdate(doc);

  // Optimistic concurrency: read the saved state + version, merge, and write
  // only if nobody saved in between. If another server won the race, retry.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const room = await Code.findOne({ roomId }, { yjsState: 1, yjsVersion: 1 });
    if (!room) return;

    // The saved state may contain edits from another server that this one has
    // not received yet. Merging keeps both sides instead of overwriting.
    const merged = room.yjsState?.length
      ? Y.mergeUpdates([toUint8Array(room.yjsState), localState])
      : localState;
    const snapshot = new Y.Doc();
    Y.applyUpdate(snapshot, merged);

    const result = await Code.updateOne(
      { roomId, yjsVersion: room.yjsVersion ?? null },
      {
        $set: {
          yjsState: Buffer.from(merged),
          yjsUpdatedAt: new Date(),
          yjsVersion: (room.yjsVersion || 0) + 1,
          // Keeps old REST/checkpoint tooling compatible while Yjs is canonical.
          files: getFiles(snapshot),
        },
      },
    );
    snapshot.destroy();
    if (result.matchedCount === 1) return;
  }
  throw new Error(`Could not save room ${roomId}: too many concurrent saves`);
}

function schedulePersist(roomId, doc) {
  clearTimeout(persistTimers.get(roomId));
  persistTimers.set(roomId, setTimeout(() => {
    queueRoomWork(roomId, () => persistRoom(roomId, doc)).catch((error) => {
      console.error(`Failed to persist Yjs room ${roomId}:`, error);
    });
  }, 750));
}

async function flushRoom(roomId, doc) {
  clearTimeout(persistTimers.get(roomId));
  await persistRoom(roomId, doc);
}

// Called when the last user on this server leaves a room. Saves the room and
// frees its Y.Doc, so memory grows with active rooms, not with every room ever opened.
function evictRoomIfIdle(roomId, hasLocalClients) {
  return queueRoomWork(roomId, async () => {
    const doc = roomDocs.get(roomId);
    if (!doc || hasLocalClients()) return;
    await flushRoom(roomId, doc);
    if (hasLocalClients()) return; // someone joined while we were saving
    roomDocs.delete(roomId);
    doc.destroy();
  });
}

module.exports = {
  Y,
  FILES_KEY,
  toUint8Array,
  getFiles,
  loadRoomDoc,
  getLoadedDoc,
  queueRoomWork,
  applyPeerUpdate,
  setPeerStateFetcher,
  schedulePersist,
  flushRoom,
  evictRoomIfIdle,
};
