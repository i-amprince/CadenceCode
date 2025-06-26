// models/Code.js

const mongoose = require('mongoose');

const checkpointSchema = new mongoose.Schema({
  code: String,
  savedAt: { type: Date, default: Date.now },
  fileName: String, // associate checkpoints to file
});

const fileSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. main.js
  code: { type: String, default: '' },
});

const CodeSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  creator: { type: String, required: true },
  password: String,
  files: [fileSchema],          // multiple files per room
  checkpoints: [checkpointSchema], // file-based checkpoints
}, { timestamps: true });

module.exports = mongoose.model('Code', CodeSchema);
