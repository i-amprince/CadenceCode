// server/routes/room.js

const express = require('express');
const router = express.Router();
const Code = require('../models/Code');

// Create a new room
router.post('/create', async (req, res) => {
  const { roomId, password, creator } = req.body;
  try {
    const existing = await Code.findOne({ roomId });
    if (existing) return res.status(400).json({ error: 'Room already exists' });

    await Code.create({ roomId, password, creator });
    res.status(200).json({ message: 'Room created successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join a room
router.post('/join', async (req, res) => {
  const { roomId, password } = req.body;
  try {
    const room = await Code.findOne({ roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (room.password && room.password !== password)
      return res.status(401).json({ error: 'Incorrect password' });

    res.status(200).json({ message: 'Joined successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Optional: Fetch room info
router.get('/:roomId/info', async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await Code.findOne({ roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    res.status(200).json({ creator: room.creator });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch room info' });
  }
});

module.exports = router;
