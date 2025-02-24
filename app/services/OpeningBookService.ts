import { Chess } from 'chess.js';

export interface OpeningMove {
  san: string;
  games: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  fen: string;
}

export type DatabaseType = 'masters' | 'lichess';

export interface OpeningPosition {
  fen: string;
  moves: OpeningMove[];
  totalGames: number;
  lastUpdated?: string;
}

interface CacheEntry {
  position: OpeningPosition;
  timestamp: number;
}

interface ApiMove {
  san: string;
  white: number;
  draws: number;
  black: number;
  uci: string;
}

interface ApiResponse {
  moves: ApiMove[];
  updated: string;
}

export class OpeningBookService {
  private static instance: OpeningBookService;
  private cache: Map<string, CacheEntry>;
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes
  private currentDatabase: DatabaseType = 'masters';

  private constructor() {
    this.cache = new Map();
  }

  public static getInstance(): OpeningBookService {
    if (!OpeningBookService.instance) {
      OpeningBookService.instance = new OpeningBookService();
    }
    return OpeningBookService.instance;
  }

  public getCurrentDatabase(): DatabaseType {
    return this.currentDatabase;
  }

  public setDatabase(type: DatabaseType) {
    this.currentDatabase = type;
    this.cache.clear();
  }

  private getCacheKey(fen: string): string {
    return `${this.currentDatabase}:${fen}`;
  }

  private isCacheValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < this.cacheTimeout;
  }

  public async getMovesForPosition(fen: string): Promise<OpeningPosition> {
    const cacheKey = this.getCacheKey(fen);
    const cachedEntry = this.cache.get(cacheKey);

    if (cachedEntry && this.isCacheValid(cachedEntry)) {
      return cachedEntry.position;
    }

    const position = await this.fetchPositionFromDatabase(fen);
    
    this.cache.set(cacheKey, {
      position,
      timestamp: Date.now()
    });

    return position;
  }

  private async fetchPositionFromDatabase(fen: string): Promise<OpeningPosition> {
    const endpoint = this.currentDatabase === 'masters'
      ? 'https://explorer.lichess.ovh/masters'
      : 'https://explorer.lichess.ovh/lichess';

    try {
      const response = await fetch(`${endpoint}?fen=${encodeURIComponent(fen)}&recentGames=0`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: ApiResponse = await response.json();
      return this.transformApiResponse(data, fen);
    } catch (error) {
      console.error('Error fetching opening data:', error);
      return this.createEmptyPosition(fen);
    }
  }

  private transformApiResponse(data: ApiResponse, fen: string): OpeningPosition {
    if (!data || !Array.isArray(data.moves)) {
      return this.createEmptyPosition(fen);
    }

    try {
      // Validate FEN before processing
      const chess = new Chess();
      try {
        chess.load(fen);
      } catch {
        return this.createEmptyPosition(fen);
      }

      const moves: OpeningMove[] = [];
      for (const move of data.moves) {
        try {
          const moveChess = new Chess(fen);
          moveChess.move(move.san);
          moves.push({
            san: move.san,
            games: move.white + move.draws + move.black,
            whiteWins: move.white,
            draws: move.draws,
            blackWins: move.black,
            fen: moveChess.fen()
          });
        } catch (error) {
          console.error('Error calculating FEN for move:', move.san, error);
          // Skip invalid moves
        }
      }

      return {
        fen,
        moves,
        totalGames: moves.reduce((sum, move) => sum + move.games, 0),
        lastUpdated: data.updated
      };
    } catch (error) {
      // If FEN is invalid, return empty position
      return this.createEmptyPosition(fen);
    }
  }

  private createEmptyPosition(fen: string): OpeningPosition {
    return {
      fen,
      moves: [],
      totalGames: 0,
      lastUpdated: new Date().toISOString()
    };
  }

  public clearCache() {
    this.cache.clear();
  }

  public setCacheTimeout(milliseconds: number) {
    this.cacheTimeout = milliseconds;
  }
} 