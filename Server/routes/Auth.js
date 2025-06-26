const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET; 
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
