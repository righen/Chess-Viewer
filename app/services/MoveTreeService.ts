import { type PgnMove, type PgnGame } from './PgnService';

export interface MoveTreeObserver {
  onMovesUpdate?(moves: PgnMove[]): void;
  onCurrentMoveChange?(moveIndex: number): void;
  onMoveTreeChanged(): void;
}

export class MoveTreeService {
  private static instance: MoveTreeService | null = null;
  private observers: MoveTreeObserver[] = [];
  private moves: PgnMove[] = [];
  private currentMoveIndex: number = -1;

  constructor() {
    this.moves = [];
    this.currentMoveIndex = -1;
    this.observers = [];
  }

  public static getInstance(): MoveTreeService {
    if (!MoveTreeService.instance) {
      MoveTreeService.instance = new MoveTreeService();
    }
    return MoveTreeService.instance;
  }

  public setMoves(moves: PgnMove[]): void {
    // Filter out invalid moves
    this.moves = moves.filter(move => 
      move && typeof move === 'object' && 
      'san' in move && 
      'fen' in move && 
      'variations' in move
    );
    this.currentMoveIndex = -1;
    this.notifyObservers();
  }

  public reset(): void {
    this.moves = [];
    this.currentMoveIndex = -1;
    this.notifyObservers();
  }

  public loadGame(game: PgnGame): void {
    this.moves = game.moves;
    this.currentMoveIndex = -1;
    this.notifyObservers();
  }

  public getMoves(): PgnMove[] {
    return this.moves;
  }

  public getCurrentMoveIndex(): number {
    return this.currentMoveIndex;
  }

  public goToMove(moveIndex: number): boolean {
    if (moveIndex >= -1 && moveIndex < this.moves.length) {
      this.currentMoveIndex = moveIndex;
      this.notifyObservers();
      return true;
    }
    return false;
  }

  public addObserver(observer: MoveTreeObserver): void {
    this.observers.push(observer);
    // Notify new observer of current state
    if (observer.onMovesUpdate) {
      observer.onMovesUpdate(this.moves);
    }
    if (observer.onCurrentMoveChange) {
      observer.onCurrentMoveChange(this.currentMoveIndex);
    }
    if (observer.onMoveTreeChanged) {
      observer.onMoveTreeChanged();
    }
  }

  public removeObserver(observer: MoveTreeObserver): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  private notifyObservers(): void {
    this.observers.forEach(observer => {
      if (observer.onMovesUpdate) {
        observer.onMovesUpdate(this.moves);
      }
      if (observer.onCurrentMoveChange) {
        observer.onCurrentMoveChange(this.currentMoveIndex);
      }
      if (observer.onMoveTreeChanged) {
        observer.onMoveTreeChanged();
      }
    });
  }

  public cleanup(): void {
    this.moves = [];
    this.currentMoveIndex = -1;
    this.observers = [];
  }
} 