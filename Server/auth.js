const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function verifyToken(token) {
  const { email, name, picture } = jwt.verify(token, process.env.JWT_SECRET);
  return { email, name, picture };
}

// Express middleware: the user comes from the signed JWT, never from the request body.
function requireAuth(req, res, next) {
  try {
    req.user = verifyToken(req.headers.authorization?.replace(/^Bearer /, ''));
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in again.' });
  }
}

function isMember(room, email) {
  return room.creator === email || (room.members || []).includes(email);
}

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// Rooms created before hashing stored the password as plain text. Those still
// work once, and the caller upgrades them to a hash on the first successful join.
async function checkPassword(room, password) {
  if (!room.password) return { ok: true };
  if (room.password.startsWith('$2')) {
    return { ok: await bcrypt.compare(password || '', room.password) };
  }
  return { ok: room.password === password, needsUpgrade: true };
}

module.exports = { verifyToken, requireAuth, isMember, hashPassword, checkPassword };
