import React, { useState, useRef } from 'react';
import Link from 'next/link';

interface LayoutProps {
  children: React.ReactNode;
  onFileUpload?: (file: File) => void;
  onPastePGN?: () => void;
  onPasteFEN?: () => void;
  onAddBoard?: () => void;
}

export default function Layout({ children, onFileUpload, onPastePGN, onPasteFEN, onAddBoard }: LayoutProps) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleMenuMouseEnter = (menu: 'file' | 'edit') => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    if (menu === 'file') {
      setShowFileMenu(true);
      setShowEditMenu(false);
    } else {
      setShowEditMenu(true);
      setShowFileMenu(false);
    }
  };

  const handleMenuMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setShowFileMenu(false);
      setShowEditMenu(false);
    }, 300); // 300ms delay before closing
  };

  return (
    <div className="min-h-screen bg-[#1E1E2E]">
      {/* Top Menu Bar */}
      <div className="fixed top-0 left-0 right-0 h-8 bg-[#252538] border-b border-[#383852] flex items-center space-x-1 px-2 text-gray-300 text-sm z-50">
        {/* App Logo */}
        <div className="flex items-center px-2">
          <span className="text-xl text-[#6B8AFF]">♟</span>
        </div>
        
        {/* Menu Items */}
        <div className="relative group"
          onMouseEnter={() => handleMenuMouseEnter('file')}
          onMouseLeave={handleMenuMouseLeave}
        >
          <button 
            className={`px-3 py-1 hover:bg-[#383852] rounded ${showFileMenu ? 'bg-[#383852]' : ''}`}
            onClick={() => {
              setShowFileMenu(!showFileMenu);
              setShowEditMenu(false);
            }}
          >
            File
          </button>
          {showFileMenu && (
            <div 
              className="absolute top-full left-0 mt-1 bg-[#252538] border border-[#383852] rounded-lg shadow-lg py-1 min-w-[160px]"
              onMouseEnter={() => {
                if (closeTimeoutRef.current) {
                  clearTimeout(closeTimeoutRef.current);
                }
              }}
              onMouseLeave={handleMenuMouseLeave}
            >
              <button 
                onClick={() => {
                  console.log('Open PGN button clicked');
                  // Create and trigger a file input directly
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.pgn';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file && onFileUpload) {
                      console.log('File selected:', file.name);
                      onFileUpload(file);
                    }
                  };
                  input.click();
                  handleMenuMouseLeave();
                }}
                className="w-full px-4 py-2 text-left hover:bg-[#383852] flex items-center gap-2"
              >
                <span>📁</span> Open PGN
              </button>
              <button 
                onClick={() => {
                  if (onAddBoard) {
                    onAddBoard();
                    handleMenuMouseLeave();
                  }
                }}
                className="w-full px-4 py-2 text-left hover:bg-[#383852] flex items-center gap-2"
              >
                <span>➕</span> Add Board
              </button>
            </div>
          )}
        </div>
        <div className="relative group"
          onMouseEnter={() => handleMenuMouseEnter('edit')}
          onMouseLeave={handleMenuMouseLeave}
        >
          <button 
            className={`px-3 py-1 hover:bg-[#383852] rounded ${showEditMenu ? 'bg-[#383852]' : ''}`}
            onClick={() => {
              setShowEditMenu(!showEditMenu);
              setShowFileMenu(false);
            }}
          >
            Edit
          </button>
          {showEditMenu && (
            <div 
              className="absolute top-full left-0 mt-1 bg-[#252538] border border-[#383852] rounded-lg shadow-lg py-1 min-w-[160px]"
              onMouseEnter={() => {
                if (closeTimeoutRef.current) {
                  clearTimeout(closeTimeoutRef.current);
                }
              }}
              onMouseLeave={handleMenuMouseLeave}
            >
              <button 
                onClick={async () => {
                  if (onPastePGN) {
                    onPastePGN();
                    handleMenuMouseLeave();
                  }
                }}
                className="w-full px-4 py-2 text-left hover:bg-[#383852] flex items-center gap-2"
              >
                <span>📋</span> Paste PGN
              </button>
              <button 
                onClick={async () => {
                  if (onPasteFEN) {
                    onPasteFEN();
                    handleMenuMouseLeave();
                  }
                }}
                className="w-full px-4 py-2 text-left hover:bg-[#383852] flex items-center gap-2"
              >
                <span>♟</span> Paste FEN
              </button>
            </div>
          )}
        </div>
        <button className="px-3 py-1 hover:bg-[#383852] rounded">View</button>
        <button className="px-3 py-1 hover:bg-[#383852] rounded">Window</button>
        <button className="px-3 py-1 hover:bg-[#383852] rounded">Help</button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed top-8 left-0 bottom-0 bg-[#252538] border-r border-[#383852] z-30 transition-all duration-300 ${
        isSidebarExpanded ? 'w-64' : 'w-16'
      }`}>
        <nav className="flex flex-col h-full">
          {/* Hamburger Menu */}
          <button 
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className="p-3 text-gray-400 hover:text-white hover:bg-[#383852] flex items-center justify-center border-b border-[#383852]"
          >
            <span className="text-xl">≡</span>
          </button>

          {/* Main Navigation */}
          <div className="flex-1 overflow-y-auto">
            <div className="py-2">
              <Link href="/learn">
                <div className={`flex items-center text-gray-400 hover:text-white hover:bg-[#383852] ${
                  isSidebarExpanded ? 'px-4 py-2' : 'p-3 flex-col items-center'
                }`}>
                  <span className="text-2xl">📚</span>
                  <span className={`${isSidebarExpanded ? 'ml-3' : 'text-[10px] mt-1'}`}>Learn</span>
                </div>
                {isSidebarExpanded && (
                  <div className="ml-8 mt-1 space-y-1">
                    <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Opening Training</div>
                    <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Endgame Practice</div>
                    <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Tactics Training</div>
                  </div>
                )}
              </Link>

              <Link href="/train">
                <div className={`flex items-center text-gray-400 hover:text-white hover:bg-[#383852] ${
                  isSidebarExpanded ? 'px-4 py-2' : 'p-3 flex-col items-center'
                }`}>
                  <span className="text-2xl">⚔️</span>
                  <span className={`${isSidebarExpanded ? 'ml-3' : 'text-[10px] mt-1'}`}>Train</span>
                </div>
                {isSidebarExpanded && (
                  <div className="ml-8 mt-1 space-y-1">
                    <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Daily Puzzles</div>
                    <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Custom Training</div>
                  </div>
                )}
              </Link>

              <Link href="/tactics">
                <div className={`flex items-center text-gray-400 hover:text-white hover:bg-[#383852] ${
                  isSidebarExpanded ? 'px-4 py-2' : 'p-3 flex-col items-center'
                }`}>
                  <span className="text-2xl">🎯</span>
                  <span className={`${isSidebarExpanded ? 'ml-3' : 'text-[10px] mt-1'}`}>Tactics</span>
                </div>
                {isSidebarExpanded && (
                  <div className="ml-8 mt-1 space-y-1">
                    <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Puzzle Rush</div>
                    <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Puzzle Battle</div>
                    <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Custom Puzzles</div>
                  </div>
                )}
              </Link>

              <Link href="/game">
                <div className={`flex items-center text-gray-400 hover:text-white hover:bg-[#383852] ${
                  isSidebarExpanded ? 'px-4 py-2' : 'p-3 flex-col items-center'
                }`}>
                  <span className="text-2xl">♟</span>
                  <span className={`${isSidebarExpanded ? 'ml-3' : 'text-[10px] mt-1'}`}>Game</span>
                </div>
                {isSidebarExpanded && (
                  <div className="ml-8 mt-1 space-y-1">
                    <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Play vs Computer</div>
                    <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Analysis Board</div>
                    <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Import Game</div>
                    <Link href="/stockfish">
                      <div className="px-4 py-1 text-sm text-gray-300 hover:bg-[#383852] rounded">Stockfish Tester</div>
                    </Link>
                  </div>
                )}
              </Link>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="p-2 border-t border-[#383852]">
            <button className="w-full p-2 text-gray-400 hover:text-white hover:bg-[#383852] rounded">
              <span className="text-xl">⚙️</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className={`pt-8 transition-all duration-300 ${isSidebarExpanded ? 'pl-64' : 'pl-16'}`}>
        {/* Main Content */}
        <main className="p-4">
          {children}
        </main>
      </div>
    </div>
  );
} 