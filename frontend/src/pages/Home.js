import React, { useState } from 'react';
import { v4 as uuidV4 } from 'uuid';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

import LogoImg from '../Images/img.svg'; 
import styles from './Home.module.css';

export default function Home() {
    const navigate = useNavigate();
    const [roomId, setRoomId] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

   //geenerating room ID 
    const generateRoomId = (e) => {
        e.preventDefault();
        const id = uuidV4();
        setRoomId(id);
        toast.success(`Room ID Generated`);
    };

    //Create room 
    const createNewRoom = async (e) => {
        e.preventDefault();

        if (!roomId) {
            toast.error('Please generate a Room ID first.');
            return;
        }

        if (!username || !password) {
            toast.error('Username and Password are required.');
            return;
        }

        try {
            const user = JSON.parse(localStorage.getItem('user'));
            await axios.post('http://localhost:5000/api/room/create', {
                roomId,
                password,
                creator: user?.email || username,
            });
            toast.success('Room Created Successfully!');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Room creation failed');
        }
    };

    const joinRoom = async () => {
        if (!roomId || !username || !password) {
            toast.error('Room ID, Username & Password are required.');
            return;
        }

        try {
            await axios.post('http://localhost:5000/api/room/join', {
                roomId,
                password,
            });

            navigate(`/editor/${roomId}`, {
                state: {
                    username,
                },
            });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Join failed');
        }
    };

    const handleInputEnter = (e) => {
        if (e.code === 'Enter') {
            joinRoom();
        }
    };

    return (
        <div className={styles.homePageWrapper}>
            <div className={styles.formWrapper}>
                

                <div className={styles.appHeader}>
                    <img
                        className={styles.homePageLogo}
                        src={LogoImg}
                        alt="CadenceCode Logo"
                    />
                    <h1 className={styles.appName}>CadenceCode</h1>
                </div>

                <h4 className={styles.mainLabel}>Join or Create a ROOM</h4>

                <div className={styles.inputGroup}>
                    <input
                        type="text"
                        className={styles.inputBox}
                        placeholder="ROOM ID"
                        onChange={(e) => setRoomId(e.target.value)}
                        value={roomId}
                        onKeyUp={handleInputEnter}
                    />
                    <input
                        type="text"
                        className={styles.inputBox}
                        placeholder="USERNAME"
                        onChange={(e) => setUsername(e.target.value)}
                        value={username}
                        onKeyUp={handleInputEnter}
                    />
                    <input
                        type="password"
                        className={styles.inputBox}
                        placeholder="Room Password (required)"
                        onChange={(e) => setPassword(e.target.value)}
                        value={password}
                        onKeyUp={handleInputEnter}
                    />
                    <button
                        className={`${styles.btn} ${styles.joinBtn}`}
                        onClick={joinRoom}
                    >
                        Join
                    </button>
                    <div className={styles.createInfo}>
                       
                       
                        <button
                            className={`${styles.btn} ${styles.generateBtn}`}
                            onClick={generateRoomId}
                        >
                            Generate Room ID
                        </button>
                        <button
                            className={`${styles.btn} ${styles.createBtn}`}
                            onClick={createNewRoom}
                        >
                            Create Room
                        </button>
                    </div>
                </div>
            </div>

            <footer className={styles.footer}>
                <h4>
                    Built with ❤️ by{' '}
                    <a href="https://github.com/i-amprince" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
                        Prince
                    </a>
                </h4>
            </footer>
        </div>
    );
}