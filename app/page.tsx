'use client';

import React, { useCallback, useState } from 'react';
import ChessViewer, { ChessViewerHandle } from './components/ChessViewer';
import Layout from './components/Layout';

interface ChessTab {
  id: string;
  name: string;
  ref: React.MutableRefObject<ChessViewerHandle | null>;
}

export default function Home() {
  const [tabs, setTabs] = useState<ChessTab[]>([
    {
      id: '1',
      name: 'Board 1',
      ref: React.useRef<ChessViewerHandle>(null)
    }
  ]);
  const [activeTabId, setActiveTabId] = useState('1');

  const createNewRef = () => ({
    current: null
  }) as React.MutableRefObject<ChessViewerHandle | null>;

  const handleAddBoard = useCallback(() => {
    const newId = (tabs.length + 1).toString();
    setTabs(prev => [...prev, {
      id: newId,
      name: `Board ${newId}`,
      ref: createNewRef()
    }]);
    setActiveTabId(newId);
  }, [tabs.length]);

  const handleCloseTab = useCallback((id: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(tab => tab.id !== id);
      if (activeTabId === id && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      }
      return newTabs;
    });
  }, [activeTabId]);

  const handleFileUpload = useCallback((file: File) => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (activeTab?.ref.current) {
      activeTab.ref.current.handleFileUpload(file);
    } else {
      console.error('ChessViewer ref not available');
    }
  }, [activeTabId, tabs]);

  const handlePaste = useCallback(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (activeTab?.ref.current) {
      activeTab.ref.current.handlePaste();
    } else {
      console.error('ChessViewer ref not available');
    }
  }, [activeTabId, tabs]);

  const handlePasteFEN = useCallback(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (activeTab?.ref.current) {
      activeTab.ref.current.handlePasteFEN();
    } else {
      console.error('ChessViewer ref not available');
    }
  }, [activeTabId, tabs]);

  return (
    <Layout 
      onFileUpload={handleFileUpload}
      onPastePGN={handlePaste}
      onPasteFEN={handlePasteFEN}
      onAddBoard={handleAddBoard}
    >
      <div className="flex flex-col h-full">
        {/* Tab Bar */}
        <div className="flex bg-[#252538] border-b border-[#383852] overflow-x-auto">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center px-4 py-2 border-r border-[#383852] cursor-pointer ${
                activeTabId === tab.id ? 'bg-[#383852] text-white' : 'text-gray-400 hover:bg-[#2f2f47]'
              }`}
            >
              <span onClick={() => setActiveTabId(tab.id)}>{tab.name}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  className="ml-2 px-1 hover:bg-[#4a4a6a] rounded"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        
        {/* Chess Viewers */}
        <div className="flex-1">
          {tabs.map(tab => (
            <div key={tab.id} style={{ display: activeTabId === tab.id ? 'block' : 'none' }}>
              <ChessViewer ref={tab.ref} id={tab.id} name={tab.name} />
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
} 