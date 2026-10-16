const express = require('express');
const router = express.Router();
const Code = require('../models/Code');
const { requireAuth, isMember, hashPassword, checkPassword } = require('../auth');
const { isRateLimited } = require('../redis');

// Every room route needs a signed-in user; the creator/member comes from the JWT.
router.use(requireAuth);

router.post('/create', async (req, res) => {
  const { roomId, password } = req.body;
  if (!roomId || !password) return res.status(400).json({ error: 'Room ID and password are required' });
  try {
    const existing = await Code.findOne({ roomId });
    if (existing) return res.status(400).json({ error: 'Room already exists' });

    await Code.create({
      roomId,
      password: await hashPassword(password),
      creator: req.user.email,
      members: [req.user.email],
      files: [],
    });
    res.status(200).json({ message: 'Room created successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/join', async (req, res) => {
  const { roomId, password } = req.body;
  try {
    // Stops password guessing: 10 attempts per user per room per minute.
    if (await isRateLimited(`ratelimit:join:${req.user.email}:${roomId}`, 10, 60)) {
      return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
    }

    const room = await Code.findOne({ roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const { ok, needsUpgrade } = await checkPassword(room, password);
    if (!ok) return res.status(401).json({ error: 'Incorrect password' });

    const update = { $addToSet: { members: req.user.email } };
    if (needsUpgrade) update.$set = { password: await hashPassword(password) };
    await Code.updateOne({ roomId }, update);

    res.status(200).json({ message: 'Joined successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Loads the room and rejects users who never entered its password.
async function findRoomForMember(req, res) {
  const room = await Code.findOne({ roomId: req.params.roomId });
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return null;
  }
  if (!isMember(room, req.user.email)) {
    res.status(403).json({ error: 'You do not have access to this room' });
    return null;
  }
  return room;
}

//return who is the owner of this
router.get('/:roomId/info', async (req, res) => {
  try {
    const room = await findRoomForMember(req, res);
    if (room) res.status(200).json({ creator: room.creator });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch room info' });
  }
});

//saved code checkpoints
router.get('/:roomId/checkpoints', async (req, res) => {
  try {
    const room = await findRoomForMember(req, res);
    if (room) res.json({ checkpoints: room.checkpoints || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get checkpoints' });
  }
});

module.exports = router;
