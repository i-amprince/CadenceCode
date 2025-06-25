// src/components/Editor.js

import React, { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { socket } from '../socket';
import toast from 'react-hot-toast';
import './Editor.css';

const LANGUAGES = {
    javascript: { id: 93, label: 'JavaScript (Node.js)', ext: 'js' },
    python: { id: 71, label: 'Python', ext: 'py' },
    cpp: { id: 54, label: 'C++', ext: 'cpp' },
    java: { id: 62, label: 'Java', ext: 'java' },
};

const Editor = ({ roomId, onCodeChange }) => {
    const [code, setCode] = useState('');
    const [output, setOutput] = useState([]);
    const [language, setLanguage] = useState('javascript');

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
        };
        socket.on('SAVE_SUCCESS', handleSaveSuccess);

        return () => socket.off('SAVE_SUCCESS', handleSaveSuccess);
    }, []);

    const sendCodeChange = (newCode) => {
        setCode(newCode);
        onCodeChange(newCode);
        socket.emit('CODE_CHANGE', {
            roomId,
            code: newCode,
        });
    };

    const handleLanguageChange = (e) => {
        setLanguage(e.target.value);
    };

    const runCode = () => {
        setOutput(['Running code on the server...']);
        socket.emit('RUN_CODE', {
            code,
            languageId: LANGUAGES[language].id,
        });
    };

    const saveCode = () => {
        socket.emit('SAVE_CODE', {
            roomId,
            code,
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
    };

    return (
        <div className="editorContainer">
            <div className="editorHeader">
                <select
                    className="languageSelect"
                    value={language}
                    onChange={handleLanguageChange}
                >
                    {Object.entries(LANGUAGES).map(([key, val]) => (
                        <option key={key} value={key}>
                            {val.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="editorPane">
                <CodeMirror
                    value={code}
                    height="calc(100vh - 240px)"
                    theme={dracula}
                    extensions={[javascript({ jsx: true })]}  // Note: Static JS syntax highlighting
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
                    {output.map((line, index) => (
                        <div key={index}>{`> ${line}`}</div>
                    ))}
                </pre>
            </div>
        </div>
    );
};

export default Editor;
