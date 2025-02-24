'use client';

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Square } from 'chess.js';
import { StockfishService, EngineConfig, AnalysisInfo, Variation } from '../services/StockfishService';

// Use WASM version only
const STOCKFISH_PATH = '/stockfish/stockfish-nnue-16.js';

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
  handlePasteFEN: () => Promise<void>;
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
  const [analysis, setAnalysis] = useState<Variation[]>([]);
  const [analysisInfo, setAnalysisInfo] = useState<AnalysisInfo>({ depth: 0, nodes: 0, nps: 0 });
  const engineRef = useRef<StockfishService | null>(null);

  const currentGame = games[currentGameIndex];
  const whitePlayer = currentGame?.headers['White'] || 'White';
  const blackPlayer = currentGame?.headers['Black'] || 'Black';
  const result = currentGame?.headers['Result'] || '';

  const goToMove = useCallback((moveIndex: number) => {
    if (moveIndex < 0 || moveIndex >= currentGame?.moves.length) return;
    
    const newChess = new Chess();
    if (currentGame) {
      // Clear analysis before loading new position
      setAnalysis([]);
      setAnalysisInfo({ depth: 0, nodes: 0, nps: 0 });

      // Apply moves up to the selected index
      for (let i = 0; i <= moveIndex; i++) {
        newChess.move(currentGame.moves[i]);
      }
      
      setChessboard(newChess);
      setCurrentMoveIndex(moveIndex);

      // Start analysis of the new position
      if (engineRef.current) {
        engineRef.current.analyze(newChess.fen());
        setIsAnalyzing(true);
      }
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
      setAnalysis([]);
      setAnalysisInfo({ depth: 0, nodes: 0, nps: 0 });
      
      // Load the PGN and ensure we start at move 1
      const success = loadPGN(text);
      if (!success) {
        throw new Error('Failed to parse PGN format');
      }

      // Start analysis of the current position
      if (engineRef.current) {
        engineRef.current.analyze(chessboard.fen());
        setIsAnalyzing(true);
      }
    } catch (error) {
      console.error('Error loading PGN file:', error);
      alert('Error loading PGN file. Please check the file format.');
    }
  }, [loadPGN, chessboard]);

  const handlePaste = useCallback(async () => {
    console.log('ChessViewer handlePaste called');
    try {
      const text = await navigator.clipboard.readText();
      console.log('Clipboard content:', text.slice(0, 100) + '...'); // Log first 100 chars
      
      // Clear analysis before loading new PGN
      setAnalysis([]);
      setAnalysisInfo({ depth: 0, nodes: 0, nps: 0 });
      
      loadPGN(text);

      // Start analysis of the current position
      if (engineRef.current) {
        engineRef.current.analyze(chessboard.fen());
        setIsAnalyzing(true);
      }
    } catch (error) {
      console.error('Error pasting PGN:', error);
      alert('Error pasting PGN');
    }
  }, [loadPGN, chessboard]);

  // Add FEN validation function
  const isValidFen = (fen: string): boolean => {
    try {
      const chess = new Chess();
      chess.load(fen);
      return true;
    } catch {
      return false;
    }
  };

  const handlePasteFEN = useCallback(async () => {
    console.log('ChessViewer handlePasteFEN called');
    try {
      const text = await navigator.clipboard.readText();
      console.log('Clipboard FEN content:', text);
      
      if (!isValidFen(text)) {
        alert('Invalid FEN position');
        return;
      }

      // Reset the state and clear analysis
      setGames([]);
      setCurrentGameIndex(0);
      setCurrentMoveIndex(-1);
      setAnalysis([]);
      setAnalysisInfo({ depth: 0, nodes: 0, nps: 0 });
      
      // Create a new chess instance with the FEN
      const chess = new Chess();
      chess.load(text);
      setChessboard(chess);

      // Start analysis of the new position
      if (engineRef.current) {
        engineRef.current.analyze(text);
        setIsAnalyzing(true);
      }
    } catch (error) {
      console.error('Error pasting FEN:', error);
      alert('Error pasting FEN');
    }
  }, []);

  const loadGame = (gameIndex: number) => {
    if (gameIndex < 0 || gameIndex >= games.length) return;
    
    const chess = new Chess();
    const game = games[gameIndex];
    
    try {
      // Clear analysis before loading new game
      setAnalysis([]);
      setAnalysisInfo({ depth: 0, nodes: 0, nps: 0 });

      chess.loadPgn(game.pgn);
      setCurrentGameIndex(gameIndex);
      setCurrentMoveIndex(0); // Start at move 1 instead of last move
      setChessboard(chess);
      goToMove(0); // Go to move 1

      // Start analysis of the current position
      if (engineRef.current) {
        engineRef.current.analyze(chess.fen());
        setIsAnalyzing(true);
      }
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

  useEffect(() => {
    const initEngine = async () => {
      try {
        // Create engine instance with default config
        engineRef.current = new StockfishService({
          threads: Math.min(navigator.hardwareConcurrency || 1, 20),
          hash: 128,
          multiPV: 4,
          depth: 40,
          skillLevel: 20
        });
        
        // Set up callbacks
        engineRef.current.setCallbacks({
          onAnalysis: (newVariations) => {
            setAnalysis(newVariations);
          },
          onInfo: (info) => {
            setAnalysisInfo(prev => ({...prev, ...info}));
          },
          onStatus: (status) => {
            if (status.state === 'analyzing') {
              setIsAnalyzing(true);
            } else if (status.state === 'error') {
              setIsAnalyzing(false);
            }
          }
        });

        // Initialize the engine
        await engineRef.current.init();
      } catch (err) {
        console.error('Failed to initialize engine:', err);
      }
    };

    // Only initialize in browser environment
    if (typeof window !== 'undefined') {
      initEngine();
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, []); // Run only once on mount

  // Add effect to handle position changes
  useEffect(() => {
    if (isAnalyzing && engineRef.current) {
      engineRef.current.analyze(chessboard.fen());
    }
  }, [isAnalyzing, chessboard]);

  const toggleAnalysis = () => {
    if (!isAnalyzing) {
      setIsAnalyzing(true);
      if (engineRef.current) {
        engineRef.current.analyze(chessboard.fen());
      }
    } else {
      setIsAnalyzing(false);
      if (engineRef.current) {
        engineRef.current.stop();
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
                  <span className="font-mono text-blue-300">{engineRef.current?.config.threads || 1} cores</span>
                </span>
                <span title="Hash Table Size" className="flex items-center gap-1">
                  <span>💾</span>
                  <span className="font-mono text-blue-300">{engineRef.current?.config.hash || 128}MB</span>
                </span>
                <span title="Search Depth" className="flex items-center gap-1">
                  <span>🔍</span>
                  <span className="font-mono text-blue-300">depth {analysisInfo.depth || 0}</span>
                </span>
                <span title="Nodes Searched" className="flex items-center gap-1">
                  <span>🌳</span>
                  <span className="font-mono text-blue-300">{formatNumber(analysisInfo.nodes)} nodes</span>
                </span>
                <span title="Speed" className="flex items-center gap-1">
                  <span>⚡</span>
                  <span className="font-mono text-blue-300">{formatNumber(analysisInfo.nps)}/s</span>
                </span>
                {analysisInfo.tbhits && analysisInfo.tbhits > 0 && (
                  <span title="Tablebase Hits" className="flex items-center gap-1">
                    <span>📚</span>
                    <span className="font-mono text-blue-300">{formatNumber(analysisInfo.tbhits)} TB</span>
                  </span>
                )}
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
                      <span className={`font-mono font-bold ${
                        line.score > 0 ? 'text-green-400' : 
                        line.score < 0 ? 'text-red-400' : 
                        'text-white'
                      }`}>
                        {line.mate !== undefined 
                          ? (line.mate > 0 ? '+' : '') + `M${Math.abs(line.mate)}`
                          : (line.score > 0 ? '+' : '') + line.score.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="overflow-x-auto custom-scrollbar">
                        <div className="font-mono text-blue-300 flex whitespace-nowrap gap-2">
                          {line.moves.slice(0, 15).map((move: string, i: number) => {
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
                          {line.moves.length > 15 && (
                            <span className="text-gray-500">...</span>
                          )}
                        </div>
                      </div>
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

  // Make handleFileUpload, handlePaste, and handlePasteFEN stable with useCallback
  useImperativeHandle(ref, () => ({
    handleFileUpload,
    handlePaste,
    handlePasteFEN
  }), [handleFileUpload, handlePaste, handlePasteFEN]);

  ChessViewer.displayName = 'ChessViewer';

  return (
    <div className="max-w-[1800px] mx-auto">
      <div className="flex flex-col gap-6">
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

        {/* Game Information Panel */}
        {currentGame && (
          <div className="bg-gray-900 rounded-lg shadow-lg shadow-black/20 p-4">
            <h3 className="text-white font-bold mb-3">Game Information</h3>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 text-gray-300">
                <span className="text-gray-400">White:</span>
                <span>{whitePlayer}</span>
                <span className="text-gray-400">Black:</span>
                <span>{blackPlayer}</span>
                <span className="text-gray-400">Event:</span>
                <span>{currentGame.headers['Event'] || 'N/A'}</span>
                <span className="text-gray-400">Site:</span>
                <span>{currentGame.headers['Site'] || 'N/A'}</span>
                <span className="text-gray-400">Date:</span>
                <span>{currentGame.headers['Date'] || 'N/A'}</span>
                <span className="text-gray-400">Result:</span>
                <span>{result}</span>
              </div>
            </div>
          </div>
        )}

        {/* Moves List Panel */}
        {currentGame && (
          <div className="bg-gray-900 rounded-lg shadow-lg shadow-black/20 p-4">
            <h3 className="text-white font-bold mb-3">Moves</h3>
            <div className="space-y-1">
              {getPairedMoves(currentGame.moves).map(([whiteMove, blackMove], index) => (
                <div 
                  key={index}
                  className="flex text-sm font-mono"
                >
                  <span className="w-8 text-gray-500">{index + 1}.</span>
                  <button
                    className={`px-2 ${currentMoveIndex === index * 2 ? 'bg-blue-500 text-white' : 'text-blue-300 hover:bg-gray-800'} rounded`}
                    onClick={() => goToMove(index * 2)}
                  >
                    {whiteMove}
                  </button>
                  {blackMove && (
                    <button
                      className={`px-2 ml-2 ${currentMoveIndex === index * 2 + 1 ? 'bg-blue-500 text-white' : 'text-blue-300 hover:bg-gray-800'} rounded`}
                      onClick={() => goToMove(index * 2 + 1)}
                    >
                      {blackMove}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Games List Panel with Filters */}
        {games.length > 1 && (
          <div className="bg-gray-900 rounded-lg shadow-lg shadow-black/20 p-4">
            <h3 className="text-white font-bold mb-3">Games</h3>
            
            {/* Search and Filters */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search games..."
                  className="w-full bg-gray-800 text-gray-200 px-3 py-2 rounded border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={activeFilters.result}
                  onChange={(e) => setActiveFilters(prev => ({ ...prev, result: e.target.value }))}
                  className="bg-gray-800 text-gray-200 px-3 py-2 rounded border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All Results</option>
                  <option value="1-0">White Wins</option>
                  <option value="0-1">Black Wins</option>
                  <option value="1/2-1/2">Draw</option>
                </select>
                <input
                  type="text"
                  value={activeFilters.date}
                  onChange={(e) => setActiveFilters(prev => ({ ...prev, date: e.target.value }))}
                  placeholder="Filter by year..."
                  className="bg-gray-800 text-gray-200 px-3 py-2 rounded border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Games List */}
            <div className="grid grid-cols-2 gap-2">
              {filteredGames.map((game, index) => (
                <button
                  key={index}
                  onClick={() => loadGame(index)}
                  className={`text-left p-2 rounded ${
                    index === currentGameIndex ? 'bg-blue-500 text-white' : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <div className="text-sm">
                    <div className="font-semibold">
                      {game.headers['White']} vs {game.headers['Black']}
                    </div>
                    <div className="text-xs opacity-75">
                      {game.headers['Event']} • {game.headers['Date']}
                    </div>
                    <div className="text-xs opacity-75">
                      Result: {game.headers['Result']}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default ChessViewer;