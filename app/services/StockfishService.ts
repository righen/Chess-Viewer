import { Chess } from 'chess.js';

const STOCKFISH_PATH = '/stockfish/stockfish-nnue-16.js';

export interface EngineConfig {
  threads: number;
  hash: number;
  multiPV: number;
  depth: number;
  skillLevel: number;
}

export interface AnalysisInfo {
  depth?: number;
  score?: number;
  mate?: number;
  pv?: string[];
  nodes?: number;
  nps?: number;
  time?: number;
  multipv?: number;
  tbhits?: number;
}

export interface Variation {
  multipv: number;
  score: number;
  mate?: number;
  moves: string[];
}

export interface EngineStatus {
  state: 'not_initialized' | 'initializing' | 'ready' | 'analyzing' | 'error';
  error?: string;
}

export type AnalysisCallback = (variations: Variation[]) => void;
export type InfoCallback = (info: AnalysisInfo) => void;
export type StatusCallback = (status: EngineStatus) => void;

export class StockfishService {
  private worker: Worker | null = null;
  private _config: EngineConfig;
  private onAnalysis: AnalysisCallback | null = null;
  private onInfo: InfoCallback | null = null;
  private onStatus: StatusCallback | null = null;
  private variations: Map<number, Variation> = new Map();
  private currentFen: string = '';
  private isAnalyzing: boolean = false;

  constructor(config?: Partial<EngineConfig>) {
    const defaultConfig: EngineConfig = {
      threads: typeof window !== 'undefined' ? Math.min(navigator.hardwareConcurrency || 1, 20) : 1,
      hash: 128,
      multiPV: 4,
      depth: 40,
      skillLevel: 20
    };

    this._config = { ...defaultConfig, ...config };
  }

  public get config(): EngineConfig {
    return this._config;
  }

  public async init(): Promise<void> {
    try {
      this.updateStatus({ state: 'initializing' });
      
      if (this.worker) {
        this.worker.postMessage('quit');
        this.worker = null;
      }

      this.worker = await this.loadStockfish();
      this.setupMessageHandler();
      this.worker.postMessage('uci');
    } catch (err) {
      this.updateStatus({ 
        state: 'error', 
        error: err instanceof Error ? err.message : 'Failed to initialize engine' 
      });
      throw err;
    }
  }

  public setCallbacks({
    onAnalysis,
    onInfo,
    onStatus
  }: {
    onAnalysis?: AnalysisCallback;
    onInfo?: InfoCallback;
    onStatus?: StatusCallback;
  }) {
    this.onAnalysis = onAnalysis || null;
    this.onInfo = onInfo || null;
    this.onStatus = onStatus || null;
  }

  public updateConfig(newConfig: Partial<EngineConfig>): void {
    const oldConfig = this._config;
    this._config = { ...this._config, ...newConfig };

    if (!this.worker) return;

    // Send only changed options to the engine
    Object.entries(newConfig).forEach(([key, value]) => {
      if (oldConfig[key as keyof EngineConfig] !== value) {
        const cmd = `setoption name ${this.getOptionName(key)} value ${value}`;
        this.worker!.postMessage(cmd);
      }
    });

    this.worker.postMessage('isready');

    // Restart analysis if running
    if (this.isAnalyzing) {
      this.analyze(this.currentFen);
    }
  }

  public analyze(fen: string = 'startpos'): void {
    if (!this.worker) return;
    
    this.variations.clear();
    this.currentFen = fen;
    this.isAnalyzing = true;

    this.worker.postMessage('stop');
    this.worker.postMessage('ucinewgame');
    this.worker.postMessage(`position ${fen === 'startpos' ? 'startpos' : 'fen ' + fen}`);
    this.worker.postMessage('isready');
  }

  public stop(): void {
    if (!this.worker) return;
    this.worker.postMessage('stop');
    this.isAnalyzing = false;
  }

  public dispose(): void {
    if (this.worker) {
      this.worker.postMessage('quit');
      this.worker = null;
    }
    this.variations.clear();
    this.isAnalyzing = false;
  }

  private getOptionName(key: string): string {
    const optionNames: Record<string, string> = {
      threads: 'Threads',
      hash: 'Hash',
      multiPV: 'MultiPV',
      depth: 'Depth',
      skillLevel: 'Skill Level'
    };
    return optionNames[key] || key;
  }

  private loadStockfish(): Promise<Worker> {
    return new Promise<Worker>((resolve, reject) => {
      try {
        const worker = new Worker(STOCKFISH_PATH);
        let initialized = false;

        const messageHandler = (e: MessageEvent) => {
          const message = e.data;
          if (!message || typeof message !== 'string') return;
          
          if (message === 'uciok' && !initialized) {
            initialized = true;
            worker.removeEventListener('message', messageHandler);
            resolve(worker);
          }
        };
        
        worker.addEventListener('message', messageHandler);
        
        worker.onerror = (err) => {
          worker.removeEventListener('message', messageHandler);
          reject(new Error('Failed to load Stockfish worker: ' + err.message));
        };

        const initTimeout = setTimeout(() => {
          if (!initialized) {
            worker.removeEventListener('message', messageHandler);
            worker.terminate();
            reject(new Error('Stockfish initialization timed out'));
          }
        }, 10000);

        worker.addEventListener('message', () => {
          clearTimeout(initTimeout);
        }, { once: true });

        worker.postMessage('uci');
      } catch (err) {
        reject(err);
      }
    });
  }

