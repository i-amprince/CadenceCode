import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import {jwtDecode} from 'jwt-decode';
import toast from 'react-hot-toast';

export default function Login() {
  const handleSuccess = async (credentialResponse) => {
    const { credential } = credentialResponse;
    const decoded = jwtDecode(credential);

    try {
      const res = await axios.post('http://localhost:5000/api/auth/google', {
        token: credential,
      });

      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(decoded));
      toast.success('Logged in!');
      window.location.href = '/'; // Redirect to home/dashboard
    } catch (err) {
      console.error(err);
      toast.error('Login failed');
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Login with Google</h2>
      <GoogleLogin onSuccess={handleSuccess} onError={() => toast.error('Google Login Failed')} />
    </div>
  );
}
