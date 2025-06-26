import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import {jwtDecode} from 'jwt-decode';
import toast from 'react-hot-toast';
import styles from './Login.module.css'; // Import the CSS module

import LogoImg from '../Images/img.svg'; // Import your logo image

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

  const handleError = () => {
    toast.error('Google Login Failed');
  };

  return (
    <div className={styles.loginPageWrapper}>
      <div className={styles.loginFormWrapper}>
        {/* NEW: App Logo and Name Header */}
        <div className={styles.appHeader}>
          <img
            className={styles.loginPageLogo}
            src={LogoImg}
            alt="CodeSync Logo"
          />
          <h1 className={styles.appName}>CadenceCode</h1>
        </div>

        <h2 className={styles.mainLabel}>Login with Google</h2>

        <GoogleLogin
          onSuccess={handleSuccess}
          onError={handleError}
          render={({ onClick, disabled }) => (
            <button
              onClick={onClick}
              disabled={disabled}
              className={styles.googleLoginBtn}
              aria-label="Sign in with Google"
            >
              <svg className={styles.googleIcon} width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19.6 10.29C19.6 9.54 19.53 8.78 19.4 8.04H10V11.83H15.48C15.22 12.87 14.54 13.79 13.62 14.4C12.7 15.01 11.58 15.35 10 15.35C7.45 15.35 5.25 13.56 4.47 11.1H0.59C1.94 14.15 4.88 16.35 8.36 16.35C10.74 16.35 12.82 15.54 14.31 14.17L17.15 17.01C15.22 18.73 12.74 19.6 10 19.6C4.51 19.6 0 15.11 0 9.8C0 4.49 4.51 0 10 0C12.81 0 15.28 1.05 17.14 2.87L14.31 5.71C13.23 4.7 11.75 4.14 10 4.14C7.4 4.14 5.17 5.86 4.38 8.28H19.4C19.53 8.78 19.6 9.54 19.6 10.29Z" fill="currentColor"/>
              </svg>
              <span>Sign in with Google</span>
            </button>
          )}
        />
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