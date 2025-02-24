import React, { useEffect, useState, useRef } from 'react';
import { Chess } from 'chess.js';
import { StockfishService, EngineConfig, AnalysisInfo, Variation, EngineStatus } from '../services/StockfishService';

// Use WASM version only
const STOCKFISH_PATH = '/stockfish/stockfish-nnue-16.js';

// Add a check for browser environment
const hardwareConcurrency = typeof window !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1;

declare global {
  // Empty interface block can be removed
}

// Add a function to load Stockfish module
const loadStockfish = () => {
  return new Promise<Worker>((resolve, reject) => {
    try {
      const worker = new Worker(STOCKFISH_PATH);
      
      let initialized = false;
      let messageHandler: ((e: MessageEvent) => void) | null = null;
      
      messageHandler = (e) => {
        const message = e.data;
        if (!message || typeof message !== 'string') return;
        
        if (message === 'uciok' && !initialized) {
          initialized = true;
          if (messageHandler) {
            worker.removeEventListener('message', messageHandler);
          }
          resolve(worker);
        }
      };
      
      worker.addEventListener('message', messageHandler);
      
      worker.onerror = (err) => {
        console.error('Worker error:', err);
        if (messageHandler) {
          worker.removeEventListener('message', messageHandler);
        }
        reject(new Error('Failed to load Stockfish worker: ' + err.message));
      };

      const initTimeout = setTimeout(() => {
        if (!initialized) {
          if (messageHandler) {
            worker.removeEventListener('message', messageHandler);
          }
          worker.terminate();
          reject(new Error('Stockfish initialization timed out'));
        }
      }, 10000);

      worker.postMessage('uci');

      worker.addEventListener('message', () => {
        clearTimeout(initTimeout);
      }, { once: true });

    } catch (err) {
      console.error('Worker creation error:', err);
      reject(err);
    }
  });
};

export default function StockfishTest() {
  const [engineStatus, setEngineStatus] = useState<string>('Not initialized');
  const [config, setConfig] = useState<EngineConfig>({
    threads: typeof window !== 'undefined' ? Math.min(navigator.hardwareConcurrency || 1, 12) : 1,
    hash: 128,
    multiPV: 3,
    depth: 40,
    skillLevel: 20
  });
  const [analysisInfo, setAnalysisInfo] = useState<AnalysisInfo>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [fenInput, setFenInput] = useState('');
  const [isBlackToMove, setIsBlackToMove] = useState(false);
  const engineRef = useRef<StockfishService | null>(null);

  useEffect(() => {
    const initEngine = async () => {
      try {
        // Create engine instance
        engineRef.current = new StockfishService(config);
        
        // Set up callbacks
        engineRef.current.setCallbacks({
          onAnalysis: (newVariations) => {
            setVariations(newVariations);
          },
          onInfo: (info) => {
            setAnalysisInfo(prev => ({...prev, ...info}));
          },
          onStatus: (status) => {
            setEngineStatus(status.state);
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
        setEngineStatus('Failed');
      }
    };

    if (typeof window !== 'undefined') {
      initEngine();
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, []);

  const updateEngineOption = (option: string, value: number) => {
    if (!engineRef.current) return;
    
    const newConfig = { 
      ...config, 
      [option.toLowerCase().replace(' ', '')]: value 
    };
    
    setConfig(newConfig);
    engineRef.current.updateConfig(newConfig);
  };

  const testStartPos = () => {
    if (!engineRef.current) return;

    try {
      setVariations([]);
      setAnalysisInfo({});
      setIsBlackToMove(false);
      engineRef.current.analyze('startpos');
    } catch (err) {
      setIsAnalyzing(false);
    }
  };

  const testSpecificPos = () => {
    if (!engineRef.current) return;

    try {
      setVariations([]);
      setAnalysisInfo({});
      setIsBlackToMove(false);
      engineRef.current.analyze('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2');
    } catch (err) {
      setIsAnalyzing(false);
    }
  };

  const analyzeFen = () => {
    if (!engineRef.current) return;

    if (!isValidFen(fenInput)) {
      alert('Invalid FEN position');
      return;
    }

    try {
      const chess = new Chess(fenInput);
      setVariations([]);
      setAnalysisInfo({});
      setIsBlackToMove(chess.turn() === 'b');
      engineRef.current.analyze(fenInput);
    } catch (err) {
      setIsAnalyzing(false);
    }
  };

  const stopAnalysis = () => {
    if (!engineRef.current) return;
    engineRef.current.stop();
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
                {analysisInfo.nodes && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Nodes:</span>
                    <span className="text-gray-200">{formatNumber(analysisInfo.nodes || 0)}</span>
                  </div>
                )}
                {analysisInfo.nps && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Speed:</span>
                    <span className="text-gray-200">{formatNumber(analysisInfo.nps || 0)}/s</span>
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

        {/* Analysis Display */}
        <div className="mt-8 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden w-full shadow-lg shadow-black/20">
          <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-lg">Engine Analysis</h3>
                <div className="flex items-center gap-4 text-sm">
                  <span title="CPU Threads" className="flex items-center gap-1">
                    <span>🧠</span>
                    <span className="font-mono text-blue-300">{config.threads} cores</span>
                  </span>
                  <span title="Hash Table Size" className="flex items-center gap-1">
                    <span>💾</span>
                    <span className="font-mono text-blue-300">{config.hash}MB</span>
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
            {variations.length === 0 && isAnalyzing ? (
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
                  {variations.map((variation, index) => (
                    <tr key={index} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="w-6 h-6 flex items-center justify-center bg-gray-800 rounded-full font-medium text-blue-300">
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold ${
                          variation.mate !== undefined
                            ? (variation.mate > 0 ? 'text-green-400' : 'text-red-400')
                            : (variation.score > 0 ? 'text-green-400' : variation.score < 0 ? 'text-red-400' : 'text-white')
                        }`}>
                          {variation.mate !== undefined
                            ? `M${Math.abs(variation.mate)}`
                            : (variation.score > 0 ? '+' : '') + variation.score.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="overflow-x-auto custom-scrollbar">
                          <div className="font-mono text-blue-300 flex whitespace-nowrap gap-2">
                            {variation.moves.slice(0, 10).map((move, i) => (
                              <React.Fragment key={i}>
                                {i % 2 === 0 && (
                                  <span className="text-gray-500 select-none">{Math.floor(i/2 + 1)}.</span>
                                )}
                                <span className={`${i === 0 ? 'font-bold text-white' : ''} hover:bg-blue-900/30 px-1 rounded cursor-default`}>
                                  {move}
                                </span>
                              </React.Fragment>
                            ))}
                            {variation.moves.length > 10 && (
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
      </div>
    </div>
  );
} 