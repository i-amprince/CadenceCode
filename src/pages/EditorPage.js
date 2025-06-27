import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { socket } from '../socket';
import Client from '../components/Client';
import Editor from '../components/Editor';
import VoiceChat from './VoiceChat';
import LogoImg from '../Images/img.svg';
import './EditorPage.css';

export default function EditorPage() {
  const codeRef = useRef({});
  const location = useLocation();
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [creator, setCreator] = useState('');
  const user = JSON.parse(localStorage.getItem('user'));
  const currentEmail = user?.email;

  useEffect(() => {
    if (!location.state) {
      navigate('/');
    }
  }, [location.state, navigate]);

  useEffect(() => {
    if (!location.state) return;

    const handleJoined = ({ clients, username, socketId }) => {
      if (username !== location.state?.username) {
        toast.success(`${username} joined the room.`);
      }
      setClients(clients);

      // Send latest code to the newly joined client
      if (codeRef.current && typeof codeRef.current === 'object') {
        for (const [fileName, code] of Object.entries(codeRef.current)) {
          socket.emit('CODE_CHANGE', { roomId, fileName, code });
        }
      }
    };

    const handleDisconnected = ({ socketId, username }) => {
      toast.error(`${username} left the room.`);
      setClients((prev) =>
        prev.filter((client) => client.socketId !== socketId)
      );
    };

    const handleKicked = () => {
      toast.error('You were removed from the room.');
      navigate('/');
    };

    socket.connect();
    socket.emit('JOIN', {
      roomId,
      username: location.state?.username,
      picture: user?.picture,
    });

    socket.on('JOINED', handleJoined);
    socket.on('DISCONNECTED', handleDisconnected);
    socket.on('KICKED', handleKicked);

    return () => {
      socket.disconnect();
      socket.off('JOINED', handleJoined);
      socket.off('DISCONNECTED', handleDisconnected);
      socket.off('KICKED', handleKicked);
    };
  }, [location.state, navigate, roomId, user?.picture]);

  useEffect(() => {
    fetch(`http://localhost:5000/api/room/${roomId}/info`)
      .then((res) => res.json())
      .then((data) => setCreator(data.creator))
      .catch(() => {});
  }, [roomId]);

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success('Room ID has been copied to your clipboard');
    } catch (err) {
      toast.error('Could not copy the Room ID');
    }
  };

  const leaveRoom = () => {
    navigate('/');
  };

  if (!location.state) return null;

  return (
    <div className="mainWrap">
      <div className="aside">
        <div className="asideInner">
          <div className="app-header">
            <img className="logo-image" src={LogoImg} alt="CadenceCode Logo" />
            <h1 className="app-name">CadenceCode</h1>
          </div>

          <div className="connected-section">
            <h3>Connected</h3>
            <div className="clientsList">
              <div className="clientsList-scroll">
                {clients.map((client) => (
                  <Client
                    key={client.socketId}
                    username={client.username}
                    picture={client.picture}
                    socketId={client.socketId}
                    mySocketId={socket.id}
                    isOwner={creator === currentEmail}
                    myEmail={currentEmail}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Voice Chat header OUTSIDE box */}
          <h3 className="voice-chat-header">Voice Chat</h3>
          <div className="voiceChatWrapper">
            <VoiceChat roomId={roomId} userList={clients} showHeader={false} />
          </div>

          <div className="button-container">
            <button className="btn copyBtn" onClick={copyRoomId}>Copy ROOM ID</button>
            <button className="btn leaveBtn" onClick={leaveRoom}>Leave</button>
          </div>
        </div>
      </div>

      <div className="editorWrap">
        <Editor
          roomId={roomId}
          onCodeChange={(codeObj) => {
            codeRef.current = codeObj;
          }}
        />
      </div>
    </div>
  );
}