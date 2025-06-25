import React, { useState } from 'react';
import { v4 as uuidV4 } from 'uuid';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

// Your assets
import LogoImg from '../Images/img.svg';
// Import the CSS module
import styles from './Home.module.css';

export default function Home() {
    const navigate = useNavigate();

    const [roomId, setRoomId] = useState('');
    const [username, setUsername] = useState('');

    // Function to create a new room and update the input field
    const createNewRoom = (e) => {
        e.preventDefault(); // Prevent the default anchor tag behavior
        const id = uuidV4();
        setRoomId(id);
        toast.success('New Room Created!');
    };

    // Function to join a room
    const joinRoom = () => {
        // Validate inputs
        if (!roomId || !username) {
            toast.error('Room ID & Username are required.');
            return;
        }

        // Redirect to the editor page, passing username via state
        navigate(`/editor/${roomId}`, {
            state: {
                username,
            },
        });
    };

    // Handle 'Enter' key press in inputs to join the room
    const handleInputEnter = (e) => {
        if (e.code === 'Enter') {
            joinRoom();
        }
    };

    return (
        <div className={styles.homePageWrapper}>
            <div className={styles.formWrapper}>
                <img
                    className={styles.homePageLogo}
                    src={LogoImg}
                    alt="Sync Code Logo"
                />
                <h4 className={styles.mainLabel}>Enter Invitation ROOM ID</h4>

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
                    <button className={`${styles.btn} ${styles.joinBtn}`} onClick={joinRoom}>
                        Join
                    </button>
                    <span className={styles.createInfo}>
                        Don't have an invite? Create your own 
                        <a
                            onClick={createNewRoom}
                            href=""
                            className={styles.createNewBtn}
                        >
                            room
                        </a>
                    </span>
                </div>
            </div>

            <footer className={styles.footer}>
                <h4>
                    Built with ❤️ by{' '}
                    <a href="https://github.com/your-github-username" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
                        Prince
                    </a>
                </h4>
            </footer>
        </div>
    );
}