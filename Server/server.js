require('dotenv').config({ path: __dirname + '/.env' });
// Optional, for local machines whose DNS cannot resolve SRV records (Node then
// fails `mongodb+srv://` with querySrv ECONNREFUSED). E.g. DNS_SERVERS=8.8.8.8,1.1.1.1
if (process.env.DNS_SERVERS) require('dns').setServers(process.env.DNS_SERVERS.split(','));
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const mongoose = require('mongoose');
const Code = require('./models/Code');
const {
  Y,
  FILES_KEY,
  toUint8Array,
  loadRoomDoc,
  getLoadedDoc,
  queueRoomWork,
  applyPeerUpdate,
  setPeerStateFetcher,
  schedulePersist,
  flushRoom,
  evictRoomIfIdle,
} = require('./collaboration');
const { verifyToken, isMember } = require('./auth');
const { createRedis, isRateLimited } = require('./redis');
const { runCode } = require('./codeRunQueue');
const authRoutes = require('./routes/Auth');
const roomRoutes = require('./routes/room');

const app = express();
const server = http.createServer(app);
const cors = require('cors');
app.use(express.json());

const ALLOWED_ORIGINS = [
  'https://cadence-code.vercel.app',
  'http://localhost:3000'
];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

app.use('/api/auth', authRoutes);
app.use('/api/room', roomRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
});

// The Redis adapter lets several server instances act as one Socket.IO server:
// io.to(room).emit reaches users connected to any instance.
const pubClient = createRedis();
io.adapter(createAdapter(pubClient, pubClient.duplicate(), { requestsTimeout: 3000 }));

// Every socket must present the JWT from Google login. Identity is read from the
// verified token (socket.data.user), never from what the client sends in events.
io.use((socket, next) => {
  try {
    socket.data.user = verifyToken(socket.handshake.auth?.token);
    next();
  } catch {
    next(new Error('UNAUTHORIZED'));
  }
});

// ---- Cross-instance Yjs sync -------------------------------------------------
// Users of one room can be connected to different instances, and each instance
// keeps its own in-memory Y.Doc. Server-side events (sent through Redis) keep
// those copies in sync. Payloads are JSON, so updates travel as base64.
const encode = (update) => Buffer.from(update).toString('base64');
const decode = (text) => new Uint8Array(Buffer.from(text, 'base64'));

function shareWithPeers(roomId, update) {
  io.serverSideEmit('YJS_PEER_UPDATE', roomId, encode(update));
}

io.on('YJS_PEER_UPDATE', (roomId, update) => applyPeerUpdate(roomId, decode(update)));

io.on('YJS_STATE_REQUEST', (roomId, reply) => {
  const doc = getLoadedDoc(roomId);
  reply(doc ? encode(Y.encodeStateAsUpdate(doc)) : null);
});

setPeerStateFetcher((roomId) => new Promise((resolve) => {
  // On timeout the adapter still hands over the replies it did receive.
  io.serverSideEmit('YJS_STATE_REQUEST', roomId, (err, replies = []) => {
    resolve(replies.filter(Boolean).map(decode));
  });
}));

// Broadcasts an update made by this server (new file, delete file) to every user and every instance.
function broadcastDocChange(roomId, doc, change) {
  let update;
  const captureUpdate = (value) => { update = value; };
  doc.on('update', captureUpdate);
  try {
    doc.transact(change);
  } finally {
    doc.off('update', captureUpdate);
  }
  if (!update) return;
  io.in(roomId).emit('YJS_UPDATE', { update });
  shareWithPeers(roomId, update);
}

// Sync step 1 (server -> client): the full state plus the server's state vector,
// so the client can reply with only the edits the server is missing (step 2).
const syncPayload = (doc) => ({
  update: Y.encodeStateAsUpdate(doc),
  stateVector: Y.encodeStateVector(doc),
});

// ---- Room membership -----------------------------------------------------------
// JOIN checks the database before joining, so other events from the same socket
// can arrive while it is still running. They wait for it instead of being dropped.
const pendingJoins = new WeakMap();

async function canUseRoom(socket, roomId) {
  await pendingJoins.get(socket);
  return socket.rooms.has(roomId);
}

// fetchSockets() asks every instance through Redis, so the list includes users
// connected to other servers. User info lives on socket.data for the same reason.
async function getClients(roomId) {
  const sockets = await io.in(roomId).fetchSockets();
  return sockets.map((s) => ({
    socketId: s.id,
    username: s.data.username,
    picture: s.data.user?.picture,
    email: s.data.user?.email,
  }));
}

const isEditorRoom = (socket, room) => room !== socket.id && !room.startsWith('voice:');
const hasLocalClients = (roomId) => () => (io.sockets.adapter.rooms.get(roomId)?.size || 0) > 0;

