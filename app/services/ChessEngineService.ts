'use client';

import { Chess } from 'chess.js';

export interface EngineSettings {
  threads: number;
  hash: number;
  multiPv: number;
  depth: number;
}

export interface AnalysisMove {
  move: string;
  score: number;
  mate?: number;
  depth: number;
  nodes: number;
  nps: number;
  tbhits: number;
  pv?: string[];
}

export interface AnalysisInfo {
  depth: number;
  nodes: number;
  nps: number;
}

export class ChessEngineService {
  private worker: Worker | null = null;
  private engineVersion: string = '';
  private settings: EngineSettings;
  private onAnalysisUpdate?: (analysis: AnalysisMove[]) => void;
  private onInfoUpdate?: (info: AnalysisInfo) => void;
  private onVersionUpdate?: (version: string) => void;
  private currentAnalysis: AnalysisMove[] = [];

  constructor(settings: EngineSettings) {
    this.settings = settings;
  }

  initialize(
    onAnalysisUpdate: (analysis: AnalysisMove[]) => void,
    onInfoUpdate: (info: AnalysisInfo) => void,
    onVersionUpdate: (version: string) => void
  ) {
    this.onAnalysisUpdate = onAnalysisUpdate;
    this.onInfoUpdate = onInfoUpdate;
    this.onVersionUpdate = onVersionUpdate;

    if (typeof window === 'undefined') return;

    try {
      const wasmSupported = typeof WebAssembly === 'object' && 
        WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));

      this.worker = new Worker(wasmSupported ? '/stockfish.wasm.js' : '/stockfish.js');
      this.setupMessageHandler();
      this.initializeEngine();
    } catch (error) {
      console.error('Failed to initialize Stockfish:', error);
    }
  }

  private setupMessageHandler() {
    if (!this.worker) return;

    this.worker.onmessage = (e) => {
      const message = e.data;
      if (typeof message !== 'string') return;

      if (message.startsWith('Stockfish')) {
        this.engineVersion = message.split(' ')[1];
        this.onVersionUpdate?.(this.engineVersion);
      } else if (message.startsWith('info')) {
        this.handleInfoMessage(message);
      }
    };
  }

  private handleInfoMessage(message: string) {
    const depthMatch = message.match(/depth (\d+)/);
    const nodesMatch = message.match(/nodes (\d+)/);
    const npsMatch = message.match(/nps (\d+)/);
    const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
    const multipvMatch = message.match(/multipv (\d+)/);
    const pvMatch = message.match(/pv (.+?)(?=(?:bmc|string|depth|$))/);

    if (depthMatch || nodesMatch || npsMatch) {
      this.onInfoUpdate?.({
        depth: depthMatch ? parseInt(depthMatch[1]) : 0,
        nodes: nodesMatch ? parseInt(nodesMatch[1]) : 0,
        nps: npsMatch ? parseInt(npsMatch[1]) : 0
      });
    }

    if (pvMatch && scoreMatch && multipvMatch) {
      this.processAnalysisLine(message, pvMatch, scoreMatch, multipvMatch, depthMatch, nodesMatch, npsMatch);
    }
  }

  private processAnalysisLine(
    message: string,
    pvMatch: RegExpMatchArray,
    scoreMatch: RegExpMatchArray,
    multipvMatch: RegExpMatchArray,
    depthMatch: RegExpMatchArray | null,
    nodesMatch: RegExpMatchArray | null,
    npsMatch: RegExpMatchArray | null
  ) {
    const moves = pvMatch[1].trim().split(/\s+/);
    const [, scoreType, scoreValue] = scoreMatch;
    const scoreNum = parseInt(scoreValue);
    const depth = depthMatch ? parseInt(depthMatch[1]) : 0;
    const nodes = nodesMatch ? parseInt(nodesMatch[1]) : 0;
    const nps = npsMatch ? parseInt(npsMatch[1]) : 0;

    const chess = new Chess();
    const sanMoves: string[] = [];

    for (const move of moves) {
      try {
        const from = move.slice(0, 2) as any;
        const to = move.slice(2, 4) as any;
        const promotion = move.length > 4 ? move[4] : undefined;

        if (!from.match(/^[a-h][1-8]$/) || !to.match(/^[a-h][1-8]$/)) {
          continue;
        }

        const moveObj = {
          from,
          to,
          promotion: promotion ? promotion.toLowerCase() : undefined
        };

        const result = chess.move(moveObj);
        if (result) {
          sanMoves.push(result.san);
        }
      } catch (error) {
        console.warn('Error converting move:', move, error);
        break;
      }
    }

    if (sanMoves.length > 0) {
      this.updateAnalysis(sanMoves, scoreType, scoreNum, depth, nodes, nps);
    }
  }

  private updateAnalysis(
    sanMoves: string[],
    scoreType: string,
    scoreNum: number,
    depth: number,
    nodes: number,
    nps: number
  ) {
    const firstMove = sanMoves[0];
    const score = scoreType === 'cp' ? scoreNum / 100 : undefined;
    const mate = scoreType === 'mate' ? scoreNum : undefined;

    const newLine: AnalysisMove = {
      move: firstMove,
      score: score || 0,
      mate,
      depth,
      nodes,
      nps,
      tbhits: 0,
      pv: sanMoves
    };

    const existingIndex = this.currentAnalysis.findIndex(line => line?.move === firstMove);

    if (existingIndex !== -1) {
      this.currentAnalysis[existingIndex] = newLine;
    } else {
      this.currentAnalysis.push(newLine);
    }

    const sortedAnalysis = this.currentAnalysis
      .filter(Boolean)
      .sort((a, b) => {
        if (a.mate !== undefined && b.mate !== undefined) return b.mate - a.mate;
        if (a.mate !== undefined) return -1;
        if (b.mate !== undefined) return 1;
        return (b.score || 0) - (a.score || 0);
      })
      .slice(0, this.settings.multiPv);

    this.onAnalysisUpdate?.(sortedAnalysis);
  }

  private initializeEngine() {
    if (!this.worker) return;

    this.worker.postMessage('uci');
    this.worker.postMessage(`setoption name MultiPV value ${this.settings.multiPv}`);
    this.worker.postMessage(`setoption name Threads value ${this.settings.threads}`);
    this.worker.postMessage(`setoption name Hash value ${this.settings.hash}`);
    this.worker.postMessage('setoption name Use NNUE value true');
    this.worker.postMessage('setoption name UCI_AnalyseMode value true');
    this.worker.postMessage('isready');
  }

  startAnalysis(position: Chess) {
    if (!this.worker) return;

    this.worker.postMessage('stop');
    this.currentAnalysis = []; // Clear current analysis
    this.worker.postMessage('position fen ' + position.fen());
    this.worker.postMessage('isready');
    this.worker.postMessage(`go depth ${this.settings.depth} multipv ${this.settings.multiPv}`);
  }

  stopAnalysis() {
    if (!this.worker) return;
    this.worker.postMessage('stop');
    this.currentAnalysis = []; // Clear current analysis
  }

  updateSettings(newSettings: EngineSettings) {
    if (!this.worker) return;

    this.worker.postMessage('stop');
    this.worker.postMessage(`setoption name MultiPV value ${newSettings.multiPv}`);
    this.worker.postMessage(`setoption name Threads value ${newSettings.threads}`);
    this.worker.postMessage(`setoption name Hash value ${newSettings.hash}`);
    this.worker.postMessage('isready');

    this.settings = newSettings;
  }

  cleanup() {
    if (this.worker) {
      this.worker.postMessage('quit');
      this.worker.terminate();
      this.worker = null;
    }
  }
} 