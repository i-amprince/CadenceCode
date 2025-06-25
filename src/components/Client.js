// src/components/Client.js

import React from 'react';
import Avatar from 'react-avatar';
import './Client.css';

// Accept the 'isCurrentUser' prop
const Client = ({ username, isCurrentUser }) => {
    // Conditionally add a 'currentUser' class if the prop is true
    const clientClassName = `client ${isCurrentUser ? 'currentUser' : ''}`;

    return (
        <div className={clientClassName}>
            <Avatar name={username} size="50" round="14px" />
            <span className="username">
                {username}
                {/* Conditionally render the '(You)' label */}
                {isCurrentUser && <span className="youLabel"> (You)</span>}
            </span>
        </div>
    );
};

export default Client;