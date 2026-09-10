// model

const mongoose = require('mongoose');

const checkpointSchema = new mongoose.Schema({
  code: String,
  savedAt: { type: Date, default: Date.now },
  fileName: String, 
});

const fileSchema = new mongoose.Schema({
  name: { type: String, required: true }, 
  code: { type: String, default: '' },
});

const CodeSchema = new mongoose.Schema({ //it is the room schema
  roomId: { type: String, required: true, unique: true },
  creator: { type: String, required: true },
  password: String,
  files: [fileSchema],          
  checkpoints: [checkpointSchema], 
  // Canonical collaborative-editor state. `files` is retained as a readable
  // projection for existing REST endpoints and migration from older rooms.
  yjsState: Buffer,
  yjsUpdatedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Code', CodeSchema);
