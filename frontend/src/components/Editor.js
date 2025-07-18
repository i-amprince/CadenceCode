import React, { useEffect, useState, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { autocompletion } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import toast from 'react-hot-toast';
import { socket } from '../socket';
import './Editor.css'; // This will point to the new CSS you'll create
import { EditorView } from '@codemirror/view';

// --- MODIFIED: Swapped theme from dracula to githubLight for the new design ---
import { githubLight } from '@uiw/codemirror-theme-github';
// --- ADDED: Icons for the new mobile chat buttons ---
import { FiMessageSquare, FiX } from 'react-icons/fi';

// Original LANG constant - UNTOUCHED
const LANG = {
  js: { id: 93, extFn: () => javascript({ jsx: true }) },
  py: { id: 71, extFn: () => python() },
  cpp: { id: 54, extFn: () => cpp() },
  java: { id: 62, extFn: () => java() },
};

export default function Editor({ roomId, onCodeChange }) {
  // --- All original state variables are preserved - UNTOUCHED ---
  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [output, setOutput] = useState(['Waiting for execution...']);
  const [checkpoints, setCheckpoints] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [clients, setClients] = useState([]);
  const chatRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user')) || { name: 'Guest', email: '' };

  // --- ADDED: New state and refs for UI functionality (resizable pane, mobile chat) ---
  const [outputHeight, setOutputHeight] = useState(160);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const isResizing = useRef(false);

  // --- The entire core useEffect for socket logic is preserved - UNTOUCHED ---
  useEffect(() => {
    const fetchRoomDetails = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/room/${roomId}/info`);
        const data = await res.json();
        setOwnerEmail(data.creator);
      } catch (err) {
        toast.error('Failed to fetch room details');
      }
    };

    fetchRoomDetails();
    socket.emit('GET_INITIAL_DATA', { roomId });

    const handleInitialData = ({ files }) => {
      if (files.length === 0) files = [{ name: 'main.js', code: '' }];
      setFiles(files);
      setCurrentFile(files[0].name);
    };

    const handleCodeChange = ({ fileName, code }) => {
      setFiles(prev => prev.map(f => f.name === fileName ? { ...f, code } : f));
    };

    const handleCodeOutput = ({ output }) => setOutput(output);

    const handleSaveSuccess = async () => {
      toast.success('Saved');
      await fetchCheckpoint();
    };

    const handleChatMessage = msg => {
      setChatMessages(prev => [...prev, msg]);
    };

    const handleNewFileAdded = ({ file }) => {
      setFiles(prev => [...prev, file]);
      toast.success(`New file added: ${file.name}`);
    };

    const handleFileDeleted = ({ fileName }) => {
      setFiles(prevFiles => {
        const newFiles = prevFiles.filter(f => f.name !== fileName);
        toast.success(`File "${fileName}" deleted`);
        if (currentFile === fileName) {
          setCurrentFile(newFiles[0]?.name || null);
        }
        return newFiles;
      });
    };

    const handleError = ({ message }) => {
      toast.error(message);
    };

    const handleJoined = ({ clients }) => {
      setClients(clients);
    };

    const handleCheckpointUpdated = async () => {
      await fetchCheckpoint();
      toast.success('Checkpoints updated');
    };

    socket.on('INITIAL_DATA', handleInitialData);
    socket.on('CODE_CHANGE', handleCodeChange);
    socket.on('CODE_OUTPUT', handleCodeOutput);
    socket.on('SAVE_SUCCESS', handleSaveSuccess);
    socket.on('CHAT_MESSAGE', handleChatMessage);
    socket.on('NEW_FILE_ADDED', handleNewFileAdded);
    socket.on('FILE_DELETED', handleFileDeleted);
    socket.on('ERROR', handleError);
    socket.on('JOINED', handleJoined);
    socket.on('CHECKPOINT_UPDATED', handleCheckpointUpdated);

    fetchCheckpoint();

    return () => {
      socket.off('INITIAL_DATA', handleInitialData);
      socket.off('CODE_CHANGE', handleCodeChange);
      socket.off('CODE_OUTPUT', handleCodeOutput);
      socket.off('SAVE_SUCCESS', handleSaveSuccess);
      socket.off('CHAT_MESSAGE', handleChatMessage);
      socket.off('NEW_FILE_ADDED', handleNewFileAdded);
      socket.off('FILE_DELETED', handleFileDeleted);
      socket.off('ERROR', handleError);
      socket.off('JOINED', handleJoined);
      socket.off('CHECKPOINT_UPDATED', handleCheckpointUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // --- Original supporting useEffects are preserved - UNTOUCHED ---
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

  // --- ADDED: useEffect to handle the resizer logic ---
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 50 && newHeight < window.innerHeight - 200) {
        setOutputHeight(newHeight);
      }
    };
    const handleMouseUp = () => {
      isResizing.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // --- ADDED: Handlers for new UI events ---
  const handleMouseDownOnResizer = (e) => {
    e.preventDefault();
    isResizing.current = true;
  };

  const toggleChat = () => setIsChatOpen(!isChatOpen);


  // --- All original functions are preserved - UNTOUCHED ---
  const fetchCheckpoint = async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/room/${roomId}/checkpoints`);
      const data = await res.json();
      setCheckpoints(data.checkpoints || []);
    } catch {
      toast.error('Couldn’t load checkpoints');
    }
  };

  const run = () => {
    const f = files.find(f => f.name === currentFile);
    const ext = currentFile?.split('.').pop()?.toLowerCase();
    const lang = LANG[ext] || LANG.js;
    setOutput(['Executing...']);
    socket.emit('RUN_CODE', {
      languageId: lang.id,
      code: f?.code || '',
    });
  };

  const save = async () => {
    const f = files.find(f => f.name === currentFile);
    socket.emit('SAVE_CODE', { roomId, fileName: currentFile, code: f?.code || '' });
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

  // --- MODIFIED: onEdit now correctly builds the full code object for the parent component ---
  const onEdit = (code) => {
    const updatedFiles = files.map(f => (f.name === currentFile ? { ...f, code } : f));
    setFiles(updatedFiles);

    // This creates the { 'file1.js': '...', 'file2.py': '...' } object
    const codeObj = updatedFiles.reduce((acc, file) => {
      acc[file.name] = file.code;
      return acc;
    }, {});
    
    onCodeChange(codeObj); // Pass the complete object up to EditorPage
    socket.emit('CODE_CHANGE', { roomId, fileName: currentFile, code });
  };

  const sendChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
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

  const mergedCP = [...checkpoints].filter(cp => cp.fileName === currentFile).slice(0, 5);
  
  // --- The entire JSX return block is replaced with the new structure ---
  return (
    <>
      <div className={`overlay ${isChatOpen ? 'open' : ''}`} onClick={toggleChat}></div>
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
                        onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.name); }}
                        title="Delete file"
                        disabled={files.length <= 1}
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
              <button className="addFileBtn" onClick={addFile} title="Add New File">+</button>
            </div>
            <div className="actionButtons">
              <button className="runBtn" onClick={run}>Run</button>
              <button className="saveBtn" onClick={save}>Save</button>
              <select
                className="checkpointSelect"
                value=""
                onChange={e => {
                  const selectedIndex = e.target.value;
                  if (selectedIndex === "") return;
                  const cp = mergedCP[selectedIndex];
                  if (cp) { onEdit(cp.code); }
                  e.target.value = "";
                }}
              >
                <option value="" disabled>Restore</option>
                {mergedCP.map((cp, i) => (
                  <option key={i} value={i}>{new Date(cp.savedAt).toLocaleTimeString()}</option>
                ))}
              </select>
              <button className="mobileChatToggle" onClick={toggleChat}><FiMessageSquare/></button>
            </div>
          </div>
          <div className="editorPane" style={{ height: `calc(100% - ${outputHeight}px - 6px)` }}>
            <CodeMirror
              value={files.find(f => f.name === currentFile)?.code || ''}
              height="100%"
              theme={githubLight}
              extensions={[getExtension(), autocompletion(), EditorView.lineWrapping]}
              onChange={onEdit}
            />
          </div>
          <div className="resizer" onMouseDown={handleMouseDownOnResizer}></div>
          <div className="outputWrap" style={{ height: `${outputHeight}px` }}>
            <pre className="outputConsole">
              {output.map((l, i) => (<div key={i}>{`> ${l}`}</div>))}
            </pre>
          </div>
        </div>
        <div className={`chatPanel ${isChatOpen ? 'open' : ''}`}>
          <div className="chatHeader">
            <span>Chat</span>
            <button className="closeChatBtn" onClick={toggleChat}><FiX size={20} /></button>
          </div>
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
    </>
  );
}