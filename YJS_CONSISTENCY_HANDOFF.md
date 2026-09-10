# Collaborative Editing Consistency Handoff

## What changed

The editor no longer broadcasts `CODE_CHANGE` events containing the entire file.
That approach was last-write-wins: two people typing at the same time could silently
overwrite each other.

The editor now uses a Yjs CRDT document for every room:

```text
Y.Doc (one browser/server document per room)
└── Y.Map("files")
    └── file name -> Y.Text (the CRDT-backed code contents)
```

CodeMirror is bound directly to the active `Y.Text` with `y-codemirror.next`.
Normal typing therefore creates small CRDT updates. Yjs merges concurrent inserts,
deletes, duplicate delivery, reconnects, and out-of-order delivery deterministically.
Every connected client will converge on the same code instead of accepting the last
whole-file payload it receives.

## Install before running

Package manifests have been updated but dependencies and lockfiles were deliberately
not installed/rewritten. From PowerShell, use `npm.cmd` if your execution policy
blocks `npm`:

```powershell
cd Server
npm.cmd install

cd ..\frontend
npm.cmd install
```

Then start the backend and frontend normally:

```powershell
cd Server
npm.cmd start

cd ..\frontend
npm.cmd start
```

New frontend dependencies are `yjs`, `y-codemirror.next`, and `y-protocols`. The
backend needs `yjs`.

## Request flow

1. The client joins its Socket.IO room.
2. The server loads the room's stored Yjs state and emits `YJS_SYNC`.
3. The client applies that state to its local `Y.Doc`.
4. A CodeMirror edit changes its `Y.Text`; Yjs emits a binary `YJS_UPDATE`.
5. The server applies the update to its room document, relays it to other clients,
   and debounces persistence to MongoDB (750 ms).
6. Remote updates are applied with a distinct origin so they are not echoed back.

File creation and deletion are server-serialized operations. They mutate the same Yjs
`files` map and are broadcast as `YJS_UPDATE`, so file structure and file content have
one consistent state model. Checkpoints read the current server-side `Y.Text`; they no
longer trust a full code string supplied by the browser. The existing delete-owner
check still trusts a browser-sent identity; socket JWT authentication is the first
production-security follow-up below.

## Persistence and migration

`Code.yjsState` holds an encoded Yjs state snapshot. Existing rooms that only have the
old `files` array are lazily migrated the first time they are opened. The legacy
`files` array is still maintained as a readable projection so existing room APIs work.

The Yjs snapshot is canonical. Do not reintroduce `CODE_CHANGE` full-text messages or
write `Code.files` directly for editor changes; doing either creates a second source
of truth and reintroduces lost updates.

## Current boundary

This is conflict-safe collaborative editing for a **single Node.js server instance**.
Yjs gives the merge algorithm; it does not by itself coordinate separate server
processes. The database snapshot is debounced for write efficiency, so a sudden
process crash can lose up to roughly 750 ms of unsaved updates. Clicking Save flushes
the current snapshot before confirming the checkpoint.

## Next production features

1. Authenticate Socket.IO with the existing JWT and derive the user identity from the
   verified socket. Do not trust client-sent `requester`, email, or owner values.
2. Add a Socket.IO Redis adapter plus a shared Yjs update stream/store before running
   multiple backend instances. Every instance must receive every Yjs update.
3. Store update logs plus periodic compact snapshots for better crash durability and
   recovery, rather than only one debounced snapshot.
4. Replace file-name identity with immutable `fileId` values. That makes concurrent
   rename/delete operations unambiguous. Keep names as metadata.
5. Add Yjs Awareness sharing to show cursors, selections, and each collaborator's
   name/color. Awareness is intentionally local in this first consistency change.
6. Add limits/rate limiting for rooms, update sizes, and code execution.

## Verification checklist

Open the same room in two different browsers or one normal/private window:

1. Put both cursors at different locations and type simultaneously. Both edits should
   remain visible on both screens.
2. Type at the same location simultaneously. Text order can be deterministic rather
   than human-preferred, but neither edit should disappear.
3. Disconnect one browser, make edits in the other, reconnect, and confirm it catches
   up.
4. Create/delete a file from one browser and confirm it appears/disappears in the
   other.
5. Save a checkpoint and verify it contains the merged text, not one user's stale
   full-file version.

## Interview answer

> “The initial Socket.IO implementation was real-time but last-write-wins because it
> broadcast entire documents. I replaced the editor synchronization layer with Yjs,
> a CRDT. Each file is a shared Y.Text and CodeMirror sends operation-level updates,
> which merge concurrent edits and converge deterministically. The server relays and
> persists Yjs state; checkpoints are server controlled. I would next enforce file
> permissions from an authenticated socket identity, and add Redis plus a shared
> durable update log for horizontal scaling.”
