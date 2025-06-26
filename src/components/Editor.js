// src/components/Editor.js

import React, { useEffect, useState, useRef } from 'react'; // Added useRef
import CodeMirror from '@uiw/react-codemirror';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { autocompletion } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { socket } from '../socket';
import toast from 'react-hot-toast';
import './Editor.css'; // Ensure this path is correct

const LANGUAGES = {
  javascript: { id: 93, label: 'JavaScript (Node.js)', ext: 'js' },
  python: { id: 71, label: 'Python', ext: 'py' },
  cpp: { id: 54, label: 'C++', ext: 'cpp' },
  java: { id: 62, label: 'Java', ext: 'java' },
};

const getLanguageExtension = (lang) => {
  switch (lang) {
    case 'javascript': return javascript({ jsx: true });
    case 'python': return python();
    case 'cpp': return cpp();
    case 'java': return java();
    default: return javascript({ jsx: true });
  }
};

const Editor = ({ roomId, onCodeChange }) => {
  const [code, setCode] = useState('');
  const [output, setOutput] = useState([]);
  const [language, setLanguage] = useState('javascript');
  const [checkpoints, setCheckpoints] = useState([]);
  const [recentCheckpoints, setRecentCheckpoints] = useState([]);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatMessagesRef = useRef(null); // Ref for scrolling chat to bottom

  // Assuming 'user' is stored in localStorage after login
  const user = JSON.parse(localStorage.getItem('user')) || { name: 'Guest' }; // Default to Guest

  // Scroll chat messages to bottom on new message
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    const handleCodeChange = ({ code: newCode }) => {
      if (newCode !== null) setCode(newCode);
    };
    socket.on('CODE_CHANGE', handleCodeChange);
    return () => socket.off('CODE_CHANGE', handleCodeChange);
  }, []);

  useEffect(() => {
    const handleOutput = ({ output }) => setOutput(output);
    socket.on('CODE_OUTPUT', handleOutput);
    return () => socket.off('CODE_OUTPUT', handleOutput);
  }, []);

  useEffect(() => {
    const handleSaveSuccess = () => {
      toast.success('Code saved successfully!');
      fetchCheckpoints();
    };
    socket.on('SAVE_SUCCESS', handleSaveSuccess);
    return () => socket.off('SAVE_SUCCESS', handleSaveSuccess);
  }, []);

  useEffect(() => {
    fetchCheckpoints();
  }, [roomId]);

  const fetchCheckpoints = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/room/${roomId}/checkpoints`);
      const data = await res.json();
      setCheckpoints(data.checkpoints || []);
    } catch (err) {
      toast.error('Failed to load checkpoints');
    }
  };

  const sendCodeChange = (newCode) => {
    setCode(newCode);
    onCodeChange(newCode);
    socket.emit('CODE_CHANGE', { roomId, code: newCode });
  };

  const handleLanguageChange = (e) => setLanguage(e.target.value);

  const runCode = () => {
    setOutput(['Running code on the server...']);
    socket.emit('RUN_CODE', {
      code,
      languageId: LANGUAGES[language].id,
    });
  };

  const saveCode = () => {
    socket.emit('SAVE_CODE', { roomId, code });

    const checkpoint = {
      code,
      savedAt: new Date().toISOString(),
    };

    setRecentCheckpoints((prev) => {
      const updated = [checkpoint, ...prev];
      return updated.slice(0, 5);
    });
  };

  const exportCode = () => {
    const ext = LANGUAGES[language].ext;
    const fileBlob = new Blob([code], { type: 'text/plain' });
    const fileUrl = URL.createObjectURL(fileBlob);
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = `code-${roomId}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(fileUrl);
    toast.success('Code exported successfully!');
  };

  const restoreCode = (codeToRestore) => {
    if (!codeToRestore) {
      toast.error('Checkpoint code is undefined.');
      return;
    }
    setCode(codeToRestore);
    onCodeChange(codeToRestore);
    socket.emit('CODE_CHANGE', { roomId, code: codeToRestore });
    toast.success('Code restored from checkpoint');
  };

  const mergedCheckpoints = [...recentCheckpoints, ...checkpoints].slice(0, 5);

  // ----- Chat Logic -----
  useEffect(() => {
    socket.on('CHAT_MESSAGE', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });
    return () => socket.off('CHAT_MESSAGE');
  }, []);

  const sendChatMessage = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    socket.emit('CHAT_MESSAGE', {
      roomId,
      username: user.name, // Use the user's name
      message: trimmed,
    });

    setChatInput('');
  };

  return (
    <div className="editorContainer">
      <div className="editorMain">
        <div className="editorHeader">
          <select className="languageSelect" value={language} onChange={handleLanguageChange}>
            {Object.entries(LANGUAGES).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          <select
            className="checkpointDropdown"
            onChange={(e) => {
              const index = parseInt(e.target.value);
              if (!isNaN(index) && mergedCheckpoints[index]) {
                restoreCode(mergedCheckpoints[index].code);
              }
            }}
          >
            <option value="">🕒 Restore Checkpoint</option>
            {mergedCheckpoints.map((cp, i) => (
              <option key={i} value={i}>
                {new Date(cp.savedAt).toLocaleTimeString()}
              </option>
            ))}
          </select>
        </div>

        <div className="editorPane">
          <CodeMirror
            value={code}
            height="calc(100vh - 300px)" // Adjusted height to accommodate header, run bar, and output
            theme={dracula}
            extensions={[
              getLanguageExtension(language),
              autocompletion({ activateOnTyping: true }),
            ]}
            onChange={sendCodeChange}
            style={{ fontSize: 16 }}
          />
        </div>

        <div className="runBar">
          <button className="runBtn" onClick={runCode}>▶ Run</button>
          <button className="saveBtn" onClick={saveCode}>💾 Save</button>
          <button className="exportBtn" onClick={exportCode}>⬇ Export</button>
        </div>

        <div className="outputWrap">
          <pre className="outputConsole">
            {output.length > 0 ? (
              output.map((line, i) => <div key={i}>{`> ${line}`}</div>)
            ) : (
              <div>> Output will appear here.</div>
            )}
          </pre>
        </div>
      </div>

      <div className="chatPanel">
        <div className="chatHeader">💬 Room Chat</div>

        <div className="chatMessages" ref={chatMessagesRef}>
          {chatMessages.map((msg, i) => (
            <div key={i} className="chatMessage">
              <strong>{msg.username}:</strong> <span>{msg.message}</span>
            </div>
          ))}
        </div>

        <div className="chatInputWrap">
          <input
            type="text"
            placeholder="Type your message..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
            className="chatInput"
          />
          <button onClick={sendChatMessage} className="chatSendBtn">Send</button>
        </div>
      </div>
    </div>
  );
};

export default Editor;