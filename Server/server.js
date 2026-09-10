require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const axios = require('axios');
const Code = require('./models/Code');
const {
  Y,
  FILES_KEY,
  toUint8Array,
  loadRoomDoc,
  queueRoomWork,
  schedulePersist,
  flushRoom,
} = require('./collaboration');
const authRoutes = require('./routes/Auth');
const roomRoutes = require('./routes/room');
const path = require('path');

const app = express();
const server = http.createServer(app);
const cors = require('cors');
app.use(express.json());

// Set CORS to allow all origins
app.use(cors({
  origin: [
    'https://cadence-code.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true,
}));

app.use('/api/auth', authRoutes);
app.use('/api/room', roomRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const userSocketMap = {}; //later we will only know socket id not name.. map them
const voiceUsers = {}; //for voice chat useresss


//give all list of all users in that room 
function getClients(roomId) {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(socketId => ({
    socketId,
    username: userSocketMap[socketId]?.username,
    picture: userSocketMap[socketId]?.picture,
    email: userSocketMap[socketId]?.email, //email sending for owner last insertionnn
  }));
}

io.on('connection', (socket) => {
  console.log('🟢 Connected:', socket.id);

  socket.on('JOIN', async ({ roomId, username, picture, email }) => {
    userSocketMap[socket.id] = { username, picture, email }; // store email
    socket.join(roomId);

    const clients = getClients(roomId);
    io.in(roomId).emit('JOINED', { clients, username, socketId: socket.id }); //so that everyone in room has updated list.. in speakers

    // Send the current CRDT state only after the socket has joined the room.
    // This avoids the old join-time race where a client could receive or send a
    // stale full-file snapshot before it was a room member.
    try {
      const doc = await loadRoomDoc(roomId);
      if (doc) socket.emit('YJS_SYNC', { update: Y.encodeStateAsUpdate(doc) });
    } catch (err) {
      console.error('Initial Yjs room sync failed:', err);
    }
  });

  // A Yjs sync is a CRDT state update, not a whole-file last-write-wins update.
  // Applying the same update twice is safe, which also makes reconnect retries safe.
  socket.on('YJS_SYNC', async ({ roomId }) => {
    if (!socket.rooms.has(roomId)) return;
    try {
      const doc = await loadRoomDoc(roomId);
      if (!doc) return socket.emit('ERROR', { message: 'Room not found.' });
      socket.emit('YJS_SYNC', { update: Y.encodeStateAsUpdate(doc) });
    } catch (err) {
      console.error('Yjs sync error:', err);
      socket.emit('ERROR', { message: 'Could not synchronise the editor.' });
    }
  });

  socket.on('YJS_UPDATE', ({ roomId, update }) => {
    if (!socket.rooms.has(roomId)) return;
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
      schedulePersist(roomId, doc);
    }).catch((err) => console.error('Yjs update error:', err));
  });

  socket.on('NEW_FILE', async ({ roomId, file }) => {
    if (!socket.rooms.has(roomId)) return;
    const name = file?.name?.trim();
    if (!name) return socket.emit('ERROR', { message: 'A file name is required.' });

    queueRoomWork(roomId, async () => {
      const doc = await loadRoomDoc(roomId);
      if (!doc) return;
      const files = doc.getMap(FILES_KEY);
      if (files.has(name)) return socket.emit('ERROR', { message: 'A file with that name already exists.' });

      let update;
      const captureUpdate = (value) => { update = value; };
      doc.on('update', captureUpdate);
      try {
        doc.transact(() => files.set(name, new Y.Text('')));
      } finally {
        doc.off('update', captureUpdate);
      }
      if (update) io.in(roomId).emit('YJS_UPDATE', { update });
      schedulePersist(roomId, doc);
    }).catch((err) => console.error('Error adding Yjs file:', err));
  });

  socket.on('SAVE_CODE', ({ roomId, fileName }) => {
    if (!socket.rooms.has(roomId)) return;
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

  socket.on('DELETE_FILE', ({ roomId, fileName, requester }) => {
    if (!socket.rooms.has(roomId)) return;
    queueRoomWork(roomId, async () => {
      const room = await Code.findOne({ roomId });
      if (!room) return;

      if (room.creator !== requester) {
        return socket.emit('ERROR', { message: 'Only the owner can delete files.' });
      }

      const ydoc = await loadRoomDoc(roomId);
      const files = ydoc.getMap(FILES_KEY);
      if (!files.has(fileName)) return;

      let update;
      const captureUpdate = (value) => { update = value; };
      ydoc.on('update', captureUpdate);
      try {
        ydoc.transact(() => files.delete(fileName));
      } finally {
        ydoc.off('update', captureUpdate);
      }
      if (update) io.in(roomId).emit('YJS_UPDATE', { update });
      await flushRoom(roomId, ydoc);
    }).catch((err) => {
      console.error('DELETE_FILE error:', err);
      socket.emit('ERROR', { message: 'Server error during deletion.' });
    });
  });

  socket.on('RUN_CODE', async ({ code, languageId }) => {
    const submissionOptions = {
      method: 'POST',
      url: 'https://judge0-ce.p.rapidapi.com/submissions',
      params: { base64_encoded: 'false', fields: '*' },
      headers: {
        'content-type': 'application/json',
        'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
        'X-RapidAPI-Host': process.env.JUDGE0_API_HOST,
      },
      data: { language_id: languageId || 93, source_code: code },
    };

    try {
      const res = await axios.request(submissionOptions); //it returns token first
      const token = res.data.token;

      const poll = async () => {
        const result = await axios.get(  //then ask for result whether run or not
          `https://judge0-ce.p.rapidapi.com/submissions/${token}`,
          {
            params: { base64_encoded: 'false', fields: '*' },
            headers: submissionOptions.headers,
          }
        );

        const statusId = result.data.status.id;
        if (statusId <= 2) return setTimeout(poll, 1500);

        const output = [];
        if (result.data.stdout) output.push(...result.data.stdout.split('\n'));
        if (result.data.stderr) output.push(`[Error] ${result.data.stderr}`);
        if (result.data.compile_output) output.push(`[Compiler Error] ${result.data.compile_output}`);
        output.push(`[Finished in ${result.data.time || 0}s, Memory: ${result.data.memory || 0}KB]`);

        socket.emit('CODE_OUTPUT', { output });
      };

      poll(); //called poll
    } catch (err) {
      console.error('Judge0 error:', err.message);
      socket.emit('CODE_OUTPUT', { output: ['Execution failed.'] });
    }
  });

  socket.on('CHAT_MESSAGE', ({ roomId, username, message }) => {
    io.in(roomId).emit('CHAT_MESSAGE', {
      username,
      message,
      timestamp: new Date().toISOString(),
    });
  });

  //this user is sending id of another user so that we can disconnect him
  socket.on('KICK_USER', ({ socketId }) => {
    const kicked = io.sockets.sockets.get(socketId);
    if (kicked) {
      kicked.emit('KICKED'); //send an kick event to that socket only and in frontend it would be handled
      kicked.disconnect();
    }
  });

  //voiices in herrrr
  socket.on('VOICE_JOIN', ({ roomId }) => {
    voiceUsers[roomId] = voiceUsers[roomId] || []; //if no room then create it first
    voiceUsers[roomId].push(socket.id);
    const users = voiceUsers[roomId].filter(id => id !== socket.id);  //send list of all voice user to the new joinee
    socket.emit('VOICE_USERS', users); 
  });

  socket.on('VOICE_SIGNAL', ({ to, from, data }) => {
    io.to(to).emit('VOICE_SIGNAL', { from, data });
  });

  //in each room send disconnected message so that everyone can update list themselves
  socket.on('disconnecting', () => {
    const rooms = [...socket.rooms];
    rooms.forEach((roomId) => {
      socket.to(roomId).emit('DISCONNECTED', {
        socketId: socket.id,
        username: userSocketMap[socket.id]?.username,
      });
    });
    delete userSocketMap[socket.id];
  });


  //voiceusers remove
  socket.on('disconnect', () => {
    Object.keys(voiceUsers).forEach(roomId => {
      voiceUsers[roomId] = (voiceUsers[roomId] || []).filter(id => id !== socket.id);
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
