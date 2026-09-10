import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { autocompletion } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { EditorView } from '@codemirror/view';
import { yCollab } from 'y-codemirror.next';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import toast from 'react-hot-toast';
import { socket } from '../socket';
import { githubLight } from '@uiw/codemirror-theme-github';
import { FiMessageSquare, FiX } from 'react-icons/fi';
import './Editor.css';

const LANG = {
  js: { id: 93, extFn: () => javascript({ jsx: true }) },
  py: { id: 71, extFn: () => python() },
  cpp: { id: 54, extFn: () => cpp() },
  java: { id: 62, extFn: () => java() },
};
const FILES_KEY = 'files';

function asUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value?.type === 'Buffer' && Array.isArray(value.data)) return Uint8Array.from(value.data);
  return new Uint8Array(value || []);
}

export default function Editor({ roomId, onCodeChange }) {
  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [collab, setCollab] = useState(null);
  const [output, setOutput] = useState(['Waiting for execution...']);
  const [checkpoints, setCheckpoints] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [clients, setClients] = useState([]);
  const [outputHeight, setOutputHeight] = useState(160);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const chatRef = useRef(null);
  const isResizing = useRef(false);
  const remoteOrigin = useRef({ source: 'server' });
  const pendingFile = useRef(null);
  const user = JSON.parse(localStorage.getItem('user')) || { name: 'Guest', email: '' };

  const fetchCheckpoint = useCallback(async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/room/${roomId}/checkpoints`);
      const data = await response.json();
      setCheckpoints(data.checkpoints || []);
    } catch {
      toast.error('Couldn’t load checkpoints');
    }
  }, [roomId]);

  // Each room gets a Y.Doc. Its `files` map contains Y.Text values, so normal
  // typing is transmitted as CRDT edits rather than whole-file replacements.
  useEffect(() => {
    const doc = new Y.Doc();
    const fileMap = doc.getMap(FILES_KEY);
    const awareness = new Awareness(doc);
    let disposed = false;

    const refreshFiles = () => {
      const next = Array.from(fileMap.entries())
        .filter(([, text]) => text instanceof Y.Text)
        .map(([name, text]) => ({ name, code: text.toString() }));
      setFiles(next);
      setCurrentFile((previous) => {
        if (pendingFile.current && next.some((file) => file.name === pendingFile.current)) {
          const name = pendingFile.current;
          pendingFile.current = null;
          return name;
        }
        return next.some((file) => file.name === previous) ? previous : (next[0]?.name || null);
      });
      onCodeChange(next.reduce((result, file) => ({ ...result, [file.name]: file.code }), {}));
    };
    const sendLocalUpdate = (update, origin) => {
      if (!disposed && origin !== remoteOrigin.current) socket.emit('YJS_UPDATE', { roomId, update });
    };
    const applyServerUpdate = ({ update }) => Y.applyUpdate(doc, asUint8Array(update), remoteOrigin.current);
    const requestSync = () => socket.emit('YJS_SYNC', { roomId });

    fileMap.observeDeep(refreshFiles);
    doc.on('update', sendLocalUpdate);
    socket.on('YJS_SYNC', applyServerUpdate);
    socket.on('YJS_UPDATE', applyServerUpdate);
    socket.on('connect', requestSync);
    if (socket.connected) requestSync();
    setCollab({ doc, fileMap, awareness });

    return () => {
      disposed = true;
      fileMap.unobserveDeep(refreshFiles);
      doc.off('update', sendLocalUpdate);
      socket.off('YJS_SYNC', applyServerUpdate);
      socket.off('YJS_UPDATE', applyServerUpdate);
      socket.off('connect', requestSync);
      awareness.destroy();
      doc.destroy();
    };
    // EditorPage passes an inline callback. Recreating the Y.Doc when it changes
    // would lose the local CRDT state, so only a room change resets it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    const fetchRoomDetails = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/room/${roomId}/info`);
        const data = await response.json();
        setOwnerEmail(data.creator);
      } catch {
        toast.error('Failed to fetch room details');
      }
    };
    const handleCodeOutput = ({ output: nextOutput }) => setOutput(nextOutput);
    const handleSaveSuccess = async () => { toast.success('Saved'); await fetchCheckpoint(); };
    const handleChatMessage = (message) => setChatMessages((old) => [...old, message]);
    const handleError = ({ message }) => toast.error(message);
    const handleJoined = ({ clients: nextClients }) => setClients(nextClients);
    const handleCheckpointUpdated = async () => { await fetchCheckpoint(); toast.success('Checkpoints updated'); };

    fetchRoomDetails();
    fetchCheckpoint();
    socket.on('CODE_OUTPUT', handleCodeOutput);
    socket.on('SAVE_SUCCESS', handleSaveSuccess);
    socket.on('CHAT_MESSAGE', handleChatMessage);
    socket.on('ERROR', handleError);
    socket.on('JOINED', handleJoined);
    socket.on('CHECKPOINT_UPDATED', handleCheckpointUpdated);
    return () => {
      socket.off('CODE_OUTPUT', handleCodeOutput);
      socket.off('SAVE_SUCCESS', handleSaveSuccess);
      socket.off('CHAT_MESSAGE', handleChatMessage);
      socket.off('ERROR', handleError);
      socket.off('JOINED', handleJoined);
      socket.off('CHECKPOINT_UPDATED', handleCheckpointUpdated);
    };
  }, [roomId, fetchCheckpoint]);

  useEffect(() => {
    const move = (event) => {
      if (!isResizing.current) return;
      const height = window.innerHeight - event.clientY;
      if (height > 50 && height < window.innerHeight - 200) setOutputHeight(height);
    };
    const stop = () => { isResizing.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); };
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  const editorExtensions = useMemo(() => {
    const text = collab?.fileMap.get(currentFile);
    if (!(text instanceof Y.Text)) return [];
    const ext = currentFile?.split('.').pop()?.toLowerCase();
    return [(LANG[ext] || LANG.js).extFn(), autocompletion(), EditorView.lineWrapping, yCollab(text, collab.awareness)];
  }, [collab, currentFile]);

  const run = () => {
    const file = files.find((item) => item.name === currentFile);
    const ext = currentFile?.split('.').pop()?.toLowerCase();
    setOutput(['Executing...']);
    socket.emit('RUN_CODE', { languageId: (LANG[ext] || LANG.js).id, code: file?.code || '' });
  };
  const save = () => socket.emit('SAVE_CODE', { roomId, fileName: currentFile });
  const addFile = () => {
    const name = prompt('Enter new file name (e.g., utils.js):')?.trim();
    if (!name) return;
    if (files.some((file) => file.name === name)) return toast.error('A file with that name already exists.');
    pendingFile.current = name;
    socket.emit('NEW_FILE', { roomId, file: { name } });
  };
  const restoreCheckpoint = (code) => {
    const text = collab?.fileMap.get(currentFile);
    if (!(text instanceof Y.Text)) return;
    collab.doc.transact(() => { text.delete(0, text.length); text.insert(0, code); });
  };
  const sendChat = () => {
    const message = chatInput.trim();
    if (!message) return;
    const me = clients.find((client) => client.socketId === socket.id);
    socket.emit('CHAT_MESSAGE', { roomId, username: me?.username || user.name, message });
    setChatInput('');
  };
  const handleDeleteFile = (fileName) => {
    if (files.length <= 1) return toast.error('You cannot delete the last file.');
    if (window.confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
      socket.emit('DELETE_FILE', { roomId, fileName, requester: user.email || user.name });
    }
  };

  const currentText = collab?.fileMap.get(currentFile);
  const checkpointOptions = checkpoints.filter((checkpoint) => checkpoint.fileName === currentFile).slice(0, 5);
  const canEdit = currentText instanceof Y.Text;

  return (
    <>
      <div className={`overlay ${isChatOpen ? 'open' : ''}`} onClick={() => setIsChatOpen(false)}></div>
      <div className="editorContainer">
        <div className="editorMain">
          <div className="headerRow">
            <div className="fileTabsWrapper"><div className="fileTabs">
              {files.map((file) => <div key={file.name} className={`fileTab ${currentFile === file.name ? 'active' : ''}`} onClick={() => setCurrentFile(file.name)} title={file.name}>
                <span className="fileName">{file.name}</span>
                {user.email === ownerEmail && <button className="fileDeleteBtn" onClick={(event) => { event.stopPropagation(); handleDeleteFile(file.name); }} title="Delete file" disabled={files.length <= 1}>×</button>}
              </div>)}
            </div><button className="addFileBtn" onClick={addFile} title="Add New File">+</button></div>
            <div className="actionButtons">
              <button className="runBtn" onClick={run}>Run</button><button className="saveBtn" onClick={save} disabled={!canEdit}>Save</button>
              <select className="checkpointSelect" value="" onChange={(event) => { if (event.target.value !== '') restoreCheckpoint(checkpointOptions[event.target.value].code); }}>
                <option value="" disabled>Restore</option>{checkpointOptions.map((checkpoint, index) => <option key={index} value={index}>{new Date(checkpoint.savedAt).toLocaleTimeString()}</option>)}
              </select><button className="mobileChatToggle" onClick={() => setIsChatOpen((open) => !open)}><FiMessageSquare /></button>
            </div>
          </div>
          <div className="editorPane" style={{ height: `calc(100% - ${outputHeight}px - 6px)` }}>
            {canEdit ? <CodeMirror key={currentFile} height="100%" theme={githubLight} extensions={editorExtensions} /> : <div style={{ padding: 16 }}>Synchronising collaborative editor…</div>}
          </div>
          <div className="resizer" onMouseDown={(event) => { event.preventDefault(); isResizing.current = true; }}></div>
          <div className="outputWrap" style={{ height: `${outputHeight}px` }}><pre className="outputConsole">{output.map((line, index) => <div key={index}>{`> ${line}`}</div>)}</pre></div>
        </div>
        <div className={`chatPanel ${isChatOpen ? 'open' : ''}`}>
          <div className="chatHeader"><span>Chat</span><button className="closeChatBtn" onClick={() => setIsChatOpen(false)}><FiX size={20} /></button></div>
          <div className="chatMessages" ref={chatRef}>{chatMessages.map((message, index) => <div key={index} className="chatMessage"><strong>{message.username}:</strong> <span>{message.message}</span></div>)}</div>
          <div className="chatInputWrap"><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyPress={(event) => event.key === 'Enter' && sendChat()} placeholder="Message..." className="chatInput" /><button onClick={sendChat} className="chatSendBtn">Send</button></div>
        </div>
      </div>
    </>
  );
}
