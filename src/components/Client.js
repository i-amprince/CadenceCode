// src/components/Client.js

import React from 'react';
import Avatar from 'react-avatar';
import './Client.css';

const Client = ({ username, picture, isCurrentUser }) => {
    const clientClassName = `client ${isCurrentUser ? 'currentUser' : ''}`;

    return (
        <div className={clientClassName}>
            <Avatar name={username} size="50" round="14px" src={picture} />
            <span className="username">
                {username}
                {isCurrentUser && <span className="youLabel"> (You)</span>}
            </span>
        </div>
    );
};

export default Client;
