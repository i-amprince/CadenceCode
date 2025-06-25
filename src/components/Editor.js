// src/components/Editor.js

import React, { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { socket } from '../socket';
import './Editor.css'; // Don't forget to create this CSS file

const Editor = ({ roomId, onCodeChange }) => {
    const [code, setCode] = useState('');
    const [output, setOutput] = useState([]); // State for the output console

    // --- This effect listens for incoming code changes from other users ---
    useEffect(() => {
        const handleCodeChange = ({ code: newCode }) => {
            if (newCode !== null) {
                setCode(newCode);
            }
        };
        socket.on('CODE_CHANGE', handleCodeChange);

        return () => {
            socket.off('CODE_CHANGE', handleCodeChange);
        };
    }, []);

    // --- NEW: This effect listens for the code execution result from the server ---
    useEffect(() => {
        const handleOutput = ({ output }) => {
            setOutput(output);
        };
        socket.on('CODE_OUTPUT', handleOutput);

        return () => {
            socket.off('CODE_OUTPUT', handleOutput);
        };
    }, []);


    // This function sends your code changes to others
    const sendCodeChange = (newCode) => {
        setCode(newCode);
        onCodeChange(newCode);
        socket.emit('CODE_CHANGE', {
            roomId,
            code: newCode,
        });
    };

    // --- MODIFIED: This function now sends the code to the server for execution ---
    const runCode = () => {
        setOutput(['Running code on the server...']); // Give immediate feedback
        socket.emit('RUN_CODE', {
            code: code,
            languageId: 93, // 93 is the ID for JavaScript (Node.js) on Judge0
        });
    };

    return (
        <div className="editorContainer">
            <div className="editorPane">
                <CodeMirror
                    value={code}
                    height="calc(100vh - 200px)" // Make space for the output panel
                    theme={dracula}
                    extensions={[javascript({ jsx: true })]}
                    onChange={sendCodeChange}
                    style={{ fontSize: 16 }}
                />
            </div>

            <div className="runBar">
                <button className="runBtn" onClick={runCode}>Run</button>
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