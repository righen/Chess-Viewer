'use client';

import React, { useCallback } from 'react';
import ChessViewer, { ChessViewerHandle } from './components/ChessViewer';
import Layout from './components/Layout';

export default function Home() {
  const viewer = React.useRef<ChessViewerHandle>(null);
  
  const handleFileUpload = useCallback((file: File) => {
    console.log('File upload triggered:', file.name); // Debug log
    if (viewer.current) {
      viewer.current.handleFileUpload(file);
    } else {
      console.error('ChessViewer ref not available');
    }
  }, []);

  const handlePaste = useCallback(() => {
    console.log('Paste triggered'); // Debug log
    if (viewer.current) {
      viewer.current.handlePaste();
    } else {
      console.error('ChessViewer ref not available');
    }
  }, []);

  return (
    <Layout 
      onFileUpload={handleFileUpload}
      onPastePGN={handlePaste}
    >
      <ChessViewer ref={viewer} />
    </Layout>
  );
} 