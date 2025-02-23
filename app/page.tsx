'use client';

import React from 'react';
import StockfishTest from './components/StockfishTest';

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-100">
      <div className="container mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center text-gray-800">
          Stockfish Test Page
        </h1>
        <StockfishTest />
      </div>
    </main>
  );
} 