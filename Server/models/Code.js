// server/models/Code.js

const mongoose = require('mongoose');

const CodeSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    code: { type: String, default: '' },
    password: { type: String },
    creator: { type: String, required: true }, // Store the email of room creator
    checkpoints: [
        {
            code: String,
            savedAt: { type: Date, default: Date.now },
        }
    ],
}, { timestamps: true });

module.exports = mongoose.model('Code', CodeSchema);
