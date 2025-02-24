'use client';

import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Square } from 'chess.js';
import { type AnalysisMove, type AnalysisInfo, type EngineSettings } from '../services/ChessEngineService';
import { type PositionObserver } from '../services/GameManager';
import { type PgnGame } from '../services/PgnService';
import { type AnalysisObserver } from '../services/EngineAnalysisService';
import { type NavigationObserver, type NavigationCommand } from '../services/NavigationService';
import { type OpeningMove, type OpeningPosition } from '../services/OpeningBookService';
import GameList from './GameList';
import { type MoveTreeObserver } from '../services/MoveTreeService';
import { BoardManager, type BoardState } from '../services/BoardManager';
import MoveTree from './MoveTree';
import OpeningBook from './OpeningBook';
import type { GameFilter } from '../services/GameListService';

interface Move {
  san: string;
  fen: string;
  variations: Move[][];
}

export interface ChessViewerProps {
  id: string;
  name?: string;
  className?: string;
}

export interface ChessViewerHandle {
  handleFileUpload: (file: File) => Promise<void>;
  handlePaste: () => Promise<void>;
  handlePasteFEN: () => Promise<void>;
}

export const ChessViewer = forwardRef<ChessViewerHandle, ChessViewerProps>((props, ref) => {
  const boardManager = BoardManager.getInstance();
  const [boardState, setBoardState] = useState<BoardState | null>(null);
  const [boardWidth, setBoardWidth] = useState(600);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [activeTab, setActiveTab] = useState<'notation' | 'openingBook'>('notation');
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [engineSettings, setEngineSettings] = useState({
    threads: 1,
    hash: 2048,
    multiPv: 4,
    depth: 40
  });
  const [games, setGames] = useState<PgnGame[]>([]);
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [chessboard, setChessboard] = useState(new Chess());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisMove[]>([]);
  const [analysisInfo, setAnalysisInfo] = useState<AnalysisInfo>({ depth: 0, nodes: 0, nps: 0 });
  const [engineVersion, setEngineVersion] = useState<string>('');
  const [openingMoves, setOpeningMoves] = useState<OpeningMove[]>([]);
  const [openingPosition, setOpeningPosition] = useState<OpeningPosition | null>(null);
  const [isLoadingOpenings, setIsLoadingOpenings] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);

  const currentGame = games[currentGameIndex];
  const whitePlayer = currentGame?.headers['White'] || 'White';
  const blackPlayer = currentGame?.headers['Black'] || 'Black';
  const result = currentGame?.headers['Result'] || '';

  useEffect(() => {
    // Create board state when component mounts
    const newBoardState = boardManager.createBoard(
      props.id,
      props.name || `Board ${props.id}`
    );
    setBoardState(newBoardState);

    return () => {
      // Cleanup when component unmounts
      boardManager.removeBoard(props.id);
    };
  }, [props.id, props.name, boardManager]);

  useEffect(() => {
    const observer: AnalysisObserver = {
      onAnalysisUpdate: (analysis: AnalysisMove[]) => {
        setAnalysis(analysis);
      },
      onInfoUpdate: (info: AnalysisInfo) => {
        setAnalysisInfo(info);
      },
      onEngineStatusChange: (isAnalyzing: boolean) => {
        setIsAnalyzing(isAnalyzing);
        if (!isAnalyzing) {
          setAnalysis([]);
          setAnalysisInfo({ depth: 0, nodes: 0, nps: 0 });
        }
      }
    };

    if (boardState) {
      boardState.engineService.initialize(engineSettings);
      boardState.engineService.addObserver(observer);
      return () => {
        boardState.engineService.removeObserver(observer);
      };
    }
  }, [boardState, engineSettings]);

  useEffect(() => {
    const observer: PositionObserver = {
      onPositionChange: (position: Chess, moveIndex: number) => {
        setChessboard(new Chess(position.fen()));
        setCurrentMoveIndex(moveIndex);
        if (boardState?.engineService.isEngineAnalyzing()) {
          boardState.engineService.startAnalysis(position);
        }
      }
    };

    if (boardState) {
      boardState.gameManager.addObserver(observer);
      return () => boardState.gameManager.removeObserver(observer);
    }
  }, [boardState]);

  useEffect(() => {
    const observer: MoveTreeObserver = {
      onMoveTreeChanged: () => {
        setForceUpdate(prev => !prev);
      }
    };
    boardState?.moveTree.addObserver(observer);
    return () => boardState?.moveTree.removeObserver(observer);
  }, [boardState]);

  const goToMove = useCallback((moveIndex: number) => {
    if (boardState) {
      // Update both services
      boardState.moveTree.goToMove(moveIndex);
      boardState.gameManager.goToMove(moveIndex);
    }
  }, [boardState]);

  const onPieceDrop = useCallback((sourceSquare: Square, targetSquare: Square) => {
    if (!boardState || boardManager.getActiveBoard()?.id !== boardState.id) {
      return false;
    }

    return boardState.gameManager.makeMove(sourceSquare, targetSquare);
  }, [boardState, boardManager]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!boardState || boardManager.getActiveBoard()?.id !== boardState.id) {
      return;
    }

    try {
      const result = await boardState.gameManager.loadPGNFromFile(file);
      if (result.success && result.games.length > 0) {
        setGames(result.games);
        boardState.gameListService.setGames(result.games);
        
        // Load the first game by default
        const firstGame = result.games[0];
        boardState.gameManager.loadGame(firstGame);
        boardState.moveTree.loadGame(firstGame);
      }
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  }, [boardState, boardManager]);

  const handlePaste = useCallback(async () => {
    if (!boardState || boardManager.getActiveBoard()?.id !== boardState.id) {
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      const result = boardState.gameManager.loadPGN(text);
      
      if (result.success && result.games.length > 0) {
        setGames(result.games);
        boardState.gameListService.setGames(result.games);
        
        // Load the first game by default
        const firstGame = result.games[0];
        boardState.gameManager.loadGame(firstGame);
        boardState.moveTree.loadGame(firstGame);
      }
    } catch (error) {
      console.error('Failed to paste PGN:', error);
    }
  }, [boardState, boardManager]);

  const handlePasteFEN = useCallback(async () => {
    if (!boardState || boardManager.getActiveBoard()?.id !== boardState.id) {
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      const success = boardState.gameManager.loadFEN(text);
      if (!success) {
        console.error('Invalid FEN position');
      }
    } catch (error) {
      console.error('Failed to paste FEN:', error);
    }
  }, [boardState, boardManager]);

  const toggleAnalysis = useCallback(() => {
    boardState?.engineService.toggleAnalysis(boardState.gameManager.getCurrentPosition());
  }, [boardState]);

  const applyEngineSettings = useCallback((newSettings: EngineSettings) => {
    boardState?.engineService.updateSettings(newSettings);
    setEngineSettings(newSettings);
  }, [boardState]);

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

  const loadGame = (game: PgnGame) => {
    try {
      const initialPosition = new Chess();
      setCurrentMoveIndex(-1);
      setChessboard(initialPosition);
      boardState?.gameManager.loadGame(game);
    } catch (error) {
      console.error('Failed to load game:', error);
    }
  };

  const getPairedMoves = (moves: Move[]) => {
    return moves.reduce<Array<[string, string | null]>>((pairs, move, index) => {
      if (index % 2 === 0) {
        pairs.push([move.san, moves[index + 1]?.san || null]);
      }
      return pairs;
    }, []);
  };

  // Initialize navigation service with observer
  useEffect(() => {
    const observer: NavigationObserver = {
      onNavigationCommand: (command: NavigationCommand) => {
        switch (command) {
          case 'first':
            goToMove(-1);
            break;
          case 'prev':
            goToMove(currentMoveIndex - 1);
            break;
          case 'next':
            goToMove(currentMoveIndex + 1);
            break;
          case 'last':
            if (boardState) {
              goToMove(boardState.gameManager.getMoveHistory().length - 1);
            }
            break;
          case 'flip':
            flipBoard();
            break;
        }
      }
    };

    if (boardState) {
      boardState.navigationService.addObserver(observer);
      return () => boardState.navigationService.removeObserver(observer);
    }
  }, [boardState, currentMoveIndex, goToMove]);

  const flipBoard = () => {
    setBoardOrientation(prev => prev === 'white' ? 'black' : 'white');
  };

  const filteredGames = games;

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
                  <span className="font-mono text-blue-300">{engineSettings.threads} cores</span>
                </span>
                <span title="Hash Table Size" className="flex items-center gap-1">
                  <span>💾</span>
                  <span className="font-mono text-blue-300">{engineSettings.hash}MB</span>
                </span>
                <span title="Search Depth" className="flex items-center gap-1">
                  <span>🔍</span>
                  <span className="font-mono text-blue-300">depth {engineSettings.depth}</span>
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
                      <span className={`font-mono font-bold ${
                        !line ? 'text-white' :
                        line.mate !== undefined ? 
                          (line.mate > 0 ? 'text-green-400' : line.mate < 0 ? 'text-red-400' : 'text-white') :
                        line.score !== undefined ? 
                          (line.score > 0 ? 'text-green-400' : line.score < 0 ? 'text-red-400' : 'text-white') :
                        'text-white'
                      }`}>
                        {!line ? '0.00' :
                         line.mate !== undefined 
                          ? (line.mate > 0 ? '+' : '') + `M${Math.abs(line.mate)}`
                          : line.score !== undefined
                            ? (line.score > 0 ? '+' : '') + line.score.toFixed(2)
                            : '0.00'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {line?.pv && (
                        <div className="overflow-x-auto custom-scrollbar">
                          <div className="font-mono text-blue-300 flex whitespace-nowrap gap-2">
                            {line.pv.slice(0, 10).map((move: string, i: number) => {
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

  // Update effect to fetch opening moves when the position changes
  useEffect(() => {
    if (!boardState || activeTab !== 'openingBook') return;

    const fetchOpeningMoves = async () => {
      setIsLoadingOpenings(true);
      try {
        const position = await boardState.openingBook.getMovesForPosition(chessboard.fen());
        setOpeningPosition(position);
        setOpeningMoves(position.moves);
      } catch (error) {
        console.error('Error fetching opening moves:', error);
        setOpeningPosition(null);
        setOpeningMoves([]);
      } finally {
        setIsLoadingOpenings(false);
      }
    };

    fetchOpeningMoves();
  }, [boardState, chessboard, activeTab]);

  // Update database selection handler
  const handleDatabaseChange = useCallback((type: 'masters' | 'lichess') => {
    if (boardState) {
      boardState.openingBook.setDatabase(type);
      boardState.openingBook.clearCache();
      // This will trigger the useEffect above to fetch new data
      setActiveTab('openingBook');
    }
  }, [boardState]);

  const handleOpeningMove = (move: OpeningMove) => {
    try {
      const tempChess = new Chess(boardState?.gameManager.getCurrentPosition().fen());
      const moveObj = tempChess.move(move.san);
      
      if (moveObj) {
        const success = boardState?.gameManager.makeMove(moveObj.from, moveObj.to, moveObj.promotion);
        if (!success) {
          console.error('Failed to make move:', move.san);
        }
      }
    } catch (error) {
      console.error('Error making move:', error);
    }
  };

  const handleGameSelect = useCallback((game: PgnGame) => {
    if (!boardState) return;

    try {
      const newIndex = games.findIndex(g => 
        g.headers.White === game.headers.White &&
        g.headers.Black === game.headers.Black &&
        g.headers.Date === game.headers.Date &&
        g.headers.Event === game.headers.Event &&
        g.headers.Round === game.headers.Round
      );
      setCurrentGameIndex(newIndex);

      boardState.gameManager.loadGame(game);
      boardState.moveTree.loadGame(game);
      setCurrentMoveIndex(-1);
      setChessboard(new Chess());

      console.log('Game loaded:', {
        index: newIndex,
        moves: game.moves,
        headers: game.headers
      });
    } catch (error) {
      console.error('Failed to load game:', error);
    }
  }, [games, boardState]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    handleFileUpload,
    handlePaste,
    handlePasteFEN
  }), [handleFileUpload, handlePaste, handlePasteFEN]);

  // Add effect to handle PGN updates when loading games or FEN positions
  useEffect(() => {
    if (games.length === 0 && isAnalyzing) {
      boardState?.engineService.startAnalysis(chessboard);
    }
  }, [games.length, chessboard, boardState, isAnalyzing]);

  // Add effect to handle analysis when isAnalyzing changes
  ChessViewer.displayName = 'ChessViewer';

  // Update the MoveTree rendering
  useEffect(() => {
    if (activeTab === 'notation' && boardState) {
      console.log('Rendering MoveTree with:', {
        moves: boardState.moveTree.getMoves(),
        currentMoveIndex: boardState.moveTree.getCurrentMoveIndex()
      });
    }
  }, [activeTab, boardState, forceUpdate]);

  if (!boardState) {
    return null;
  }

  return (
    <div className="max-w-[1800px] mx-auto space-y-6">
      {/* Board and Analysis Grid */}
      <div className="grid grid-cols-[auto_400px] gap-6 items-start">
        {/* Left Column: Board and Navigation */}
        <div className="space-y-2 flex flex-col items-center justify-center">
          {/* Board Section */}
          <div className="bg-gray-900 rounded-lg shadow-lg shadow-black/20 p-4">
            <div className="relative" style={{ width: boardWidth }}>
              <div className="flex flex-col items-center">
                <Chessboard 
                  position={boardState.gameManager.getCurrentPosition().fen()}
                  boardWidth={boardWidth}
                  areArrowsAllowed={true}
                  showBoardNotation={true}
                  boardOrientation={boardOrientation}
                  onPieceDrop={onPieceDrop}
                />
              </div>
              {/* Turn indicator */}
              <div 
                className={`absolute bottom-0 left-0 w-3 h-3 rounded-full ${
                  boardState.gameManager.getCurrentPosition().turn() === 'w' 
                    ? 'bg-white' 
                    : 'bg-black'
                }`}
                title={`${boardState.gameManager.getCurrentPosition().turn() === 'w' ? 'White' : 'Black'} to move`}
              />
            </div>
          </div>

          {/* Navigation Controls */}
          <div style={{ width: boardWidth }} className="flex justify-center gap-2 bg-gray-900/50 rounded-lg shadow-lg shadow-black/20 p-1.5">
            <button
              onClick={() => goToMove(-1)}
              className="p-2 text-lg bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors w-9 h-9 flex items-center justify-center"
              title="First move"
            >
              ⏮
            </button>
            <button
              onClick={() => goToMove(currentMoveIndex - 1)}
              className="p-2 text-lg bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors w-9 h-9 flex items-center justify-center"
              title="Previous move"
            >
              ◀
            </button>
            <button
              onClick={flipBoard}
              className="p-2 text-xl bg-amber-500 text-white rounded-full hover:bg-amber-600 transition-colors w-9 h-9 flex items-center justify-center"
              title="Flip board"
            >
              ⟲
            </button>
            <button
              onClick={() => goToMove(currentMoveIndex + 1)}
              className="p-2 text-lg bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors w-9 h-9 flex items-center justify-center"
              title="Next move"
            >
              ▶
            </button>
            <button
              onClick={() => goToMove(boardState.gameManager.getMoveHistory().length - 1)}
              className="p-2 text-lg bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors w-9 h-9 flex items-center justify-center"
              title="Last move"
            >
              ⏭
            </button>
          </div>
        </div>

        {/* Right Column: Analysis, Moves/Opening Book */}
        <div className="space-y-4 sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto">
          {/* Analysis Section */}
          <div className="bg-gray-900/50 rounded-lg shadow-lg shadow-black/20">
            {/* Analysis Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/50">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleAnalysis}
                  className="text-gray-400 hover:text-white"
                >
                  {isAnalyzing ? '◼' : '▶'}
                </button>
                <span className="text-sm text-gray-300">
                  SF {engineVersion || '...'} · {engineSettings.hash}MB NNUE
                </span>
                <button
                  onClick={() => setShowEngineSettings(true)}
                  className="text-gray-400 hover:text-white ml-2"
                  title="Engine Settings"
                >
                  ⚙️
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>Depth {analysisInfo.depth}/{engineSettings.depth}</span>
                <span>∞</span>
              </div>
            </div>

            {/* Analysis Lines */}
            {isAnalyzing && (
              <div className="text-sm">
                {analysis.length === 0 ? (
                  <div className="px-3 py-1.5 text-gray-400">
                    Analyzing position...
                  </div>
                ) : (
                  analysis.map((line, index) => (
                    <div key={index} className="px-3 py-1.5 hover:bg-white/5 flex items-baseline gap-3">
                      <span className={`font-mono font-medium w-12 ${
                        !line ? 'text-gray-300' :
                        line.mate !== undefined ? 
                          (line.mate > 0 ? 'text-[#9ece6a]' : line.mate < 0 ? 'text-[#f7768e]' : 'text-gray-300') :
                        line.score !== undefined ? 
                          (line.score > 0 ? 'text-[#9ece6a]' : line.score < 0 ? 'text-[#f7768e]' : 'text-gray-300') :
                        'text-gray-300'
                      }`}>
                        {!line ? '0.0' :
                         line.mate !== undefined 
                          ? (line.mate > 0 ? '+' : '') + `M${Math.abs(line.mate)}`
                          : line.score !== undefined
                            ? (line.score > 0 ? '+' : '') + line.score.toFixed(1)
                            : '0.0'}
                      </span>
                      <div className="font-mono text-gray-300 flex flex-wrap gap-1">
                        {line?.pv?.slice(0, 20).map((move: string, i: number) => (
                          <React.Fragment key={i}>
                            {i % 2 === 0 && (
                              <span className="text-gray-500 select-none">{Math.floor(i / 2) + 1}.</span>
                            )}
                            <span className={`${i === 0 ? 'text-white' : ''}`}>
                              {move}
                            </span>
                          </React.Fragment>
                        ))}
                        {(line?.pv?.length || 0) > 20 && <span className="text-gray-500">...</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Tabbed Interface for Moves and Opening Book */}
          <div className="bg-gray-900 rounded-lg shadow-lg shadow-black/20">
            {/* Tab Headers */}
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => setActiveTab('notation')}
                className={`px-4 py-3 text-sm font-medium flex-1 ${
                  activeTab === 'notation'
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                Notation
              </button>
              <button
                onClick={() => setActiveTab('openingBook')}
                className={`px-4 py-3 text-sm font-medium flex-1 ${
                  activeTab === 'openingBook'
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                Opening Book
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-4">
              {activeTab === 'notation' ? (
                <div>
                  <MoveTree
                    moves={boardState.moveTree.getMoves()}
                    currentMoveIndex={boardState.moveTree.getCurrentMoveIndex()}
                    onMoveClick={(index) => {
                      console.log('Move clicked:', index);
                      goToMove(index);
                    }}
                  />
                </div>
              ) : (
                <div>
                  {isLoadingOpenings ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin text-4xl text-blue-500">♟</div>
                    </div>
                  ) : (
                    <OpeningBook
                      moves={openingMoves}
                      onMoveSelect={handleOpeningMove}
                      totalGames={openingPosition?.totalGames || 0}
                      lastUpdated={openingPosition?.lastUpdated}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Engine Settings Modal */}
          {showEngineSettings && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-gray-900 rounded-lg shadow-lg p-4 w-96">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-white">Engine Settings</h3>
                  <button
                    onClick={() => setShowEngineSettings(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Threads</label>
                    <input
                      type="number"
                      min="1"
                      max={navigator.hardwareConcurrency || 8}
                      value={engineSettings.threads}
                      onChange={(e) => setEngineSettings((prev: EngineSettings) => ({
                        ...prev,
                        threads: Math.min(Math.max(1, parseInt(e.target.value) || 1), navigator.hardwareConcurrency || 8)
                      }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Hash Size (MB)</label>
                    <input
                      type="number"
                      min="16"
                      max="4096"
                      step="16"
                      value={engineSettings.hash}
                      onChange={(e) => setEngineSettings((prev: EngineSettings) => ({
                        ...prev,
                        hash: Math.min(Math.max(16, parseInt(e.target.value) || 16), 4096)
                      }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">MultiPV</label>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={engineSettings.multiPv}
                      onChange={(e) => setEngineSettings((prev: EngineSettings) => ({
                        ...prev,
                        multiPv: Math.min(Math.max(1, parseInt(e.target.value) || 1), 8)
                      }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Max Depth</label>
                    <input
                      type="number"
                      min="10"
                      max="99"
                      value={engineSettings.depth}
                      onChange={(e) => setEngineSettings((prev: EngineSettings) => ({
                        ...prev,
                        depth: Math.min(Math.max(10, parseInt(e.target.value) || 10), 99)
                      }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <button
                      onClick={() => setShowEngineSettings(false)}
                      className="px-4 py-2 text-gray-300 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        applyEngineSettings(engineSettings);
                        setShowEngineSettings(false);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Games List */}
      {games.length > 0 && (
        <GameList
          games={games}
          currentGameIndex={currentGameIndex}
          onGameSelect={handleGameSelect}
          gameListService={boardState.gameListService}
        />
      )}
    </div>
  );
});

export default ChessViewer;