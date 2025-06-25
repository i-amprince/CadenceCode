import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import { Toaster } from 'react-hot-toast'; // <-- 1. IMPORT THE TOASTER


import Home from './pages/Home';
import EditorPage from './pages/EditorPage';

const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/editor/:roomId",
    element: <EditorPage />,
  },
]);

function App() {
  return (
    <>
      <div>
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
              }
            },
            error: {
              style: {
                background: '#ff5555', 
                color: '#ffffff',   
              },
            },
          }}
        ></Toaster>
      </div>

      <RouterProvider router={router} />
    </>
  );
}

export default App;