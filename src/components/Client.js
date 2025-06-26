// src/components/Client.js

import React from 'react';
import Avatar from 'react-avatar';
import './Client.css';
import { socket } from '../socket';

const Client = ({
  username,
  picture,
  socketId,
  mySocketId,
  isOwner,
  myEmail,
}) => {
  const clientClassName = `client ${socketId === mySocketId ? 'currentUser' : ''}`;

  const handleKick = () => {
    if (window.confirm(`Kick ${username}?`)) {
      socket.emit('KICK_USER', { socketId });
    }
  };

  return (
    <div className={clientClassName}>
      <Avatar name={username} src={picture} size="50" round="14px" />
      <span className="username">
        {username}
        {socketId === mySocketId && <span className="youLabel"> (You)</span>}
        {isOwner && socketId !== mySocketId && (
          <span className="kickBtn" onClick={handleKick}>❌ Kick</span>
        )}
      </span>
    </div>
  );
};

export default Client;
