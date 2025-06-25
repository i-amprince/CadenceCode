// server/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();

const GOOGLE_CLIENT_ID = '533671388387-m71d70069k6rklr4l8tod7pnosb1770c.apps.googleusercontent.com';
const JWT_SECRET = 'your_jwt_secret_key'; // change this to something strong
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

router.post('/google', async (req, res) => {
    const { token } = req.body;

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();

        const jwtToken = jwt.sign(
            {
                email: payload.email,
                name: payload.name,
                picture: payload.picture,
            },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ token: jwtToken });
    } catch (err) {
        console.error('Google auth error:', err);
        res.status(401).json({ error: 'Invalid Google token' });
    }
});

module.exports = router;
