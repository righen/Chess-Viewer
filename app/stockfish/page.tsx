'use client';

import React from 'react';
import Layout from '../components/Layout';
import StockfishTest from '../components/StockfishTest';

export default function StockfishPage() {
  return (
    <Layout>
      <div className="max-w-[1800px] mx-auto">
        <div className="bg-gray-900 rounded-lg shadow-lg shadow-black/20 p-6">
          <h1 className="text-2xl font-bold text-white mb-6">Stockfish Engine Tester</h1>
          <StockfishTest />
        </div>
      </div>
    </Layout>
  );
} 