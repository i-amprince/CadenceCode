import React, { useEffect, useState, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { autocompletion } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python'; // Corrected import
import { cpp } from '@codemirror/lang-cpp';     // Corrected import
import { java } from '@codemirror/lang-java';   // Corrected import
import toast from 'react-hot-toast';
import { socket } from '../socket';
import './Editor.css';

import { EditorView } from '@codemirror/view'; // Import EditorView for lineWrapping

const LANG = {
  js: { id: 93, extFn: () => javascript({ jsx: true }) },
  py: { id: 71, extFn: () => python() },
  cpp: { id: 54, extFn: () => cpp() },
  java: { id: 62, extFn: () => java() },
};

export default function Editor({ roomId, onCodeChange }) {
  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [output, setOutput] = useState(['Waiting for execution...']);
  const [checkpoints, setCheckpoints] = useState([]);
  const [recent, setRecent] = useState([]);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user')) || { name: 'Guest' };

  useEffect(() => {
    socket.emit('GET_INITIAL_DATA', { roomId });

    socket.on('INITIAL_DATA', ({ files }) => {
      if (files.length === 0) files = [{ name: 'main.js', code: '' }];
      setFiles(files);
      setCurrentFile(files[0].name);
    });

    socket.on('CODE_CHANGE', ({ fileName, code }) => {
      setFiles(prev =>
        prev.map(f =>
          f.name === fileName ? { ...f, code } : f
        )
      );
    });

    socket.on('CODE_OUTPUT', ({ output }) => setOutput(output));
    socket.on('SAVE_SUCCESS', () => {
      toast.success('Saved');
      fetchCheckpoint();
    });
    socket.on('CHAT_MESSAGE', msg => {
      setChatMessages(prev => [...prev, msg]);
    });
    socket.on('NEW_FILE_ADDED', ({ file }) => {
      setFiles(prev => [...prev, file]);
      toast.success(`New file added: ${file.name}`);
    });

    fetchCheckpoint();

    return () => {
      socket.off('INITIAL_DATA');
      socket.off('CODE_CHANGE');
      socket.off('CODE_OUTPUT');
      socket.off('SAVE_SUCCESS');
      socket.off('CHAT_MESSAGE');
      socket.off('NEW_FILE_ADDED');
    };
  }, [roomId]);

  const fetchCheckpoint = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/room/${roomId}/checkpoints`);
      const data = await res.json();
      setCheckpoints(data.checkpoints || []);
    } catch {
      toast.error('Couldn’t load checkpoints');
    }
  };

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const run = () => {
    const f = files.find(f => f.name === currentFile);
    const ext = currentFile.split('.').pop()?.toLowerCase();
    const lang = LANG[ext === 'js' ? 'js' : ext] || LANG.js;

    setOutput(['Executing...']);
    socket.emit('RUN_CODE', {
      languageId: lang.id,
      code: f?.code || '',
    });
  };

  const save = () => {
    const f = files.find(f => f.name === currentFile);
    const code = f?.code || '';
    socket.emit('SAVE_CODE', { roomId, fileName: currentFile, code });

    const cp = { fileName: currentFile, code, savedAt: new Date().toISOString() };
    setRecent(prev => [cp, ...prev].slice(0, 5));
  };

  const addFile = () => {
    const name = prompt('New file name (e.g. utils.js)');
    if (!name || files.some(f => f.name === name)) {
      return toast.error('Invalid or duplicate name');
    }

    const newFile = { name, code: '' };
    setFiles(prev => [...prev, newFile]);
    setCurrentFile(name);

    socket.emit('NEW_FILE', { roomId, file: newFile });
  };

  const onEdit = code => {
    setFiles(prev =>
      prev.map(f =>
        f.name === currentFile ? { ...f, code } : f
      )
    );
    onCodeChange(code);
    socket.emit('CODE_CHANGE', { roomId, fileName: currentFile, code });
  };

  const mergedCP = [...recent, ...checkpoints]
    .filter(cp => cp.fileName === currentFile)
    .slice(0, 5);

  const sendChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    socket.emit('CHAT_MESSAGE', {
      roomId,
      username: user.name,
      message: msg,
    });
    setChatInput('');
  };

  const getExtension = () => {
    if (!currentFile) return javascript({ jsx: true });
    const ext = currentFile.split('.').pop()?.toLowerCase();
    return (LANG[ext] || LANG.js).extFn();
  };

  return (
    <div className="editorContainer">
      <div className="editorMain">
        <div className="headerRow">
          <select className="fileSelect" value={currentFile || ''} onChange={e => setCurrentFile(e.target.value)}>
            {files.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
          </select>
          <button className="newFileBtn" onClick={addFile}>➕ New File</button>
          <button className="runBtn" onClick={run}>▶ Run</button>
          <button className="saveBtn" onClick={save}>💾 Save</button>
          <select className="checkpointSelect" onChange={e => {
            const cp = mergedCP[e.target.value];
            if (cp) {
              onEdit(cp.code);
              socket.emit('CODE_CHANGE', { roomId, fileName: currentFile, code: cp.code });
            }
          }}>
            <option value="">🕒 Restore checkpoint</option>
            {mergedCP.map((cp, i) => (
              <option key={i} value={i}>
                {new Date(cp.savedAt).toLocaleTimeString()}
              </option>
            ))}
          </select>
        </div>

        <div className="editorPane">
          <CodeMirror
            value={files.find(f => f.name === currentFile)?.code || ''}
            height="100%"
            theme={dracula}
            extensions={[
              getExtension(),
              autocompletion(),
              EditorView.lineWrapping // This is still correct for word wrapping
            ]}
            onChange={onEdit}
          />
        </div>

        <div className="outputWrap">
          <pre className="outputConsole">
            {output.length > 0 ? output.map((l, i) => (<div key={i}>{`> ${l}`}</div>))
              : <div> No output yet.</div>
            }
          </pre>
        </div>
      </div>

      <div className="chatPanel">
        <div className="chatHeader">Chat</div>
        <div className="chatMessages" ref={chatRef}>
          {chatMessages.map((m, i) => (
            <div key={i} className="chatMessage">
              <strong>{m.username}:</strong> <span>{m.message}</span>
            </div>
          ))}
        </div>
        <div className="chatInputWrap">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && sendChat()}
            placeholder="Message..."
            className="chatInput"
          />
          <button onClick={sendChat} className="chatSendBtn">Send</button>
        </div>
      </div>
    </div>
  );
}