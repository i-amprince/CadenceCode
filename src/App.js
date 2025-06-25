import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { GoogleOAuthProvider } from '@react-oauth/google';

import Home from './pages/Home';
import EditorPage from './pages/EditorPage';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute'; // ✅ only this one

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Home />
      </ProtectedRoute>
    ),
  },
  {
    path: '/editor/:roomId',
    element: (
      <ProtectedRoute>
        <EditorPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/login',
    element: <Login />,
  },
]);

function App() {
  return (
    <GoogleOAuthProvider clientId="533671388387-m71d70069k6rklr4l8tod7pnosb1770c.apps.googleusercontent.com">
      <Toaster
        position="top-right"
        toastOptions={{
          success: {
            style: {
              background: '#4aee88',
              color: '#1c1c1c',
            },
            iconTheme: {
              primary: '#1c1c1c',
              secondary: '#4aee88',
            },
          },
          error: {
            style: {
              background: '#ff5555',
              color: '#ffffff',
            },
          },
        }}
      />
      <RouterProvider router={router} />
    </GoogleOAuthProvider>
  );
}

export default App;
