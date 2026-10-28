// Only /meet/:slug, with the real MeetRoomPage — see run.mjs.
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MeetRoomPage from '@/pages/MeetRoomPage';
import { Toaster } from '@/components/ui/toaster';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes><Route path="/meet/:slug" element={<MeetRoomPage />} /></Routes>
    <Toaster />
  </BrowserRouter>,
);
