'use client';

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
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
  pv?: string[];
}

export interface ChessViewerProps {
  className?: string;
}

export interface ChessViewerHandle {
  handleFileUpload: (file: File) => Promise<void>;
  handlePaste: () => Promise<void>;
}

const ChessViewer = forwardRef<ChessViewerHandle, ChessViewerProps>((props, ref) => {
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisMove[]>([]);
  const [analysisInfo, setAnalysisInfo] = useState({ depth: 0, nodes: 0, nps: 0 });
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

          if (message.startsWith('info')) {
            const depthMatch = message.match(/depth (\d+)/);
            const nodesMatch = message.match(/nodes (\d+)/);
            const npsMatch = message.match(/nps (\d+)/);
            const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
            const multipvMatch = message.match(/multipv (\d+)/);
            const moveMatch = message.match(/pv ([a-h][1-8][a-h][1-8][qrbn]?\s*)+/);
            
            // Update analysis info for real-time stats
            setAnalysisInfo(prev => ({
              ...prev,
              depth: depthMatch ? parseInt(depthMatch[1]) : prev.depth,
              nodes: nodesMatch ? parseInt(nodesMatch[1]) : prev.nodes,
              nps: npsMatch ? parseInt(npsMatch[1]) : prev.nps
            }));

            // Process analysis info immediately
            if (moveMatch && scoreMatch && multipvMatch) {
              const moves = moveMatch[0].split(' ').slice(1); // Get all moves in PV
              const [, scoreType, scoreValue] = scoreMatch;
              const score = scoreType === 'cp' ? parseInt(scoreValue) / 100 : null;
              const mate = scoreType === 'mate' ? parseInt(scoreValue) : undefined;
              const depth = depthMatch ? parseInt(depthMatch[1]) : 0;
              const nodes = nodesMatch ? parseInt(nodesMatch[1]) : 0;
              const nps = npsMatch ? parseInt(npsMatch[1]) : 0;
              const tbhits = 0;
              const multipv = parseInt(multipvMatch[1]);

              // Convert UCI moves to SAN notation
              const chess = new Chess(chessboard.fen());
              const sanMoves: string[] = [];
              
              for (const move of moves) {
                try {
                  const from = move.slice(0, 2);
                  const to = move.slice(2, 4);
                  const promotion = move.length > 4 ? move[4] : undefined;
                  
                  const result = chess.move({
                    from,
                    to,
                    promotion
                  });
                  
                  if (result) {
                    sanMoves.push(result.san);
                  }
                } catch {
                  console.error('Error converting move:', move);
                  break;
                }
              }
              
              if (sanMoves.length > 0) {
                setAnalysis(prev => {
                  const newAnalysis = [...prev];
                  // Update or add the analysis for this multipv line
                  newAnalysis[multipv - 1] = {
                    move: sanMoves[0],
                    score: score !== null ? score : 0,
                    mate,
                    depth,
                    nodes,
                    nps,
                    tbhits,
                    pv: sanMoves
                  };
                  return newAnalysis;
                });
              }
            }
          }
        };

        // Initialize engine with UCI commands
        worker.postMessage('uci');
        worker.postMessage('setoption name MultiPV value 3'); // Request top 3 lines
        worker.postMessage('setoption name Threads value ' + (navigator.hardwareConcurrency || 1));
        worker.postMessage('setoption name Hash value 1024');
        worker.postMessage('setoption name Use NNUE value true'); // Enable NNUE evaluation
        worker.postMessage('setoption name UCI_AnalyseMode value true'); // Enable analysis mode
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
  }, [chessboard]);

  useEffect(() => {
    const currentFen = chessboard.fen();
    if (isAnalyzing && engineRef.current) {
      setAnalysis([]); // Clear previous analysis
      engineRef.current.postMessage('stop');
      engineRef.current.postMessage('position fen ' + currentFen);
      engineRef.current.postMessage('go depth 40 multipv 3');
    }
  }, [isAnalyzing, chessboard]);

  const loadPGN = useCallback((pgnText: string) => {
    try {
      const cleanPgn = pgnText
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\r\n/g, '\n')
        .trim();

      const gameTexts = cleanPgn.split(/\n\s*\n(?=\[)/).filter(text => text.trim());
      
      const parsedGames = gameTexts.map(gameText => {
        const chess = new Chess();
        try {
          chess.loadPgn(gameText);
          return {
            pgn: gameText,
            moves: chess.history(),
            headers: chess.header()
          };
        } catch {
          throw new Error('Invalid PGN format');
        }
      });

      if (parsedGames.length === 0) {
        throw new Error('No valid games found in PGN');
      }

      // Set the games array first
      setGames(parsedGames);
      
      // Create a new chess instance for the first game and reset to initial position
      const chess = new Chess();
      chess.loadPgn(parsedGames[0].pgn);
      
      // Update all the state in the correct order
      setCurrentGameIndex(0);
      setCurrentMoveIndex(-1);
      setChessboard(chess);
      goToMove(0); // Go to move 1

      return true; // Indicate success
    } catch (error) {
      console.error('Failed to load PGN:', error);
      return false; // Indicate failure
    }
  }, [goToMove, setGames, setCurrentGameIndex, setCurrentMoveIndex, setChessboard]);

  const handleFileUpload = useCallback(async (file: File) => {
    console.log('ChessViewer handleFileUpload called with file:', file.name);
    try {
      const text = await file.text();
      console.log('File content length:', text.length);
      console.log('First 100 chars:', text.slice(0, 100));
      
      // Reset the state before loading new PGN
      setGames([]);
      setCurrentGameIndex(0);
      setCurrentMoveIndex(-1);
      setChessboard(new Chess());
      
      // Load the PGN and ensure we start at move 1
      const success = loadPGN(text);
      if (!success) {
        throw new Error('Failed to parse PGN format');
      }
    } catch (error) {
      console.error('Error loading PGN file:', error);
      alert('Error loading PGN file. Please check the file format.');
    }
  }, [loadPGN]);

  const handlePaste = useCallback(async () => {
    console.log('ChessViewer handlePaste called');
    try {
      const text = await navigator.clipboard.readText();
      console.log('Clipboard content:', text.slice(0, 100) + '...'); // Log first 100 chars
      loadPGN(text);
    } catch (error) {
      console.error('Error pasting PGN:', error);
      alert('Error pasting PGN');
    }
  }, [loadPGN]);

  const loadGame = (gameIndex: number) => {
    if (gameIndex < 0 || gameIndex >= games.length) return;
    
    const chess = new Chess();
    const game = games[gameIndex];
    
    try {
      chess.loadPgn(game.pgn);
      setCurrentGameIndex(gameIndex);
      setCurrentMoveIndex(0); // Start at move 1 instead of last move
      setChessboard(chess);
      goToMove(0); // Go to move 1
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
        engineRef.current.postMessage('go depth 40 multipv 3');
      }
    } else {
      setIsAnalyzing(false);
      if (engineRef.current) {
        engineRef.current.postMessage('stop');
      }
    }
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
      <div className="mt-8 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden w-full shadow-lg shadow-black/20">
        <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-lg">Engine Analysis</h3>
              <div className="flex items-center gap-4 text-sm">
                <span title="CPU Threads" className="flex items-center gap-1">
                  <span>🧠</span>
                  <span className="font-mono text-blue-300">{navigator.hardwareConcurrency || 1} cores</span>
                </span>
                <span title="Hash Table Size" className="flex items-center gap-1">
                  <span>💾</span>
                  <span className="font-mono text-blue-300">1024MB</span>
                </span>
                <span title="Search Depth" className="flex items-center gap-1">
                  <span>🔍</span>
                  <span className="font-mono text-blue-300">depth {analysisInfo.depth || 0}</span>
                </span>
                <span title="Nodes Searched" className="flex items-center gap-1">
                  <span>🌳</span>
                  <span className="font-mono text-blue-300">{formatNumber(analysisInfo.nodes || 0)} nodes</span>
                </span>
                <span title="Speed" className="flex items-center gap-1">
                  <span>⚡</span>
                  <span className="font-mono text-blue-300">{formatNumber(analysisInfo.nps || 0)}/s</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="divide-y divide-gray-700">
          {analysis.length === 0 ? (
            <div className="px-4 py-3 text-center text-blue-300 animate-pulse">
              Analyzing position...
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-800/50 text-white text-sm">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold w-8">#</th>
                  <th className="px-4 py-2 text-left font-semibold w-24">Score</th>
                  <th className="px-4 py-2 text-left font-semibold">Principal Variation</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {analysis.map((line, index) => (
                  <tr key={index} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="w-6 h-6 flex items-center justify-center bg-gray-800 rounded-full font-medium text-blue-300">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {line?.score !== undefined && (
                        <span className={`font-mono font-bold ${
                          line.score > 0 ? 'text-green-400' : 
                          line.score < 0 ? 'text-red-400' : 
                          'text-white'
                        }`}>
                          {line.mate !== undefined 
                            ? `M${Math.abs(line.mate)}` 
                            : (line.score > 0 ? '+' : '') + line.score.toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {line?.pv && (
                        <div className="overflow-x-auto custom-scrollbar">
                          <div className="font-mono text-blue-300 flex whitespace-nowrap gap-2">
                            {line.pv.slice(0, 10).map((move, i) => {
                              const moveNumber = Math.floor(i / 2) + 1;
                              return (
                                <React.Fragment key={i}>
                                  {i % 2 === 0 && (
                                    <span className="text-gray-500 select-none">{moveNumber}.</span>
                                  )}
                                  <span className={`${i === 0 ? 'font-bold text-white' : ''} hover:bg-blue-900/30 px-1 rounded cursor-default`}>
                                    {move}
                                  </span>
                                </React.Fragment>
                              );
                            })}
                            {line.pv.length > 10 && (
                              <span className="text-gray-500">...</span>
                            )}
                          </div>
                        </div>
                      )}
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

  // Make handleFileUpload and handlePaste stable with useCallback
  useImperativeHandle(ref, () => ({
    handleFileUpload,
    handlePaste
  }), [handleFileUpload, handlePaste]);

  ChessViewer.displayName = 'ChessViewer';

  return (
    <div className="max-w-[1800px] mx-auto">
      <div className="grid grid-cols-[auto_300px] gap-6 items-start">
        <div className="bg-gray-900 rounded-lg shadow-lg shadow-black/20 p-4 flex justify-center">
          <div className="flex flex-col items-center" style={{ width: boardWidth }}>
            <div className="text-center mb-4 text-white text-xl font-bold">
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

            <div className="text-center mt-4 mb-6 text-white text-xl font-bold">
              {boardOrientation === 'white' ? whitePlayer : blackPlayer}
            </div>
            
            <div className="flex justify-center gap-4 mt-2">
              <button
                onClick={() => goToMove(-1)}
                className="p-3 text-xl bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors w-12 h-12 flex items-center justify-center shadow-lg shadow-black/20"
                title="First move"
                disabled={!currentGame}
              >
                ⏮
              </button>
              <button
                onClick={() => goToMove(currentMoveIndex - 1)}
                className="p-3 text-xl bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors w-12 h-12 flex items-center justify-center shadow-lg shadow-black/20"
                disabled={!currentGame || currentMoveIndex <= -1}
                title="Previous move"
              >
                ◀
              </button>
              <button
                onClick={flipBoard}
                className="p-3 text-xl bg-amber-500 text-white rounded-full hover:bg-amber-600 transition-colors w-12 h-12 flex items-center justify-center shadow-lg shadow-black/20"
                title="Flip board"
              >
                ⟲
              </button>
              <button
                onClick={() => goToMove(currentMoveIndex + 1)}
                className="p-3 text-xl bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors w-12 h-12 flex items-center justify-center shadow-lg shadow-black/20"
                disabled={!currentGame || currentMoveIndex >= (currentGame?.moves.length - 1)}
                title="Next move"
              >
                ▶
              </button>
              <button
                onClick={() => goToMove((currentGame?.moves.length || 0) - 1)}
                className="p-3 text-xl bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors w-12 h-12 flex items-center justify-center shadow-lg shadow-black/20"
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
                    : 'bg-indigo-500 hover:bg-indigo-600'
                } text-white rounded-full transition-colors w-12 h-12 flex items-center justify-center shadow-lg shadow-black/20`}
                title={isAnalyzing ? "Stop Analysis" : "Start Analysis"}
              >
                {isAnalyzing ? '⏹' : '⚡'}
              </button>
            </div>

            {renderAnalysis()}

            {games.length === 0 && (
              <div className="text-center mt-4 text-base text-blue-300">
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

        <div className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto">
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-lg shadow-lg shadow-black/20 p-4">
              <h2 className="text-xl font-bold mb-4 text-white">Game Information</h2>
              {currentGame ? (
                <div>
                  <table className="w-full">
                    <tbody>
                      <tr>
                        <td className="py-1 pr-4 font-bold text-blue-300 whitespace-nowrap">White:</td>
                        <td className="py-1 text-white">{whitePlayer}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 font-bold text-blue-300 whitespace-nowrap">Black:</td>
                        <td className="py-1 text-white">{blackPlayer}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 font-bold text-blue-300 whitespace-nowrap">Event:</td>
                        <td className="py-1 text-white">{currentGame.headers['Event'] || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 font-bold text-blue-300 whitespace-nowrap">Site:</td>
                        <td className="py-1 text-white">{currentGame.headers['Site'] || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 font-bold text-blue-300 whitespace-nowrap">Date:</td>
                        <td className="py-1 text-white">{currentGame.headers['Date'] || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 font-bold text-blue-300 whitespace-nowrap">Round:</td>
                        <td className="py-1 text-white">{currentGame.headers['Round'] || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 font-bold text-blue-300 whitespace-nowrap">Result:</td>
                        <td className="py-1 font-bold text-green-400">{result}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 font-bold text-blue-300 whitespace-nowrap">ECO:</td>
                        <td className="py-1 text-white">{currentGame.headers['ECO'] || 'N/A'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-blue-300 text-center">
                  No game loaded
                </div>
              )}
            </div>

            {currentGame && (
              <div className="bg-gray-900 rounded-lg shadow-lg shadow-black/20 p-4">
                <h2 className="text-xl font-bold mb-4 text-white">Moves</h2>
                <div className="space-y-2">
                  {getPairedMoves(currentGame.moves).map(([white, black], index) => (
                    <div 
                      key={index}
                      className="flex gap-4 text-base"
                    >
                      <span className="w-8 text-gray-500 select-none">{index + 1}.</span>
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => goToMove(index * 2)}
                          className={`text-left px-2 py-1 rounded ${
                            currentMoveIndex === index * 2
                              ? 'bg-blue-900/50 text-blue-300'
                              : 'text-white hover:bg-gray-800'
                          }`}
                        >
                          {white}
                        </button>
                        {black && (
                          <button
                            onClick={() => goToMove(index * 2 + 1)}
                            className={`text-left px-2 py-1 rounded ${
                              currentMoveIndex === index * 2 + 1
                                ? 'bg-blue-900/50 text-blue-300'
                                : 'text-white hover:bg-gray-800'
                            }`}
                          >
                            {black}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {games.length > 0 && (
        <div className="bg-gray-900 rounded-lg shadow-lg shadow-black/20 p-6 mt-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-200">Games ({filteredGames.length})</h2>
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
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Clear filters
              </button>
            </div>

            <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
              <div className="flex flex-wrap items-center gap-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-48 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-200 text-sm placeholder-gray-400"
                />

                <select
                  value={activeFilters.result}
                  onChange={(e) => setActiveFilters(prev => ({ ...prev, result: e.target.value }))}
                  className="w-32 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-200 text-sm"
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
                  className="w-36 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-200 text-sm placeholder-gray-400"
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
                    className="w-20 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-200 text-sm placeholder-gray-400"
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
                    className="w-20 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-200 text-sm placeholder-gray-400"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse border border-gray-700 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-700/50">
                  <th className="px-4 py-2 text-left font-bold text-gray-200 border-b border-r border-gray-600">White</th>
                  <th className="px-4 py-2 text-left font-bold text-gray-200 border-b border-r border-gray-600">Black</th>
                  <th className="px-4 py-2 text-left font-bold text-gray-200 border-b border-r border-gray-600">Event</th>
                  <th className="px-4 py-2 text-left font-bold text-gray-200 border-b border-r border-gray-600">Date</th>
                  <th className="px-4 py-2 text-left font-bold text-gray-200 border-b border-r border-gray-600">Site</th>
                  <th className="px-4 py-2 text-left font-bold text-gray-200 border-b border-r border-gray-600">Round</th>
                  <th className="px-4 py-2 text-left font-bold text-gray-200 border-b border-r border-gray-600">Result</th>
                  <th className="px-4 py-2 text-left font-bold text-gray-200 border-b border-r border-gray-600">Moves</th>
                </tr>
              </thead>
              <tbody>
                {filteredGames.map((game, index) => (
                  <tr 
                    key={index} 
                    onClick={() => loadGame(games.findIndex(g => g.pgn === game.pgn))}
                    className={`border-b border-gray-700 cursor-pointer ${
                      games[currentGameIndex]?.pgn === game.pgn ? 'bg-blue-900/30' : 'hover:bg-gray-700/30'
                    }`}
                  >
                    <td className="px-4 py-2 font-bold text-gray-300 border-r border-gray-600">{game.headers['White'] || 'White'}</td>
                    <td className="px-4 py-2 font-bold text-gray-300 border-r border-gray-600">{game.headers['Black'] || 'Black'}</td>
                    <td className="px-4 py-2 text-gray-400 border-r border-gray-600">{game.headers['Event'] || 'N/A'}</td>
                    <td className="px-4 py-2 text-gray-400 border-r border-gray-600">{game.headers['Date'] || 'N/A'}</td>
                    <td className="px-4 py-2 text-gray-400 border-r border-gray-600">{game.headers['Site'] || 'N/A'}</td>
                    <td className="px-4 py-2 text-gray-400 border-r border-gray-600">{game.headers['Round'] || 'N/A'}</td>
                    <td className="px-4 py-2 font-bold text-blue-400 border-r border-gray-600">{game.headers['Result'] || 'N/A'}</td>
                    <td className="px-4 py-2 text-gray-400">{game.moves.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});

export default ChessViewer;