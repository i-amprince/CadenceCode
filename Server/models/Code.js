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
  password: String,             // bcrypt hash
  members: [String],            // emails that entered the password; checked on socket JOIN
  files: [fileSchema],          
  checkpoints: [checkpointSchema], 
  // Canonical collaborative-editor state. `files` is retained as a readable
  // projection for existing REST endpoints and migration from older rooms.
  yjsState: Buffer,
  yjsUpdatedAt: Date,
  // Bumped on every Yjs save so two servers saving at once cannot overwrite each other.
  yjsVersion: Number,
}, { timestamps: true });

module.exports = mongoose.model('Code', CodeSchema);