  private setupMessageHandler(): void {
    if (!this.worker) return;

    this.worker.onmessage = (e: MessageEvent) => {
      const message = e.data;
      if (!message || typeof message !== 'string') return;

      if (message === 'uciok') {
        this.updateStatus({ state: 'ready' });
        const options = [
          `setoption name MultiPV value ${this.config.multiPV}`,
          `setoption name Threads value ${this.config.threads}`,
          `setoption name Hash value ${this.config.hash}`,
          `setoption name Skill Level value ${this.config.skillLevel}`
        ];
        
        options.forEach(cmd => this.worker!.postMessage(cmd));
        this.worker!.postMessage('isready');
      } else if (message === 'readyok') {
        if (this.isAnalyzing) {
          this.worker!.postMessage(`go depth ${this.config.depth} multipv ${this.config.multiPV}`);
          this.updateStatus({ state: 'analyzing' });
        }
      } else if (message.startsWith('info')) {
        this.handleInfoMessage(message);
      }
    };
  }

  private handleInfoMessage(message: string): void {
    const info: AnalysisInfo = {};
    
    // Extract depth
    const depthMatch = message.match(/depth (\d+)/);
    if (depthMatch) {
      info.depth = parseInt(depthMatch[1]);
    }

    // Extract score
    const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
    if (scoreMatch) {
      const [, type, value] = scoreMatch;
      const numericValue = parseInt(value);
      if (type === 'cp') {
        info.score = numericValue / 100; // Convert centipawns to pawns
      } else {
        info.mate = numericValue;
      }
    }

    // Extract nodes
    const nodesMatch = message.match(/nodes (\d+)/);
    if (nodesMatch) {
      info.nodes = parseInt(nodesMatch[1]);
    }

    // Extract nps (nodes per second)
    const npsMatch = message.match(/nps (\d+)/);
    if (npsMatch) {
      info.nps = parseInt(npsMatch[1]);
    }

    // Extract time
    const timeMatch = message.match(/time (\d+)/);
    if (timeMatch) {
      info.time = parseInt(timeMatch[1]);
    }

    // Extract multipv
    const multipvMatch = message.match(/multipv (\d+)/);
    if (multipvMatch) {
      info.multipv = parseInt(multipvMatch[1]);
    }

    // Extract tbhits (tablebase hits)
    const tbhitsMatch = message.match(/tbhits (\d+)/);
    if (tbhitsMatch) {
      info.tbhits = parseInt(tbhitsMatch[1]);
    }

    // Always emit info updates for real-time stats
    if (Object.keys(info).length > 0 && this.onInfo) {
      this.onInfo(info);
    }

    // Process variation if we have a PV line
    const pvMatch = message.match(/pv (.+)/);
    if (pvMatch && info.multipv && (info.score !== undefined || info.mate !== undefined)) {
      this.processVariation(pvMatch[1], info);
    }
  }

  private processVariation(pvString: string, info: AnalysisInfo): void {
    if (!info.multipv || info.multipv > this.config.multiPV) return;
    
    const multipv = Number(info.multipv);
    if (isNaN(multipv)) return;
    
    const uciMoves = pvString.split(' ');
    // Only process if we have at least 5 moves or all possible moves in position
    if (uciMoves.length < 5) return;
    
    const chess = new Chess(this.currentFen);
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
        break;
      }
    }
    
    if (sanMoves.length >= 5 && (info.score !== undefined || info.mate !== undefined)) {
      const variation: Variation = {
        multipv,
        score: info.score || 0,
        mate: info.mate,
        moves: sanMoves
      };

      // Get score for comparison
      const getEffectiveScore = (v: Variation) => {
        if (v.mate !== undefined) {
          // Mate scores should be highest priority, keeping sign for White's perspective
          return v.mate > 0 ? 1000000 + v.mate : -1000000 + v.mate;
        }
        // Regular scores are already from White's perspective
        return v.score;
      };

      // Check for duplicates based on first move
      const firstMove = sanMoves[0];
      let shouldAdd = true;

      // Get all variations with the same first move
      const duplicateVariations = Array.from(this.variations.entries())
        .filter(([_, v]) => v.moves[0] === firstMove);

      if (duplicateVariations.length > 0) {
        const newScore = getEffectiveScore(variation);
        
        // Find the variation with the best score among duplicates
        const bestDuplicate = duplicateVariations.reduce((best, current) => {
          const currentScore = getEffectiveScore(current[1]);
          return currentScore > getEffectiveScore(best[1]) ? current : best;
        });

        // Only add if this variation has a better score than existing ones
        if (newScore > getEffectiveScore(bestDuplicate[1])) {
          // Remove all variations with this starting move
          duplicateVariations.forEach(([key]) => this.variations.delete(key));
          shouldAdd = true;
        } else {
          shouldAdd = false;
        }
      }

      if (shouldAdd) {
        this.variations.set(multipv, variation);
      }
      
      if (this.onAnalysis) {
        // Get unique variations sorted by score
        const sortedVariations = Array.from(this.variations.values())
          .sort((a, b) => {
            const scoreA = getEffectiveScore(a);
            const scoreB = getEffectiveScore(b);
            return scoreB - scoreA;
          })
          .slice(0, 4); // Take exactly 4 best unique variations

        this.onAnalysis(sortedVariations);
      }
    }
  }

  private updateStatus(status: EngineStatus): void {
    if (this.onStatus) {
      this.onStatus(status);
    }
  }
} 