const Y = require('yjs');
const Code = require('./models/Code');

const FILES_KEY = 'files';
const roomDocs = new Map();
const roomLoads = new Map();
const persistTimers = new Map();
const roomQueues = new Map();

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
      const files = doc.getMap(FILES_KEY);
      const legacyFiles = room.files?.length ? room.files : [{ name: 'main.js', code: '' }];
      legacyFiles.forEach(({ name, code }) => files.set(name, new Y.Text(code || '')));
    }

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

function queueRoomWork(roomId, work) {
  const previous = roomQueues.get(roomId) || Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  roomQueues.set(roomId, next);
  next.finally(() => {
    if (roomQueues.get(roomId) === next) roomQueues.delete(roomId);
  }).catch(() => {});
  return next;
}

async function persistRoom(roomId, doc) {
  persistTimers.delete(roomId);
  await Code.updateOne(
    { roomId },
    {
      $set: {
        yjsState: Buffer.from(Y.encodeStateAsUpdate(doc)),
        yjsUpdatedAt: new Date(),
        // Keeps old REST/checkpoint tooling compatible while Yjs is canonical.
        files: getFiles(doc),
      },
    },
  );
}

function schedulePersist(roomId, doc) {
  clearTimeout(persistTimers.get(roomId));
  persistTimers.set(roomId, setTimeout(() => {
    persistRoom(roomId, doc).catch((error) => {
      console.error(`Failed to persist Yjs room ${roomId}:`, error);
    });
  }, 750));
}

async function flushRoom(roomId, doc) {
  clearTimeout(persistTimers.get(roomId));
  await persistRoom(roomId, doc);
}

module.exports = {
  Y,
  FILES_KEY,
  toUint8Array,
  getFiles,
  loadRoomDoc,
  queueRoomWork,
  schedulePersist,
  flushRoom,
};
