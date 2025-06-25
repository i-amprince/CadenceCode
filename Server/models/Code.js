// server/models/Code.js

const mongoose = require('mongoose');

const CodeSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    code: { type: String, default: '' },
    password: { type: String },     // 🔐 NEW
    creator: { type: String },      // 👤 NEW
}, { timestamps: true });

module.exports = mongoose.model('Code', CodeSchema);
