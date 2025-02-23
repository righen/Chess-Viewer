'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Square } from 'chess.js';

interface ChessGame {
  pgn: string;
  moves: string[];
  headers: Record<string, string>;
}

interface AnalysisMove {
  move: string;
  score: number;
  mate?: number;
  depth: number;
  nodes: number;
  nps: number;
  tbhits: number;
}

export default function ChessViewer() {
  const [games, setGames] = useState<ChessGame[]>([]);
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [chessboard, setChessboard] = useState(new Chess());
  const [boardWidth, setBoardWidth] = useState(400);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<{
    result: string;
    date: string;
    minMoves: number | null;
    maxMoves: number | null;
  }>({
    result: '',
    date: '',
    minMoves: null,
    maxMoves: null
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisMove[]>([]);
  const engineRef = useRef<Worker | null>(null);

  const currentGame = games[currentGameIndex];
  const whitePlayer = currentGame?.headers['White'] || 'White';
  const blackPlayer = currentGame?.headers['Black'] || 'Black';
  const result = currentGame?.headers['Result'] || '';

  const goToMove = useCallback((moveIndex: number) => {
    if (moveIndex < 0 || moveIndex >= currentGame?.moves.length) return;
    
    const newChess = new Chess();
    if (currentGame) {
      // Apply moves up to the selected index
      for (let i = 0; i <= moveIndex; i++) {
        newChess.move(currentGame.moves[i]);
      }
      
      setChessboard(newChess);
      setCurrentMoveIndex(moveIndex);
    }
  }, [currentGame]);

  useEffect(() => {
    const updateDimensions = () => {
      const containerWidth = window.innerWidth;
      let width;
      if (containerWidth >= 1280) { // xl screens
        width = 600;
      } else if (containerWidth >= 1024) { // lg screens
        width = 500;
      } else if (containerWidth >= 768) { // md screens
        width = 400;
      } else {
        width = Math.min(400, containerWidth - 32);
      }
      setBoardWidth(width);
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    // Initialize Stockfish as a Web Worker
    if (typeof window !== 'undefined') {
      try {
        // Check for WebAssembly support
        const wasmSupported = typeof WebAssembly === 'object' && 
          WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));

        // Create worker with appropriate version
        const worker = new Worker(wasmSupported ? '/stockfish.wasm.js' : '/stockfish.js');
        engineRef.current = worker;

        // Set up message handler
        worker.onmessage = (e) => {
          const message = e.data;
          if (typeof message !== 'string') return;

          if (message.startsWith('info depth')) {
            // Only process deep enough analysis
            if (!message.includes('depth 15')) return;

            const moveMatch = message.match(/pv ([a-h][1-8][a-h][1-8][qrbn]?\s*)+/);
            const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
            const depthMatch = message.match(/depth (\d+)/);
            const nodesMatch = message.match(/nodes (\d+)/);
            const npsMatch = message.match(/nps (\d+)/);
            const tbhitsMatch = message.match(/tbhits (\d+)/);
            
            if (moveMatch && scoreMatch) {
              const moves = moveMatch[0].split(' ').slice(1, 4); // Get first 3 moves
              const [, scoreType, scoreValue] = scoreMatch;
              const score = scoreType === 'cp' ? parseInt(scoreValue) / 100 : null;
              const mate = scoreType === 'mate' ? parseInt(scoreValue) : undefined;
              const depth = depthMatch ? parseInt(depthMatch[1]) : 0;
              const nodes = nodesMatch ? parseInt(nodesMatch[1]) : 0;
              const nps = npsMatch ? parseInt(npsMatch[1]) : 0;
              const tbhits = tbhitsMatch ? parseInt(tbhitsMatch[1]) : 0;
              
              setAnalysis(() => {
                const newAnalysis = moves.map((move, i) => ({
                  move,
                  score: score !== null ? score - i * 0.1 : 0,
                  mate: mate ? mate + i : undefined,
                  depth,
                  nodes,
                  nps,
                  tbhits
                }));
                
                return newAnalysis;
              });
            }
          }
        };

        // Initialize engine with UCI commands
        worker.postMessage('uci');
        worker.postMessage('setoption name MultiPV value 3');
        worker.postMessage('setoption name Threads value ' + (navigator.hardwareConcurrency || 1));
        worker.postMessage('setoption name Hash value 128');
        worker.postMessage('isready');

        console.log('Stockfish initialized with', wasmSupported ? 'WebAssembly' : 'JavaScript', 'version');
      } catch (error) {
        console.error('Failed to initialize Stockfish:', error);
      }
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.postMessage('quit');
        engineRef.current.terminate();
      }
    };
  }, []);

  useEffect(() => {
    const currentFen = chessboard.fen();
    if (isAnalyzing && engineRef.current) {
      setAnalysis([]); // Clear previous analysis
      engineRef.current.postMessage('stop');
      engineRef.current.postMessage('position fen ' + currentFen);
      engineRef.current.postMessage('go depth 20 multipv 3');
    }
  }, [isAnalyzing, chessboard]);

  const loadPGN = (pgnText: string) => {
    try {
      const cleanPgn = pgnText
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\r\n/g, '\n')
        .trim();

      const gameTexts = cleanPgn.split(/\n\s*\n(?=\[)/).filter(text => text.trim());
      
      const parsedGames = gameTexts.map(gameText => {
        const chess = new Chess();
        chess.loadPgn(gameText);
        
        return {
          pgn: gameText,
          moves: chess.history(),
          headers: chess.header()
        };
      });

      if (parsedGames.length === 0) {
        throw new Error('No valid games found in PGN');
      }

      setGames(parsedGames);
      setCurrentGameIndex(0);
      setCurrentMoveIndex(-1);
      
      const newBoard = new Chess();
      setChessboard(newBoard);

    } catch (error) {
      console.error('Failed to load PGN:', error);
      alert('Failed to load PGN. Please check the format.');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const pgn = e.target?.result as string;
        loadPGN(pgn);
      };
      reader.readAsText(file);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      loadPGN(text);
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      alert('Failed to read from clipboard. Please try again.');
    }
  };

  const loadGame = (gameIndex: number) => {
    if (gameIndex < 0 || gameIndex >= games.length) return;
    
    const chess = new Chess();
    const game = games[gameIndex];
    
    try {
      // Load the full PGN to get headers
      chess.loadPgn(game.pgn);
      // Reset to starting position
      chess.reset();
      
      setCurrentGameIndex(gameIndex);
      setCurrentMoveIndex(-1);
      setChessboard(chess);
    } catch (error) {
      console.error('Failed to load game:', error);
    }
  };

  const getPairedMoves = (moves: string[]) => {
    return moves.reduce<Array<[string, string | null]>>((pairs, move, index) => {
      if (index % 2 === 0) {
        pairs.push([move, moves[index + 1] || null]);
      }
      return pairs;
    }, []);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToMove(currentMoveIndex - 1);
      } else if (e.key === 'ArrowRight') {
        goToMove(currentMoveIndex + 1);
      } else if (e.key === 'Home') {
        goToMove(-1);
      } else if (e.key === 'End') {
        const moves = games[currentGameIndex]?.moves || [];
        goToMove(moves.length - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentMoveIndex, currentGameIndex, games, goToMove]);

  const flipBoard = () => {
    setBoardOrientation(prev => prev === 'white' ? 'black' : 'white');
  };

  const onPieceDrop = (sourceSquare: Square, targetSquare: Square) => {
    try {
      if (games.length > 0) return false; // Prevent moves when viewing games
      
      const move = chessboard.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q'
      });

      if (move === null) return false;

      setChessboard(new Chess(chessboard.fen()));
      return true;
    } catch (error) {
      console.error('Failed to apply move:', error);
      return false;
    }
  };

  const filteredGames = games.filter(game => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      game.headers['White']?.toLowerCase().includes(searchLower) ||
      game.headers['Black']?.toLowerCase().includes(searchLower) ||
      game.headers['Event']?.toLowerCase().includes(searchLower) ||
      game.headers['Site']?.toLowerCase().includes(searchLower) ||
      game.headers['Round']?.toLowerCase().includes(searchLower);

    const matchesResult = !activeFilters.result || 
      game.headers['Result'] === activeFilters.result;

    const matchesDate = !activeFilters.date || 
      game.headers['Date']?.includes(activeFilters.date);

    const moveCount = game.moves.length;
    const matchesMoves = 
      (!activeFilters.minMoves || moveCount >= activeFilters.minMoves) &&
      (!activeFilters.maxMoves || moveCount <= activeFilters.maxMoves);

    return matchesSearch && matchesResult && matchesDate && matchesMoves;
  });

  const toggleAnalysis = () => {
    if (!isAnalyzing) {
      setIsAnalyzing(true);
      setAnalysis([]);
      if (engineRef.current) {
        engineRef.current.postMessage('position fen ' + chessboard.fen());
        engineRef.current.postMessage('go depth 20 multipv 3');
      }
    } else {
      setIsAnalyzing(false);
      if (engineRef.current) {
        engineRef.current.postMessage('stop');
      }
    }
  };

  const formatMove = (move: string): string => {
    // Convert UCI move to algebraic notation
    const from = move.slice(0, 2);
    const to = move.slice(2, 4);
    const promotion = move.slice(4);
    
    const chess = new Chess(chessboard.fen());
    const moves = chess.moves({ verbose: true });
    const matchingMove = moves.find(m => 
      m.from === from && 
      m.to === to && 
      (!promotion || m.promotion === promotion)
    );
    
    return matchingMove?.san || move;
  };

  const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return 'N/A';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const renderAnalysis = () => {
    if (!isAnalyzing) return null;

    return (
      <div className="mt-4 bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800 text-xl">Engine Analysis 🧠</h3>
            <div className="flex items-center gap-6 text-base text-gray-600">
              <span title="CPU Threads" className="flex items-center gap-2">
                <span className="text-lg">🧠</span>
                <span className="font-mono">{navigator.hardwareConcurrency || 1} cores</span>
              </span>
              <span title="Hash Table Size" className="flex items-center gap-2">
                <span className="text-lg">💾</span>
                <span className="font-mono">128MB</span>
              </span>
              {analysis[0]?.nps && (
                <span title="Nodes per Second" className="flex items-center gap-2">
                  <span className="text-lg">⚡</span>
                  <span className="font-mono">{formatNumber(analysis[0].nps)}/s</span>
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="divide-y divide-gray-100">
          {analysis.length === 0 ? (
            <div className="px-6 py-4 text-center text-gray-500 animate-pulse text-lg">
              Analyzing position...
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold w-12">#</th>
                  <th className="px-6 py-3 text-left font-semibold w-1/4">Move</th>
                  <th className="px-6 py-3 text-left font-semibold w-1/6">Score</th>
                  <th className="px-6 py-3 text-left font-semibold">Depth</th>
                  <th className="px-6 py-3 text-left font-semibold">Nodes</th>
                  <th className="px-6 py-3 text-left font-semibold">Speed</th>
                </tr>
              </thead>
              <tbody>
                {analysis.map((move, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full text-base font-bold text-gray-600">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xl font-bold text-blue-600">
                        {formatMove(move.move)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`font-mono text-xl font-bold ${
                        move.score > 0 ? 'text-green-600' : 
                        move.score < 0 ? 'text-red-600' : 
                        'text-gray-600'
                      }`}>
                        {move.mate !== undefined 
                          ? `M${Math.abs(move.mate)}` 
                          : (move.score > 0 ? '+' : '') + move.score.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-lg text-gray-700">
                        {move.depth || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-lg text-gray-700">
                        {formatNumber(move.nodes)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-lg text-gray-700">
                        {formatNumber(move.nps)}/s
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-[1800px] mx-auto p-4">
        <div>
          <div className="bg-white rounded-lg shadow mb-12 p-4">
            <div className="flex gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors flex items-center justify-center gap-2 text-base"
              >
                <span>📁</span> Upload PGN File
              </button>
              <button
                onClick={handlePaste}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors flex items-center justify-center gap-2 text-base"
              >
                <span>📋</span> Paste PGN
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pgn"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>
        </div>

        <div>
          <div 
            style={{ 
              display: 'grid',
              gridTemplateColumns: 'auto 300px',
              gap: '1.5rem',
              alignItems: 'start'
            }}
          >
            <div className="bg-white rounded-lg shadow p-4 flex justify-center">
              <div className="flex flex-col items-center" style={{ width: boardWidth }}>
                <div className="text-center mb-4 text-gray-800 text-xl font-bold">
                  {boardOrientation === 'white' ? blackPlayer : whitePlayer}
                </div>

                <Chessboard 
                  position={chessboard.fen()}
                  boardWidth={boardWidth}
                  areArrowsAllowed={true}
                  showBoardNotation={true}
                  boardOrientation={boardOrientation}
                  onPieceDrop={onPieceDrop}
                />

                <div className="text-center mt-4 mb-6 text-gray-800 text-xl font-bold">
                  {boardOrientation === 'white' ? whitePlayer : blackPlayer}
                </div>
                
                <div className="flex justify-center gap-4 mt-2">
                  <button
                    onClick={() => goToMove(-1)}
                    className="p-3 text-xl bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors w-12 h-12 flex items-center justify-center shadow-md"
                    title="First move"
                    disabled={!currentGame}
                  >
                    ⏮
                  </button>
                  <button
                    onClick={() => goToMove(currentMoveIndex - 1)}
                    className="p-3 text-xl bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors w-12 h-12 flex items-center justify-center shadow-md"
                    disabled={!currentGame || currentMoveIndex <= -1}
                    title="Previous move"
                  >
                    ◀
                  </button>
                  <button
                    onClick={flipBoard}
                    className="p-3 text-xl bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition-colors w-12 h-12 flex items-center justify-center shadow-md"
                    title="Flip board"
                  >
                    ⟲
                  </button>
                  <button
                    onClick={() => goToMove(currentMoveIndex + 1)}
                    className="p-3 text-xl bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors w-12 h-12 flex items-center justify-center shadow-md"
                    disabled={!currentGame || currentMoveIndex >= (currentGame?.moves.length - 1)}
                    title="Next move"
                  >
                    ▶
                  </button>
                  <button
                    onClick={() => goToMove((currentGame?.moves.length || 0) - 1)}
                    className="p-3 text-xl bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors w-12 h-12 flex items-center justify-center shadow-md"
                    title="Last move"
                    disabled={!currentGame}
                  >
                    ⏭
                  </button>
                  <button
                    onClick={toggleAnalysis}
                    className={`p-3 text-xl ${
                      isAnalyzing 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-purple-500 hover:bg-purple-600'
                    } text-white rounded-full transition-colors w-12 h-12 flex items-center justify-center shadow-md`}
                    title={isAnalyzing ? "Stop Analysis" : "Start Analysis"}
                  >
                    {isAnalyzing ? '⏹' : '⚡'}
                  </button>
                </div>

                {renderAnalysis()}

                {games.length === 0 && (
                  <div className="text-center mt-4 text-base text-gray-800">
                    {chessboard.isGameOver() ? (
                      <p className="font-bold">
                        Game Over - {
                          chessboard.isCheckmate() ? "Checkmate!" :
                          chessboard.isDraw() ? "Draw!" :
                          chessboard.isStalemate() ? "Stalemate!" :
                          "Game Over"
                        }
                      </p>
                    ) : (
                      <p>
                        <span className="font-bold">{chessboard.turn() === 'w' ? "White" : "Black"}&apos;s turn</span>
                        {chessboard.isCheck() ? " (Check!)" : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}>
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow p-4">
                  <h2 className="text-xl font-bold mb-4 text-gray-800">Game Information</h2>
                  {currentGame ? (
                    <div>
                      <table className="w-full">
                        <tbody>
                          <tr>
                            <td className="py-1 pr-4 font-bold text-gray-800 whitespace-nowrap">White:</td>
                            <td className="py-1">{whitePlayer}</td>
                          </tr>
                          <tr>
                            <td className="py-1 pr-4 font-bold text-gray-800 whitespace-nowrap">Black:</td>
                            <td className="py-1">{blackPlayer}</td>
                          </tr>
                          <tr>
                            <td className="py-1 pr-4 font-bold text-gray-800 whitespace-nowrap">Date:</td>
                            <td className="py-1">{currentGame.headers['Date'] || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td className="py-1 pr-4 font-bold text-gray-800 whitespace-nowrap">Event:</td>
                            <td className="py-1">{currentGame.headers['Event'] || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td className="py-1 pr-4 font-bold text-gray-800 whitespace-nowrap">Site:</td>
                            <td className="py-1">{currentGame.headers['Site'] || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td className="py-1 pr-4 font-bold text-gray-800 whitespace-nowrap">Round:</td>
                            <td className="py-1">{currentGame.headers['Round'] || 'N/A'}</td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="border-t border-gray-200 mt-3 pt-3">
                        <table className="w-full">
                          <tbody>
                            <tr>
                              <td className="py-1 pr-4 font-bold text-gray-800 whitespace-nowrap">Result:</td>
                              <td className="py-1 text-blue-600 font-bold">{result || 'N/A'}</td>
                            </tr>
                            <tr>
                              <td className="py-1 pr-4 font-bold text-gray-800 whitespace-nowrap">Move:</td>
                              <td className="py-1">{currentMoveIndex + 1} / {currentGame.moves.length}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-base text-gray-500">No game loaded</p>
                  )}
                </div>

                <div className="bg-white rounded-lg shadow p-4">
                  <h2 className="text-xl font-bold mb-4 text-gray-800">Moves</h2>
                  {currentGame ? (
                    <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
                      <table className="w-full border-collapse text-base">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="p-2 text-left text-gray-800 font-bold w-12">#</th>
                            <th className="p-2 text-left text-gray-800 font-bold">White</th>
                            <th className="p-2 text-left text-gray-800 font-bold">Black</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getPairedMoves(currentGame.moves).map((pair, index) => (
                            <tr key={index} className="border-b border-gray-100">
                              <td className="p-2 text-gray-600 font-bold">{index + 1}</td>
                              <td className="p-2">
                                <button
                                  onClick={() => goToMove(index * 2)}
                                  className={`w-full text-left px-2 py-1 rounded ${
                                    currentMoveIndex === index * 2
                                      ? 'bg-blue-100 font-bold'
                                      : 'hover:bg-gray-100'
                                  }`}
                                >
                                  {pair[0]}
                                </button>
                              </td>
                              <td className="p-2">
                                {pair[1] && (
                                  <button
                                    onClick={() => goToMove(index * 2 + 1)}
                                    className={`w-full text-left px-2 py-1 rounded ${
                                      currentMoveIndex === index * 2 + 1
                                        ? 'bg-blue-100 font-bold'
                                        : 'hover:bg-gray-100'
                                    }`}
                                  >
                                    {pair[1]}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-base text-gray-500">No moves to display</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: '128px' }}></div>

        {games.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800">Games ({filteredGames.length})</h2>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveFilters({
                      result: '',
                      date: '',
                      minMoves: null,
                      maxMoves: null
                    });
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Clear filters
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex flex-wrap items-center gap-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    className="w-48 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  />

                  <select
                    value={activeFilters.result}
                    onChange={(e) => setActiveFilters(prev => ({ ...prev, result: e.target.value }))}
                    className="w-32 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  >
                    <option value="">All Results</option>
                    <option value="1-0">White wins</option>
                    <option value="0-1">Black wins</option>
                    <option value="1/2-1/2">Draw</option>
                  </select>

                  <input
                    type="text"
                    value={activeFilters.date}
                    onChange={(e) => setActiveFilters(prev => ({ ...prev, date: e.target.value }))}
                    placeholder="Date (YYYY.MM.DD)"
                    className="w-36 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  />

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={activeFilters.minMoves || ''}
                      onChange={(e) => setActiveFilters(prev => ({ 
                        ...prev, 
                        minMoves: e.target.value ? parseInt(e.target.value) : null 
                      }))}
                      placeholder="Min"
                      className="w-20 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="number"
                      value={activeFilters.maxMoves || ''}
                      onChange={(e) => setActiveFilters(prev => ({ 
                        ...prev, 
                        maxMoves: e.target.value ? parseInt(e.target.value) : null 
                      }))}
                      placeholder="Max"
                      className="w-20 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-left font-bold text-gray-800 border-b border-r border-gray-200">White</th>
                    <th className="px-4 py-2 text-left font-bold text-gray-800 border-b border-r border-gray-200">Black</th>
                    <th className="px-4 py-2 text-left font-bold text-gray-800 border-b border-r border-gray-200">Event</th>
                    <th className="px-4 py-2 text-left font-bold text-gray-800 border-b border-r border-gray-200">Date</th>
                    <th className="px-4 py-2 text-left font-bold text-gray-800 border-b border-r border-gray-200">Site</th>
                    <th className="px-4 py-2 text-left font-bold text-gray-800 border-b border-r border-gray-200">Round</th>
                    <th className="px-4 py-2 text-left font-bold text-gray-800 border-b border-r border-gray-200">Result</th>
                    <th className="px-4 py-2 text-left font-bold text-gray-800 border-b border-r border-gray-200">Moves</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGames.map((game, index) => (
                    <tr 
                      key={index} 
                      onClick={() => loadGame(games.findIndex(g => g.pgn === game.pgn))}
                      className={`border-b border-gray-200 cursor-pointer ${
                        games[currentGameIndex]?.pgn === game.pgn ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-2 font-bold border-r border-gray-200">{game.headers['White'] || 'White'}</td>
                      <td className="px-4 py-2 font-bold border-r border-gray-200">{game.headers['Black'] || 'Black'}</td>
                      <td className="px-4 py-2 border-r border-gray-200">{game.headers['Event'] || 'N/A'}</td>
                      <td className="px-4 py-2 border-r border-gray-200">{game.headers['Date'] || 'N/A'}</td>
                      <td className="px-4 py-2 border-r border-gray-200">{game.headers['Site'] || 'N/A'}</td>
                      <td className="px-4 py-2 border-r border-gray-200">{game.headers['Round'] || 'N/A'}</td>
                      <td className="px-4 py-2 font-bold text-blue-600 border-r border-gray-200">{game.headers['Result'] || 'N/A'}</td>
                      <td className="px-4 py-2">{game.moves.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}