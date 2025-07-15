require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const axios = require('axios');
const Code = require('./models/Code');
const authRoutes = require('./routes/Auth');
const roomRoutes = require('./routes/room');
const path = require('path');

const app = express();
const server = http.createServer(app);
const cors = require('cors');
app.use(express.json());

// Set CORS to allow all origins
app.use(cors({ origin: '*', credentials: true }));

app.use('/api/auth', authRoutes);
app.use('/api/room', roomRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const userSocketMap = {};
const voiceUsers = {}; //for voice chat useresss

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
    io.in(roomId).emit('JOINED', { clients, username, socketId: socket.id });
  });

  socket.on('GET_INITIAL_DATA', async ({ roomId }) => {
    const doc = await Code.findOne({ roomId });
    socket.emit('INITIAL_DATA', { files: doc?.files || [] });
  });

  socket.on('NEW_FILE', async ({ roomId, file }) => {
    try {
      const doc = await Code.findOne({ roomId });
      if (!doc) return;
      if (!doc.files.some(f => f.name === file.name)) {
        doc.files.push(file);
        await doc.save();
        io.in(roomId).emit('NEW_FILE_ADDED', { file });
      }
    } catch (err) {
      console.error('Error adding new file:', err);
    }
  });

  socket.on('CODE_CHANGE', ({ roomId, fileName, code }) => {
    socket.to(roomId).emit('CODE_CHANGE', { fileName, code });
  });

  socket.on('SAVE_CODE', async ({ roomId, fileName, code }) => {
    try {
      const doc = await Code.findOne({ roomId });
      if (!doc) return;

      const file = doc.files.find(f => f.name === fileName);
      if (file) file.code = code;
      else doc.files.push({ name: fileName, code });

      doc.checkpoints.unshift({ fileName, code, savedAt: new Date() });

      const grouped = doc.checkpoints.reduce((acc, cp) => {
        acc[cp.fileName] = acc[cp.fileName] || [];
        acc[cp.fileName].push(cp);
        return acc;
      }, {});
      doc.checkpoints = Object.values(grouped).flatMap(arr => arr.slice(0, 5));

      await doc.save();
      socket.emit('SAVE_SUCCESS');
      io.to(roomId).emit('CHECKPOINT_UPDATED', { fileName });
    } catch (err) {
      console.error('❌ Save error:', err);
    }
  });

  socket.on('DELETE_FILE', async ({ roomId, fileName, requester }) => {
    try {
      const room = await Code.findOne({ roomId });
      if (!room) return;

      if (room.creator !== requester) {
        return socket.emit('ERROR', { message: 'Only the owner can delete files.' });
      }

      room.files = room.files.filter(f => f.name !== fileName);
      await room.save();
      io.to(roomId).emit('FILE_DELETED', { fileName });
    } catch (err) {
      console.error('DELETE_FILE error:', err);
      socket.emit('ERROR', { message: 'Server error during deletion.' });
    }
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
      const res = await axios.request(submissionOptions);
      const token = res.data.token;

      const poll = async () => {
        const result = await axios.get(
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

      poll();
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

  socket.on('KICK_USER', ({ socketId }) => {
    const kicked = io.sockets.sockets.get(socketId);
    if (kicked) {
      kicked.emit('KICKED');
      kicked.disconnect();
    }
  });

  //voiices in herrrr
  socket.on('VOICE_JOIN', ({ roomId }) => {
    voiceUsers[roomId] = voiceUsers[roomId] || [];
    voiceUsers[roomId].push(socket.id);
    const users = voiceUsers[roomId].filter(id => id !== socket.id);
    socket.emit('VOICE_USERS', users);
  });

  socket.on('VOICE_SIGNAL', ({ to, from, data }) => {
    io.to(to).emit('VOICE_SIGNAL', { from, data });
  });

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


  socket.on('disconnect', () => {
    Object.keys(voiceUsers).forEach(roomId => {
      voiceUsers[roomId] = (voiceUsers[roomId] || []).filter(id => id !== socket.id);
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
