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

const formatUCIMove = (move: string, chess: Chess): string => {
  try {
    const from = move.slice(0, 2);
    const to = move.slice(2, 4);
    const promotion = move.length > 4 ? move[4] : undefined;
    
    const moves = chess.moves({ verbose: true });
    const matchingMove = moves.find(m => 
      m.from === from && 
      m.to === to && 
      (!promotion || m.promotion === promotion)
    );
    
    if (matchingMove) {
      chess.move(matchingMove);
      return matchingMove.san;
    }
    return move;
  } catch (err) {
    console.error('Error formatting move:', move, err);
    return move;
  }
};

const formatMoves = (moves: string[]): React.ReactElement => {
  if (!moves || !moves.length) return <span>No moves available</span>;
  
  try {
    const chess = new Chess();
    const formattedMoves: string[] = [];
    
    for (const move of moves) {
      const san = formatUCIMove(move, chess);
      // Replace piece letters with symbols
      const symbolized = san
        .replace(/N/g, '♘')
        .replace(/B/g, '♗')
        .replace(/R/g, '♖')
        .replace(/Q/g, '♕')
        .replace(/K/g, '♔');
      formattedMoves.push(symbolized);
    }
    
    return (
      <div className="font-mono text-gray-300">
        {formattedMoves.map((move, index) => {
          const moveNumber = Math.floor(index / 2) + 1;
          const isWhiteMove = index % 2 === 0;
          return (
            <span key={index} className="mr-2">
              {isWhiteMove ? `${moveNumber}. ` : ''}{move}
            </span>
          );
        })}
      </div>
    );
  } catch (err) {
    console.error('Error formatting moves:', err);
    return <span>Error formatting moves</span>;
  }
};

export default function StockfishTest() {
  const [engineStatus, setEngineStatus] = useState<string>('Not initialized');
  const [config, setConfig] = useState<EngineConfig>({
    threads: 1,
    hash: 128,
    wasmSupported: false,
    multiPV: 3,
    depth: 20,
    skillLevel: 20,
    contempt: 0
  });
  const [analysisInfo, setAnalysisInfo] = useState<AnalysisInfo>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([]);
  const workerRef = useRef<Worker | null>(null);

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
              if (scoreMatch[1] === 'cp') {
                info.score = parseInt(scoreMatch[2]) / 100;
              } else {
                info.mate = parseInt(scoreMatch[2]);
              }
            }

            const nodesMatch = message.match(/nodes (\d+)/);
            if (nodesMatch) info.nodes = parseInt(nodesMatch[1]);

            const npsMatch = message.match(/nps (\d+)/);
            if (npsMatch) info.nps = parseInt(npsMatch[1]);

            const timeMatch = message.match(/time (\d+)/);
            if (timeMatch) info.time = parseInt(timeMatch[1]);

            const multipvMatch = message.match(/multipv (\d+)/);
            if (multipvMatch) info.multipv = parseInt(multipvMatch[1]);

            const pvMatch = message.match(/pv (.+)/);
            if (pvMatch) {
              // Convert UCI moves to algebraic notation
              const uciMoves: string[] = pvMatch[1].split(' ');
              const chess = new Chess();
              info.pv = uciMoves.map((uciMove: string) => {
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
                  return matchingMove.san;
                }
                return uciMove;
              });
            }

            setAnalysisInfo(info);

            // Update variations with converted moves
            if (info.multipv && info.pv) {
              setVariations(prev => {
                const newVariations = [...prev];
                const index = info.multipv! - 1;
                newVariations[index] = {
                  score: info.score,
                  mate: info.mate,
                  moves: info.pv!,
                  depth: info.depth,
                  multipv: info.multipv!
                };
                return newVariations;
              });
            }
          }

          if (message === 'uciok') {
            setEngineStatus('UCI initialized');
            // Set initial options after UCI is initialized
            worker.postMessage(`setoption name Skill Level value ${config.skillLevel}`);
            worker.postMessage(`setoption name Contempt value ${config.contempt}`);
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
        worker.postMessage('isready');

      } catch (err) {
        console.error('Failed to initialize Stockfish:', err);
        setEngineStatus('Failed');
      }
    };

    initEngine();

    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage('quit');
        workerRef.current.terminate();
      }
    };
  }, [config.skillLevel, config.contempt]);

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
      workerRef.current.postMessage('position startpos');
      workerRef.current.postMessage(`go depth ${config.depth}`);
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
      // Test a specific position (Sicilian Defense)
      workerRef.current.postMessage('position fen rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2');
      workerRef.current.postMessage(`go depth ${config.depth}`);
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
      return `M${Math.abs(mate)}`;
    }
    if (score !== undefined) {
      return (score > 0 ? '+' : '') + score.toFixed(2);
    }
    return 'N/A';
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="bg-gray-900 rounded-lg shadow-lg p-6">
        {/* Engine Info Section */}
        <div className="p-4 bg-gray-800 rounded-lg mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-gray-300 font-bold mb-2">Engine Parameters</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Threads:</span>
                  <input
                    type="number"
                    value={config.threads}
                    onChange={(e) => updateEngineOption('Threads', parseInt(e.target.value))}
                    className="bg-gray-700 text-gray-300 px-2 py-1 rounded w-20"
                    min="1"
                    max={navigator.hardwareConcurrency || 8}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Hash:</span>
                  <input
                    type="number"
                    value={config.hash}
                    onChange={(e) => updateEngineOption('Hash', parseInt(e.target.value))}
                    className="bg-gray-700 text-gray-300 px-2 py-1 rounded w-20"
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
                    className="bg-gray-700 text-gray-300 px-2 py-1 rounded w-20"
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
                    className="bg-gray-700 text-gray-300 px-2 py-1 rounded w-20"
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
                    className="bg-gray-700 text-gray-300 px-2 py-1 rounded w-20"
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
                    className="bg-gray-700 text-gray-300 px-2 py-1 rounded w-20"
                    min="-100"
                    max="100"
                  />
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-gray-300 font-bold mb-2">Engine Status</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Status:</span>
                  <span className="text-gray-300">{engineStatus}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Running:</span>
                  <span className={`text-gray-300 ${isAnalyzing ? 'text-green-400' : 'text-red-400'}`}>
                    {isAnalyzing ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Current Depth:</span>
                  <span className="text-gray-300">{analysisInfo.depth || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">WASM:</span>
                  <span className="text-gray-300">{config.wasmSupported ? 'Supported' : 'Not Supported'}</span>
                </div>
                {analysisInfo.nodes && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Nodes:</span>
                    <span className="text-gray-300">{formatNumber(analysisInfo.nodes)}</span>
                  </div>
                )}
                {analysisInfo.nps && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Speed:</span>
                    <span className="text-gray-300">{formatNumber(analysisInfo.nps)}/s</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={testStartPos}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Test Start Position
          </button>
          <button
            onClick={testSpecificPos}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Test Sicilian Position
          </button>
          <button
            onClick={stopAnalysis}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Stop Analysis
          </button>
        </div>

        {variations.length > 0 && (
          <div className="space-y-1 mt-4">
            {variations.map((variation, index) => (
              <div 
                key={index}
                className="text-gray-300 flex items-start gap-4 font-mono"
              >
                <span className="w-16 flex-shrink-0">
                  {formatScore(variation.score, variation.mate)}
                </span>
                {formatMoves(variation.moves)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 