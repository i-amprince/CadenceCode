import React, { useState } from 'react';
import Avatar from 'react-avatar';
import './Client.css';
import { socket } from '../socket';

const Client = ({
  username,
  picture,
  socketId,
  mySocketId,
  email,
  ownerEmail,
}) => {
  const [imgSrc, setImgSrc] = useState(picture);
  const clientClassName = `client ${socketId === mySocketId ? 'currentUser' : ''}`;

  const isOwner = email === ownerEmail;
  const amIOwner = ownerEmail && mySocketId && email !== undefined && ownerEmail === JSON.parse(localStorage.getItem('user'))?.email;

  const handleKick = () => {
    if (window.confirm(`Kick ${username}?`)) {
      socket.emit('KICK_USER', { socketId });
    }
  };

  return (
    <div className={clientClassName}>
      <Avatar
        name={username}
        src={imgSrc}
        size="50"
        round="14px"
        onError={() => setImgSrc(null)}
      />
      <span className="username">
        {username}
        {isOwner && <span className="ownerLabel"> (Owner)</span>}
        {socketId === mySocketId && <span className="youLabel"> (You)</span>}
        {amIOwner && socketId !== mySocketId && !isOwner && (
          <span className="kickBtn" onClick={handleKick}>❌ Kick</span>
        )}
      </span>
    </div>
  );
};

export default Client;
