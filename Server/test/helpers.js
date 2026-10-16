// Test helpers: an in-memory stand-in for the Mongoose `Code` model and a way to
// swap real modules (Mongo model, Redis, BullMQ queue) for fakes via require.cache,
// so tests exercise the real server code without any external services.
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..');

function deepClone(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(deepClone);
  if (value instanceof Date) return new Date(value);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepClone(v)]));
  }
  return value;
}

// Supports the subset of Mongoose used by the server: findOne (+ save), create, and
// updateOne with $set / $addToSet / $pull. A `null` filter value matches a missing field,
// like MongoDB does. `hooks.beforeUpdate` lets a test simulate a concurrent writer.
function createFakeCode() {
  const store = new Map();
  const matches = (doc, filter) =>
    Object.entries(filter).every(([k, v]) => (v === null ? doc[k] == null : doc[k] === v));

  const Code = {
    store,
    hooks: { beforeUpdate: null },
    async findOne(filter) {
      const doc = [...store.values()].find((d) => matches(d, filter));
      if (!doc) return null;
      const copy = deepClone(doc);
      copy.save = async () => {
        const { save, ...rest } = copy;
        store.set(copy.roomId, deepClone(rest));
      };
      return copy;
    },
    async create(doc) {
      store.set(doc.roomId, deepClone({ checkpoints: [], members: [], ...doc }));
    },
    async updateOne(filter, update) {
      if (Code.hooks.beforeUpdate) await Code.hooks.beforeUpdate(filter, update);
      const doc = [...store.values()].find((d) => matches(d, filter));
      if (!doc) return { matchedCount: 0 };
      Object.assign(doc, deepClone(update.$set || {}));
      for (const [k, v] of Object.entries(update.$addToSet || {})) {
        doc[k] = doc[k] || [];
        if (!doc[k].includes(v)) doc[k].push(v);
      }
      for (const [k, v] of Object.entries(update.$pull || {})) {
        doc[k] = (doc[k] || []).filter((x) => x !== v);
      }
      return { matchedCount: 1 };
    },
  };
  return Code;
}

function installModule(relPath, exports) {
  const file = require.resolve(path.join(SERVER_DIR, relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

function installPackage(name, exports) {
  const file = require.resolve(name, { paths: [SERVER_DIR] });
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

// A separate copy of collaboration.js per call, so one process can act as two servers.
function freshCollaboration(Code) {
  installModule('models/Code.js', Code);
  const file = require.resolve(path.join(SERVER_DIR, 'collaboration.js'));
  delete require.cache[file];
  return require(file);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { SERVER_DIR, createFakeCode, installModule, installPackage, freshCollaboration, sleep };
