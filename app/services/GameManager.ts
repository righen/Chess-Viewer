'use client';

import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { PgnService, type PgnMove, type PgnGame, type PgnLoadResult } from './PgnService';
import { MoveTreeService } from './MoveTreeService';

export interface PositionObserver {
  onPositionChange(position: Chess, moveIndex: number): void;
}

export class GameManager {
  private static instance: GameManager | null = null;
  private chess: Chess;
  private moveHistory: PgnMove[];
  private currentMoveIndex: number;
  private observers: Set<PositionObserver>;
  private pgnService: PgnService;
  private moveTreeService: MoveTreeService;
  private games: PgnGame[] = [];
  private currentGame: Chess | null = null;

  constructor() {
    this.chess = new Chess();
    this.moveHistory = [];
    this.currentMoveIndex = -1;
    this.observers = new Set();
    this.pgnService = PgnService.getInstance();
    this.moveTreeService = new MoveTreeService();
  }

  public static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  addObserver(observer: PositionObserver) {
    this.observers.add(observer);
  }

  removeObserver(observer: PositionObserver) {
    this.observers.delete(observer);
  }

  private notifyObservers() {
    this.observers.forEach(observer => {
      observer.onPositionChange(this.chess, this.currentMoveIndex);
    });
  }

  getCurrentPosition(): Chess {
    return this.chess;
  }

  getMoveHistory(): PgnMove[] {
    return this.moveHistory;
  }

  getCurrentMoveIndex(): number {
    return this.currentMoveIndex;
  }

  goToMove(moveIndex: number): boolean {
    if (moveIndex < -1 || moveIndex >= this.moveHistory.length) return false;

    try {
      // Reset to initial position
      this.chess = new Chess();
      this.currentMoveIndex = -1;

      // Replay moves up to target index
      if (moveIndex >= 0) {
        for (let i = 0; i <= moveIndex; i++) {
          this.chess.move(this.moveHistory[i].san);
        }
        this.currentMoveIndex = moveIndex;
      }

      // Update move tree service
      this.moveTreeService.goToMove(moveIndex);
      
      this.notifyObservers();
      return true;
    } catch (error) {
      console.error('Failed to navigate to move:', error);
      return false;
    }
  }

  makeMove(from: Square, to: Square, promotion?: string): boolean {
    try {
      const move = this.chess.move({ 
        from, 
        to, 
        promotion: promotion as 'q' | 'r' | 'b' | 'n' | undefined 
      });
      if (!move) return false;

      // Create new move object
      const newMove: PgnMove = {
        san: move.san,
        fen: this.chess.fen(),
        variations: []
      };

      // Update move history
      this.moveHistory = [...this.moveHistory.slice(0, this.currentMoveIndex + 1), newMove];
      this.currentMoveIndex++;

      // Update move tree service
      this.moveTreeService.loadGame({
        pgn: this.chess.pgn(),
        moves: this.moveHistory,
        headers: this.chess.header()
      });

      this.notifyObservers();
      return true;
    } catch (error) {
      console.error('Failed to make move:', error);
      return false;
    }
  }

  loadPGN(pgnText: string): PgnLoadResult {
    try {
      const result = this.pgnService.loadFromText(pgnText);
      if (result.success && result.games.length > 0) {
        this.chess = new Chess();
        this.moveHistory = result.games[0].moves;
        this.currentMoveIndex = -1;
        this.notifyObservers();
      }
      return result;
    } catch (error) {
      console.error('Failed to load PGN:', error);
      return { success: false, games: [], error: 'Failed to load PGN' };
    }
  }

  async loadPGNFromFile(file: File): Promise<PgnLoadResult> {
    try {
      console.log('GameManager: Starting to load PGN file');
      const result = await this.pgnService.loadFromFile(file);
      console.log('GameManager: PgnService result:', {
        success: result.success,
        gamesCount: result.games.length,
        firstGameHeaders: result.games[0]?.headers
      });

      if (result.success && result.games.length > 0) {
        // Store the first game's headers before loading
        const firstGame = result.games[0];
        const headers = { ...firstGame.headers };  // Make a copy of headers
        console.log('GameManager: Preserved headers:', headers);

        // Reset chess instance and load first game
        this.chess = new Chess();
        
        // Set headers in chess instance
        Object.entries(headers).forEach(([key, value]) => {
          if (value) this.chess.header(key, value);
        });
        
        // Set move history
        this.moveHistory = firstGame.moves;
        this.currentMoveIndex = -1;

        // Notify observers
        this.notifyObservers();

        console.log('GameManager: Game loaded with headers:', {
          headers: this.chess.header(),
          moveCount: this.moveHistory.length
        });
      }
      return result;
    } catch (error) {
      console.error('GameManager: Failed to load PGN from file:', error);
      return { success: false, games: [], error: 'Failed to load PGN from file' };
    }
  }

  loadFEN(fen: string): boolean {
    try {
      const newPosition = new Chess();
      newPosition.load(fen);

      this.chess = newPosition;
      this.moveHistory = [];
      this.currentMoveIndex = -1;

      this.notifyObservers();
      return true;
    } catch (error) {
      console.error('Failed to load FEN:', error);
      return false;
    }
  }

  addVariation(moveIndex: number, moves: PgnMove[]) {
    if (moveIndex >= 0 && moveIndex < this.moveHistory.length) {
      this.moveHistory[moveIndex].variations.push(moves);
      this.notifyObservers();
    }
  }

  reset() {
    this.chess = new Chess();
    this.moveHistory = [];
    this.currentMoveIndex = -1;
    this.notifyObservers();
  }

  public loadGame(game: PgnGame) {
    try {
      console.log('GameManager: Loading game:', {
        white: game.headers.White,
        black: game.headers.Black,
        movesCount: game.moves.length,
        firstMove: game.moves[0]?.san,
        headers: game.headers
      });

      // Reset to initial position
      this.chess = new Chess();
      
      // Load the PGN with headers
      const pgnWithHeaders = Object.entries(game.headers)
        .map(([key, value]) => `[${key} "${value}"]`)
        .join('\n') + '\n\n' + game.pgn;
      
      console.log('GameManager: Loading PGN with headers:', pgnWithHeaders);
      try {
        this.chess.loadPgn(pgnWithHeaders);
      } catch (error) {
        throw new Error('Failed to load PGN');
      }

      // Set the move history
      this.moveHistory = game.moves;
      this.currentMoveIndex = -1;

      // Update move tree service first
      console.log('GameManager: Updating MoveTreeService with moves:', {
        movesCount: game.moves.length,
        moves: game.moves
      });
      this.moveTreeService.loadGame(game);
      
      // Notify observers of the new position
      console.log('GameManager: Notifying observers');
      this.notifyObservers();

      console.log('GameManager: Game loaded successfully', {
        currentPosition: this.chess.fen(),
        moveHistoryLength: this.moveHistory.length,
        currentMoveIndex: this.currentMoveIndex,
        moveTreeMoves: this.moveTreeService.getMoves().length,
        headers: this.chess.header()
      });

      return true;
    } catch (error) {
      console.error('GameManager: Error loading game:', error);
      return false;
    }
  }

  public getGames(): PgnGame[] {
    return this.games;
  }
} 