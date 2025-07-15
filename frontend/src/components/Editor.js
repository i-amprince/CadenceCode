import React, { useEffect, useState, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { autocompletion } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import toast from 'react-hot-toast';
import { socket } from '../socket';
import './Editor.css';
import { EditorView } from '@codemirror/view';

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
  const [ownerEmail, setOwnerEmail] = useState('');
  const [clients, setClients] = useState([]); // Add this line
  const chatRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user')) || { name: 'Guest', email: '' };

  useEffect(() => {
    const fetchRoomDetails = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/room/${roomId}/info`);
        const data = await res.json();
        setOwnerEmail(data.creator);
      } catch (err) {
        toast.error('Failed to fetch room details');
      }
    };

    fetchRoomDetails();
    socket.emit('GET_INITIAL_DATA', { roomId });

    socket.on('INITIAL_DATA', ({ files }) => {
      if (files.length === 0) files = [{ name: 'main.js', code: '' }];
      setFiles(files);
      setCurrentFile(files[0].name);
    });

    socket.on('CODE_CHANGE', ({ fileName, code }) => {
      setFiles(prev => prev.map(f => f.name === fileName ? { ...f, code } : f));
    });

    socket.on('CODE_OUTPUT', ({ output }) => setOutput(output));
    socket.on('SAVE_SUCCESS', async () => {
      toast.success('Saved');
      await fetchCheckpoint();
    });

    socket.on('CHAT_MESSAGE', msg => {
      setChatMessages(prev => [...prev, msg]);
    });

    socket.on('NEW_FILE_ADDED', ({ file }) => {
      setFiles(prev => [...prev, file]);
      toast.success(`New file added: ${file.name}`);
    });

    socket.on('FILE_DELETED', ({ fileName }) => {
      setFiles(prevFiles => {
        const newFiles = prevFiles.filter(f => f.name !== fileName);
        toast.success(`File "${fileName}" deleted`);

        if (currentFile === fileName) {
          setCurrentFile(newFiles[0]?.name || null);
        }

        return newFiles;
      });
    });

    socket.on('ERROR', ({ message }) => {
      toast.error(message);
    });

    socket.on('JOINED', ({ clients }) => {
      setClients(clients);
    });

    socket.on('CHECKPOINT_UPDATED', async () => {
      await fetchCheckpoint();
      toast.success('Checkpoints updated');
    });

    fetchCheckpoint();

    return () => {
      socket.off('INITIAL_DATA');
      socket.off('CODE_CHANGE');
      socket.off('CODE_OUTPUT');
      socket.off('SAVE_SUCCESS');
      socket.off('CHAT_MESSAGE');
      socket.off('NEW_FILE_ADDED');
      socket.off('FILE_DELETED');
      socket.off('ERROR');
      socket.off('JOINED');
      socket.off('CHECKPOINT_UPDATED'); 
    };
  }, [roomId]);

  useEffect(() => {
    if (currentFile && !files.find(f => f.name === currentFile)) {
      setCurrentFile(files[0]?.name || null);
    }
  }, [files, currentFile]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const fetchCheckpoint = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/room/${roomId}/checkpoints`);
      const data = await res.json();
      setCheckpoints(data.checkpoints || []);
    } catch {
      toast.error('Couldn’t load checkpoints');
    }
  };

  const run = () => {
    const f = files.find(f => f.name === currentFile);
    const ext = currentFile?.split('.').pop()?.toLowerCase();
    const lang = LANG[ext === 'js' ? 'js' : ext] || LANG.js;

    setOutput(['Executing...']);
    socket.emit('RUN_CODE', {
      languageId: lang.id,
      code: f?.code || '',
    });
  };

  const save = async () => {
    const f = files.find(f => f.name === currentFile);
    const code = f?.code || '';
    socket.emit('SAVE_CODE', { roomId, fileName: currentFile, code });

    const cp = { fileName: currentFile, code, savedAt: new Date().toISOString() };

    await fetchCheckpoint();
  };

  const addFile = () => {
    const name = prompt('Enter new file name (e.g., utils.js):');
    if (!name || !name.trim()) return;
    if (files.some(f => f.name === name)) {
      return toast.error('A file with that name already exists.');
    }

    const newFile = { name, code: '' };
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
    // Find the current user in clients list
    const me = clients.find(c => c.socketId === socket.id);
    socket.emit('CHAT_MESSAGE', {
      roomId,
      username: me?.username || user.name,
      message: msg,
    });
    setChatInput('');
  };

  const getExtension = () => {
    if (!currentFile) return javascript({ jsx: true });
    const ext = currentFile.split('.').pop()?.toLowerCase();
    return (LANG[ext] || LANG.js).extFn();
  };

  const handleDeleteFile = (fileName) => {
    if (files.length <= 1) {
      toast.error('You cannot delete the last file.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
      socket.emit('DELETE_FILE', {
        roomId,
        fileName,
        requester: user.email || user.name,
      });
    }
  };

  return (
    <div className="editorContainer">
      <div className="editorMain">
        <div className="headerRow">
         
          <div className="fileTabsWrapper">
            <div className="fileTabs">
              {files.map(f => (
                <div
                  key={f.name}
                  className={`fileTab ${currentFile === f.name ? 'active' : ''}`}
                  onClick={() => setCurrentFile(f.name)}
                  title={f.name}
                >
                  <span className="fileName">{f.name}</span>
                  {user.email === ownerEmail && (
                    <button
                      className="fileDeleteBtn"
                      onClick={(e) => {
                        e.stopPropagation(); 
                        handleDeleteFile(f.name);
                      }}
                      title="Delete file"
                      disabled={files.length <= 1}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="addFileBtn" onClick={addFile} title="Add New File">
              +
            </button>
          </div>

         
          <div className="actionButtons">
            <button className="runBtn" onClick={run}>▶ Run</button>
            <button className="saveBtn" onClick={save}>💾 Save</button>
            <select
              className="checkpointSelect"
              value=""
              onChange={e => {
                const selectedIndex = e.target.value;
                if (selectedIndex === "") return;
                const cp = mergedCP[selectedIndex];
                if (cp) {
                  onEdit(cp.code);
                  socket.emit('CODE_CHANGE', { roomId, fileName: currentFile, code: cp.code });
                }
                e.target.value = ""; 
              }}
            >
              <option value="" disabled>🕒 Restore</option>
              {mergedCP.map((cp, i) => (
                <option key={i} value={i}>
                  {new Date(cp.savedAt).toLocaleTimeString()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="editorPane">
          <CodeMirror
            value={files.find(f => f.name === currentFile)?.code || ''}
            height="100%"
            theme={dracula}
            extensions={[
              getExtension(),
              autocompletion(),
              EditorView.lineWrapping
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