io.on('connection', (socket) => {
  console.log('🟢 Connected:', socket.id);
  const { email } = socket.data.user;

  socket.on('JOIN', ({ roomId, username }) => {
    const join = (async () => {
      // Knowing a room ID is not enough: the user must have entered the room
      // password (POST /api/room/join adds them to `members`).
      const room = await Code.findOne({ roomId }, { creator: 1, members: 1 });
      if (!room || !isMember(room, email)) {
        return socket.emit('JOIN_ERROR', { message: 'You do not have access to this room.' });
      }

      socket.data.username = String(username || socket.data.user.name || 'Guest').slice(0, 40);
      socket.join(roomId);
      const clients = await getClients(roomId);
      io.in(roomId).emit('JOINED', { clients, username: socket.data.username, socketId: socket.id });

      const doc = await loadRoomDoc(roomId);
      if (doc) socket.emit('YJS_SYNC', syncPayload(doc));
    })().catch((err) => console.error('JOIN error:', err));
    pendingJoins.set(socket, join);
  });

  // A Yjs sync is a CRDT state update, not a whole-file last-write-wins update.
  // Applying the same update twice is safe, which also makes reconnect retries safe.
  socket.on('YJS_SYNC', async ({ roomId }) => {
    if (!(await canUseRoom(socket, roomId))) return;
    try {
      const doc = await loadRoomDoc(roomId);
      if (!doc) return socket.emit('ERROR', { message: 'Room not found.' });
      socket.emit('YJS_SYNC', syncPayload(doc));
    } catch (err) {
      console.error('Yjs sync error:', err);
      socket.emit('ERROR', { message: 'Could not synchronise the editor.' });
    }
  });

  socket.on('YJS_UPDATE', async ({ roomId, update }) => {
    if (!(await canUseRoom(socket, roomId))) return;
    if (!update || toUint8Array(update).byteLength > 1024 * 1024) {
      return socket.emit('ERROR', { message: 'Invalid editor update.' });
    }

    // Per-room ordering prevents persistence and explicit save operations from
    // racing each other. Yjs still merges genuinely concurrent client edits.
    queueRoomWork(roomId, async () => {
      const doc = await loadRoomDoc(roomId);
      if (!doc) return;
      const normalizedUpdate = toUint8Array(update);
      Y.applyUpdate(doc, normalizedUpdate);
      socket.to(roomId).emit('YJS_UPDATE', { update: normalizedUpdate });
      shareWithPeers(roomId, normalizedUpdate);
      schedulePersist(roomId, doc);
    }).catch((err) => console.error('Yjs update error:', err));
  });

  socket.on('NEW_FILE', async ({ roomId, file }) => {
    if (!(await canUseRoom(socket, roomId))) return;
    const name = file?.name?.trim();
    if (!name || name.length > 100) return socket.emit('ERROR', { message: 'Enter a file name of up to 100 characters.' });

    queueRoomWork(roomId, async () => {
      const doc = await loadRoomDoc(roomId);
      if (!doc) return;
      const files = doc.getMap(FILES_KEY);
      if (files.has(name)) return socket.emit('ERROR', { message: 'A file with that name already exists.' });

      broadcastDocChange(roomId, doc, () => files.set(name, new Y.Text('')));
      schedulePersist(roomId, doc);
    }).catch((err) => console.error('Error adding Yjs file:', err));
  });

  socket.on('SAVE_CODE', async ({ roomId, fileName }) => {
    if (!(await canUseRoom(socket, roomId))) return;
    queueRoomWork(roomId, async () => {
      const ydoc = await loadRoomDoc(roomId);
      if (!ydoc) return;
      const text = ydoc.getMap(FILES_KEY).get(fileName);
      if (!(text instanceof Y.Text)) {
        return socket.emit('ERROR', { message: 'The selected file no longer exists.' });
      }

      const doc = await Code.findOne({ roomId });
      if (!doc) return;

      //create new at front and it needs 3 things in checkpoints
      doc.checkpoints.unshift({ fileName, code: text.toString(), savedAt: new Date() }); //make a new checkpoint on saving

      //5 latest checkpoints of all files
      //what this does is for each file it group all checkpoints
      const grouped = doc.checkpoints.reduce((acc, cp) => {
        acc[cp.fileName] = acc[cp.fileName] || [];
        acc[cp.fileName].push(cp);
        return acc;
      }, {});
      doc.checkpoints = Object.values(grouped).flatMap(arr => arr.slice(0, 5));

      await doc.save();
      await flushRoom(roomId, ydoc);
      socket.emit('SAVE_SUCCESS');
      io.to(roomId).emit('CHECKPOINT_UPDATED', { fileName });
    }).catch((err) => console.error('❌ Save error:', err));
  });

  socket.on('DELETE_FILE', async ({ roomId, fileName }) => {
    if (!(await canUseRoom(socket, roomId))) return;
    queueRoomWork(roomId, async () => {
      const room = await Code.findOne({ roomId });
      if (!room) return;

      // Owner check uses the verified email, not a `requester` field from the client.
      if (room.creator !== email) {
        return socket.emit('ERROR', { message: 'Only the owner can delete files.' });
      }

      const ydoc = await loadRoomDoc(roomId);
      const files = ydoc.getMap(FILES_KEY);
      if (!files.has(fileName)) return;

      broadcastDocChange(roomId, ydoc, () => files.delete(fileName));
      await flushRoom(roomId, ydoc);
    }).catch((err) => {
      console.error('DELETE_FILE error:', err);
      socket.emit('ERROR', { message: 'Server error during deletion.' });
    });
  });

  // Execution is handed to the BullMQ worker (worker.js); this handler only
  // checks access and limits, enqueues the job and waits for its result.
  socket.on('RUN_CODE', async ({ roomId, code, languageId }) => {
    if (!(await canUseRoom(socket, roomId))) return;
    if (typeof code !== 'string' || code.length > 64 * 1024) {
      return socket.emit('CODE_OUTPUT', { output: ['Code must be text under 64 KB.'] });
    }

    try {
      if (await isRateLimited(`ratelimit:run:${email}`, 10, 60)) {
        return socket.emit('CODE_OUTPUT', { output: ['Too many runs. Wait a minute and try again.'] });
      }
      const output = await runCode({ code, languageId });
      socket.emit('CODE_OUTPUT', { output });
    } catch (err) {
      console.error('Code run error:', err.message);
      socket.emit('CODE_OUTPUT', { output: ['Execution failed.'] });
    }
  });

  socket.on('CHAT_MESSAGE', async ({ roomId, message }) => {
    if (!(await canUseRoom(socket, roomId))) return;
    const text = String(message || '').trim().slice(0, 1000);
    if (!text) return;
    io.in(roomId).emit('CHAT_MESSAGE', {
      username: socket.data.username,
      message: text,
      timestamp: new Date().toISOString(),
    });
  });

  // Only the room owner can kick, only users in that room can be kicked, and a
  // kicked user is removed from `members` so they need the password to come back.
  socket.on('KICK_USER', async ({ roomId, socketId }) => {
    if (!(await canUseRoom(socket, roomId))) return;
    try {
      const room = await Code.findOne({ roomId }, { creator: 1 });
      if (!room || room.creator !== email) {
        return socket.emit('ERROR', { message: 'Only the owner can remove users.' });
      }

      // fetchSockets finds the target even if it is connected to another instance.
      const [target] = await io.in(socketId).fetchSockets();
      if (!target || !target.rooms.has(roomId) || target.data.user?.email === room.creator) return;

      await Code.updateOne({ roomId }, { $pull: { members: target.data.user.email } });
      target.emit('KICKED'); //send an kick event to that socket only and in frontend it would be handled
      target.disconnect();
    } catch (err) {
      console.error('KICK_USER error:', err);
    }
  });

  // Voice users are a Socket.IO room (`voice:<roomId>`), so the list is shared
  // across instances through Redis and cleaned up automatically on disconnect.
  socket.on('VOICE_JOIN', async ({ roomId }) => {
    if (!(await canUseRoom(socket, roomId))) return;
    const voiceRoom = `voice:${roomId}`;
    const others = (await io.in(voiceRoom).fetchSockets()).map((s) => s.id);
    socket.join(voiceRoom);
    socket.emit('VOICE_USERS', others);
  });

  socket.on('VOICE_SIGNAL', ({ to, data }) => {
    // `from` is set by the server so a client cannot pretend to be someone else.
    io.to(to).emit('VOICE_SIGNAL', { from: socket.id, data });
  });

  //in each room send disconnected message so that everyone can update list themselves
  socket.on('disconnecting', () => {
    const rooms = [...socket.rooms].filter((room) => isEditorRoom(socket, room));
    rooms.forEach((roomId) => {
      socket.to(roomId).emit('DISCONNECTED', {
        socketId: socket.id,
        username: socket.data.username,
      });
    });

    // Once the socket has left its rooms, free any room nobody here is using.
    socket.once('disconnect', () => {
      rooms.forEach((roomId) => {
        evictRoomIfIdle(roomId, hasLocalClients(roomId))
          .catch((err) => console.error(`Failed to unload room ${roomId}:`, err));
      });
    });
  });
});

// Handy on a single free-tier host: run the BullMQ worker inside the API process.
// In a scaled setup, leave this off and run `npm run worker` separately.
if (process.env.RUN_WORKER_IN_API === 'true') require('./worker');

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
