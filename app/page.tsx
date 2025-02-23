'use client';

import React, { useState } from 'react';
import ChessViewer from './components/ChessViewer';
import StockfishTest from './components/StockfishTest';

export default function Home() {
  const [currentView, setCurrentView] = useState<'viewer' | 'stockfish'>('viewer');

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-100">
      <div className="container mx-auto">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-6 text-gray-800">
            Chess Analysis Platform
          </h1>
          <div className="flex gap-4">
            <button
              onClick={() => setCurrentView('viewer')}
              className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                currentView === 'viewer'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Chess Viewer
            </button>
            <button
              onClick={() => setCurrentView('stockfish')}
              className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                currentView === 'stockfish'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Stockfish Analysis
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          {currentView === 'viewer' ? (
            <div>
              <h2 className="text-2xl font-bold mb-4 text-gray-800">Chess Game Viewer</h2>
              <p className="text-gray-600 mb-6">
                Upload and analyze your chess games. View moves, explore variations, and study positions.
              </p>
              <ChessViewer />
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold mb-4 text-gray-800">Stockfish Analysis</h2>
              <p className="text-gray-600 mb-6">
                Analyze positions with Stockfish chess engine. Get instant evaluations and best moves.
              </p>
              <StockfishTest />
            </div>
          )}
        </div>
      </div>
    </main>
  );
} 