import React, { useEffect, useState, useRef } from 'react';
import { Chess } from 'chess.js';

interface EngineConfig {
  threads: number;
  hash: number;
  wasmSupported: boolean;
  multiPV: number;
  depth: number;
  skillLevel: number;
  contempt: number;
}

interface AnalysisInfo {
  depth?: number;
  score?: number;
  mate?: number;
  pv?: string[];
  nodes?: number;
  nps?: number;
  time?: number;
  multipv?: number;
}

interface Variation {
  score?: number;
  mate?: number;
  moves: string[];
  depth?: number;
  multipv: number;
}

// Add a check for browser environment
const hardwareConcurrency = typeof window !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1;

export default function StockfishTest() {
  const [engineStatus, setEngineStatus] = useState<string>('Not initialized');
  const [config, setConfig] = useState<EngineConfig>({
    threads: typeof window !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1,
    hash: 1024,
    wasmSupported: false,
    multiPV: 5,
    depth: 40,
    skillLevel: 20,
    contempt: 0
  });
  const [analysisInfo, setAnalysisInfo] = useState<AnalysisInfo>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [fenInput, setFenInput] = useState('');
  const workerRef = useRef<Worker | null>(null);
  const [isBlackToMove, setIsBlackToMove] = useState(false);

  useEffect(() => {
    const initEngine = () => {
      try {
        setEngineStatus('Initializing...');
        
        // Check WebAssembly support
        const wasmSupported = typeof WebAssembly === 'object' && 
          WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));

        // Update config with WebAssembly support status
        setConfig(prev => ({ ...prev, wasmSupported }));
        
        // Create worker with appropriate version
        const workerPath = wasmSupported ? '/stockfish.wasm.js' : '/stockfish.js';
        const worker = new Worker(workerPath);
        workerRef.current = worker;
        
        // Set up message handler
        worker.onmessage = (e) => {
          const message = e.data;

          // Parse analysis info
          if (message.startsWith('info')) {
            const info: AnalysisInfo = {};
            
            const depthMatch = message.match(/depth (\d+)/);
            if (depthMatch) info.depth = parseInt(depthMatch[1]);

            const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
            if (scoreMatch) {
              const [, type, value] = scoreMatch;
              const numericValue = parseInt(value);
              if (type === 'cp') {
                info.score = numericValue;
              } else {
                info.mate = numericValue;
              }
            }

            const nodesMatch = message.match(/nodes (\d+)/);
            if (nodesMatch) info.nodes = parseInt(nodesMatch[1]);

            const npsMatch = message.match(/nps (\d+)/);
            if (npsMatch) info.nps = parseInt(npsMatch[1]);

            const multipvMatch = message.match(/multipv (\d+)/);
            if (multipvMatch) info.multipv = parseInt(multipvMatch[1]);

            const pvMatch = message.match(/pv (.+)/);
            if (pvMatch && info.multipv && (info.score !== undefined || info.mate !== undefined)) {
              const uciMoves = pvMatch[1].split(' ');
              const chess = new Chess();
              const sanMoves: string[] = [];
              
              for (const uciMove of uciMoves) {
                try {
                  const from = uciMove.slice(0, 2);
                  const to = uciMove.slice(2, 4);
                  const promotion = uciMove.length > 4 ? uciMove[4] : undefined;
                  
                  const moves = chess.moves({ verbose: true });
                  const matchingMove = moves.find(m => 
                    m.from === from && 
                    m.to === to && 
                    (!promotion || m.promotion === promotion)
                  );
                  
                  if (matchingMove) {
                    chess.move(matchingMove);
                    sanMoves.push(matchingMove.san);
                  }
                } catch (err) {
                  console.error('Error converting move:', uciMove, err);
                  break;
                }
              }
              
              if (sanMoves.length > 0) {
                setVariations(prev => {
                  const newVariations = [...prev];
                  
                  // Convert centipawns to pawns and keep scores from engine's perspective
                  const scoreInPawns = (info.score ?? 0) / 100;  // Always divide by 100, keep original sign
                  
                  // Create new variation
                  const newVariation = {
                    score: scoreInPawns,
                    mate: info.mate,  // Keep original mate score
                    moves: sanMoves,
                    depth: info.depth,
                    multipv: info.multipv!
                  };

                  // Update or add variation based on multipv
                  const index = newVariations.findIndex(v => v.multipv === info.multipv);
                  if (index !== -1) {
                    newVariations[index] = newVariation;
                  } else {
                    newVariations.push(newVariation);
                  }

                  // Sort variations by score
                  newVariations.sort((a, b) => {
                    // Handle mate scores first
                    if (a.mate !== undefined && b.mate !== undefined) {
                      // For both players: positive mate is better than negative mate
                      if (a.mate > 0 && b.mate > 0) return a.mate - b.mate; // Shorter mate is better
                      if (a.mate < 0 && b.mate < 0) return b.mate - a.mate; // Longer mate is better
                      return b.mate - a.mate; // Positive beats negative
                    }
                    // Mate beats non-mate
                    if (a.mate !== undefined) return a.mate > 0 ? -1 : 1;
                    if (b.mate !== undefined) return b.mate > 0 ? 1 : -1;
                    // Compare regular scores - higher is always better from engine's perspective
                    return b.score! - a.score!;
                  });

                  // Keep only top 5 variations
                  return newVariations.slice(0, 5);
                });
              }
            }

            setAnalysisInfo(info);
          }

          if (message === 'uciok') {
            setEngineStatus('UCI initialized');
            worker.postMessage('setoption name MultiPV value 5');
            worker.postMessage('setoption name Threads value ' + config.threads);
            worker.postMessage('setoption name Hash value ' + config.hash);
            worker.postMessage('setoption name Use NNUE value true');
            worker.postMessage('setoption name UCI_AnalyseMode value true');
            worker.postMessage('setoption name Skill Level value ' + config.skillLevel);
            worker.postMessage('setoption name Contempt value ' + config.contempt);
            worker.postMessage('isready');
          } else if (message === 'readyok') {
            setEngineStatus('Engine ready');
          }
        };

        // Set up error handler
        worker.onerror = (e) => {
          console.error('Worker error:', e);
          setEngineStatus('Error');
        };

        // Initialize UCI
        worker.postMessage('uci');
      } catch (err) {
        console.error('Failed to initialize Stockfish:', err);
        setEngineStatus('Failed');
      }
    };

    // Only initialize in browser environment
    if (typeof window !== 'undefined') {
      initEngine();
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage('quit');
        workerRef.current.terminate();
      }
    };
  }, [config.skillLevel, config.contempt, config.threads, config.hash]);

  const updateEngineOption = (option: string, value: number) => {
    if (!workerRef.current || engineStatus !== 'Engine ready') return;
    workerRef.current.postMessage(`setoption name ${option} value ${value}`);
    setConfig(prev => ({ ...prev, [option.toLowerCase().replace(' ', '')]: value }));
  };

  // Test functions
  const testStartPos = () => {
    if (!workerRef.current) {
      console.error('Engine not initialized');
      return;
    }

    try {
      setIsAnalyzing(true);
      setVariations([]);
      setIsBlackToMove(false); // Starting position is White to move
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage('setoption name MultiPV value 5');
      workerRef.current.postMessage('position startpos');
      workerRef.current.postMessage(`go depth ${config.depth} multipv 5`);
    } catch (err) {
      console.error('Analysis error:', err);
    }
  };

  const testSpecificPos = () => {
    if (!workerRef.current) {
      console.error('Engine not initialized');
      return;
    }

    try {
      setIsAnalyzing(true);
      setVariations([]);
      setIsBlackToMove(false); // Sicilian position is White to move
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage('setoption name MultiPV value 5');
      workerRef.current.postMessage('position fen rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2');
      workerRef.current.postMessage(`go depth ${config.depth} multipv 5`);
    } catch (err) {
      console.error('Analysis error:', err);
    }
  };

  const stopAnalysis = () => {
    if (!workerRef.current) return;
    workerRef.current.postMessage('stop');
    setIsAnalyzing(false);
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatScore = (score?: number, mate?: number): string => {
    if (mate !== undefined) {
      return (isBlackToMove ? '-' : (mate > 0 ? '+' : '')) + `M${Math.abs(mate)}`;
    }
    if (score !== undefined) {
      return (isBlackToMove ? '-' : (score > 0 ? '+' : '')) + Math.abs(score).toFixed(2);
    }
    return 'N/A';
  };

  // Helper to determine score color based on the score value
  const getScoreColor = (score?: number, mate?: number): string => {
    if (isBlackToMove) return 'text-red-400';  // Always red for Black's turn
    if (mate !== undefined) {
      return mate > 0 ? 'text-green-400' : 'text-red-400';
    }
    if (score !== undefined) {
      if (Math.abs(score) < 0.2) return 'text-white'; // Near equal position (±0.2 pawns)
      return score > 0 ? 'text-green-400' : 'text-red-400';
    }
    return 'text-gray-400';
  };

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

  // Add analyze FEN function
  const analyzeFen = () => {
    if (!workerRef.current) {
      console.error('Engine not initialized');
      return;
    }

    if (!isValidFen(fenInput)) {
      alert('Invalid FEN position');
      return;
    }

    try {
      const chess = new Chess(fenInput);
      setIsBlackToMove(chess.turn() === 'b');
      setIsAnalyzing(true);
      setVariations([]);
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage('ucinewgame');
      workerRef.current.postMessage('setoption name MultiPV value 5');
      workerRef.current.postMessage('isready');
      workerRef.current.postMessage(`position fen ${fenInput}`);
      workerRef.current.postMessage(`go depth ${config.depth} multipv 5`);

      // Update the message handler to use this position for move validation
      workerRef.current.onmessage = (e: MessageEvent) => {
        const message = e.data;

        if (message.startsWith('info')) {
          const info: AnalysisInfo = {};
          
          const depthMatch = message.match(/depth (\d+)/);
          if (depthMatch) info.depth = parseInt(depthMatch[1]);

          const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
          if (scoreMatch) {
            const [, type, value] = scoreMatch;
            const numericValue = parseInt(value);
            if (type === 'cp') {
              info.score = numericValue;
            } else {
              info.mate = numericValue;
            }
          }

          const nodesMatch = message.match(/nodes (\d+)/);
          if (nodesMatch) info.nodes = parseInt(nodesMatch[1]);

          const npsMatch = message.match(/nps (\d+)/);
          if (npsMatch) info.nps = parseInt(npsMatch[1]);

          const multipvMatch = message.match(/multipv (\d+)/);
          if (multipvMatch) info.multipv = parseInt(multipvMatch[1]);

          const pvMatch = message.match(/pv (.+)/);
          if (pvMatch && info.multipv && (info.score !== undefined || info.mate !== undefined)) {
            const uciMoves = pvMatch[1].split(' ');
            const positionChess = new Chess(fenInput);
            const sanMoves: string[] = [];
            
            for (const uciMove of uciMoves) {
              try {
                const from = uciMove.slice(0, 2);
                const to = uciMove.slice(2, 4);
                const promotion = uciMove.length > 4 ? uciMove[4] : undefined;
                
                const moves = positionChess.moves({ verbose: true });
                const matchingMove = moves.find(m => 
                  m.from === from && 
                  m.to === to && 
                  (!promotion || m.promotion === promotion)
                );
                
                if (matchingMove) {
                  positionChess.move(matchingMove);
                  sanMoves.push(matchingMove.san);
                }
              } catch (err) {
                console.error('Error converting move:', uciMove, err);
                break;
              }
            }
            
            if (sanMoves.length > 0) {
              setVariations(prev => {
                const newVariations = [...prev];
                
                // Convert centipawns to pawns and keep scores from engine's perspective
                const scoreInPawns = (info.score ?? 0) / 100;  // Always divide by 100, keep original sign
                
                // Create new variation
                const newVariation = {
                  score: scoreInPawns,
                  mate: info.mate,  // Keep original mate score
                  moves: sanMoves,
                  depth: info.depth,
                  multipv: info.multipv!
                };

                // Update or add variation based on multipv
                const index = newVariations.findIndex(v => v.multipv === info.multipv);
                if (index !== -1) {
                  newVariations[index] = newVariation;
                } else {
                  newVariations.push(newVariation);
                }

                // Sort variations by score
                newVariations.sort((a, b) => {
                  // Handle mate scores first
                  if (a.mate !== undefined && b.mate !== undefined) {
                    // For both players: positive mate is better than negative mate
                    if (a.mate > 0 && b.mate > 0) return a.mate - b.mate; // Shorter mate is better
                    if (a.mate < 0 && b.mate < 0) return b.mate - a.mate; // Longer mate is better
                    return b.mate - a.mate; // Positive beats negative
                  }
                  // Mate beats non-mate
                  if (a.mate !== undefined) return a.mate > 0 ? -1 : 1;
                  if (b.mate !== undefined) return b.mate > 0 ? 1 : -1;
                  // Compare regular scores - higher is always better from engine's perspective
                  return b.score! - a.score!;
                });

                // Keep only top 5 variations
                return newVariations.slice(0, 5);
              });
            }
          }

          setAnalysisInfo(info);
        }
      };
    } catch (err) {
      console.error('Analysis error:', err);
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="bg-gray-800 rounded-lg shadow-lg shadow-black/20 p-6">
        {/* Engine Info Section */}
        <div className="p-4 bg-gray-700/50 rounded-lg mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-gray-200 font-bold mb-2">Engine Parameters</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Threads:</span>
                  <input
                    type="number"
                    value={config.threads}
                    onChange={(e) => updateEngineOption('Threads', parseInt(e.target.value))}
                    className="bg-gray-700 text-gray-200 px-2 py-1 rounded w-20 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    min="1"
                    max={hardwareConcurrency}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Hash:</span>
                  <input
                    type="number"
                    value={config.hash}
                    onChange={(e) => updateEngineOption('Hash', parseInt(e.target.value))}
                    className="bg-gray-700 text-gray-200 px-2 py-1 rounded w-20 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    min="16"
                    max="1024"
                    step="16"
                  />
                  <span className="text-gray-400">MB</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">MultiPV:</span>
                  <input
                    type="number"
                    value={config.multiPV}
                    onChange={(e) => updateEngineOption('MultiPV', parseInt(e.target.value))}
                    className="bg-gray-700 text-gray-200 px-2 py-1 rounded w-20 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    min="1"
                    max="10"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Depth:</span>
                  <input
                    type="number"
                    value={config.depth}
                    onChange={(e) => updateEngineOption('Depth', parseInt(e.target.value))}
                    className="bg-gray-700 text-gray-200 px-2 py-1 rounded w-20 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    min="1"
                    max="30"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Skill Level:</span>
                  <input
                    type="number"
                    value={config.skillLevel}
                    onChange={(e) => updateEngineOption('Skill Level', parseInt(e.target.value))}
                    className="bg-gray-700 text-gray-200 px-2 py-1 rounded w-20 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    min="0"
                    max="20"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Contempt:</span>
                  <input
                    type="number"
                    value={config.contempt}
                    onChange={(e) => updateEngineOption('Contempt', parseInt(e.target.value))}
                    className="bg-gray-700 text-gray-200 px-2 py-1 rounded w-20 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    min="-100"
                    max="100"
                  />
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-gray-200 font-bold mb-2">Engine Status</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Status:</span>
                  <span className="text-gray-200">{engineStatus}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Running:</span>
                  <span className={`${isAnalyzing ? 'text-green-400' : 'text-red-400'}`}>
                    {isAnalyzing ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Current Depth:</span>
                  <span className="text-gray-200">{analysisInfo.depth || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">WASM:</span>
                  <span className="text-gray-200">{config.wasmSupported ? 'Supported' : 'Not Supported'}</span>
                </div>
                {analysisInfo.nodes && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Nodes:</span>
                    <span className="text-gray-200">{formatNumber(analysisInfo.nodes)}</span>
                  </div>
                )}
                {analysisInfo.nps && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Speed:</span>
                    <span className="text-gray-200">{formatNumber(analysisInfo.nps)}/s</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* FEN Input Section */}
        <div className="mb-4 p-4 bg-gray-700/50 rounded-lg">
          <h3 className="text-gray-200 font-bold mb-2">Position Analysis</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={fenInput}
              onChange={(e) => setFenInput(e.target.value)}
              placeholder="Enter FEN position..."
              className="flex-1 bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={analyzeFen}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              Analyze Position
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={testStartPos}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Test Start Position
          </button>
          <button
            onClick={testSpecificPos}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Test Sicilian Position
          </button>
          <button
            onClick={stopAnalysis}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
          >
            Stop Analysis
          </button>
        </div>

        {variations.length > 0 && (
          <div className="mt-4 bg-gray-700/50 rounded-lg p-4">
            <div className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 text-sm text-gray-300 font-mono">
              <div className="contents">
                <div className="font-bold text-blue-300">CPU:</div>
                <div>{config.threads} threads</div>
              </div>
              <div className="contents">
                <div className="font-bold text-blue-300">Hash:</div>
                <div>{config.hash}MB</div>
              </div>
              <div className="contents">
                <div className="font-bold text-blue-300">Depth:</div>
                <div>{analysisInfo.depth || 0}</div>
              </div>
              <div className="contents">
                <div className="font-bold text-blue-300">Nodes:</div>
                <div>{formatNumber(analysisInfo.nodes || 0)}</div>
              </div>
              <div className="contents">
                <div className="font-bold text-blue-300">Speed:</div>
                <div>{formatNumber(analysisInfo.nps || 0)}/s</div>
              </div>
            </div>

            <div className="space-y-2">
              {variations.slice(0, 5).map((variation, index) => (
                <div key={index} className="bg-gray-800/50 p-4 rounded-lg">
                  <div className="flex items-center gap-4">
                    <span className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded-full text-blue-300 font-bold">
                      {index + 1}
                    </span>
                    <span className={`font-mono font-bold text-lg ${getScoreColor(variation.score, variation.mate)}`}>
                      {formatScore(variation.score, variation.mate)}
                    </span>
                    {variation.moves.length > 0 && (
                      <span className="text-white font-bold font-mono text-lg">
                        {variation.moves[0]}
                      </span>
                    )}
                  </div>
                  {variation.moves.length > 1 && (
                    <div className="mt-2 font-mono text-gray-300">
                      {variation.moves.slice(1).map((move, i) => {
                        const moveNumber = Math.floor((i + 1) / 2) + 1;
                        const isWhiteMove = (i + 1) % 2 === 1;
                        return (
                          <span key={i} className="mr-2">
                            {isWhiteMove ? `${moveNumber}. ` : ''}{move}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 