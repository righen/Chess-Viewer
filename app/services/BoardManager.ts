import { GameManager } from './GameManager';
import { EngineAnalysisService } from './EngineAnalysisService';
import { OpeningBookService } from './OpeningBookService';
import { MoveTreeService } from './MoveTreeService';
import { NavigationService } from './NavigationService';
import { GameListService } from './GameListService';

export interface BoardState {
  id: string;
  name: string;
  gameManager: GameManager;
  engineService: EngineAnalysisService;
  openingBook: OpeningBookService;
  moveTree: MoveTreeService;
  navigationService: NavigationService;
  gameListService: GameListService;
}

export type BoardManagerEvent = 'boardCreated' | 'boardRemoved' | 'activeBoardChanged';
export type BoardManagerObserver = (event: BoardManagerEvent, board: BoardState | null) => void;

export class BoardManager {
  private static instance: BoardManager | null = null;
  private boards: Map<string, BoardState> = new Map();
  private activeBoard: BoardState | null = null;
  private observers: BoardManagerObserver[] = [];

  private constructor() {}

  public static getInstance(): BoardManager {
    if (!BoardManager.instance) {
      BoardManager.instance = new BoardManager();
    }
    return BoardManager.instance;
  }

  public createBoard(id: string, name: string): BoardState {
    if (this.boards.has(id)) {
      throw new Error(`Board with id ${id} already exists`);
    }

    // Create new instances for each board
    const boardState: BoardState = {
      id,
      name,
      gameManager: new GameManager(),
      engineService: new EngineAnalysisService(),
      openingBook: OpeningBookService.getInstance(),
      moveTree: new MoveTreeService(),
      navigationService: new NavigationService(),
      gameListService: GameListService.getInstance()
    };

    this.boards.set(id, boardState);
    
    if (!this.activeBoard) {
      this.setActiveBoard(id);
    }

    this.notifyObservers('boardCreated', boardState);
    return boardState;
  }

  public getBoard(id: string): BoardState | null {
    return this.boards.get(id) || null;
  }

  public removeBoard(id: string): void {
    const board = this.boards.get(id);
    if (board) {
      // Cleanup resources
      board.engineService.cleanup();
      
      this.boards.delete(id);
      this.notifyObservers('boardRemoved', board);

      if (this.activeBoard?.id === id) {
        const nextBoard = this.boards.values().next().value;
        this.setActiveBoard(nextBoard?.id || null);
      }
    }
  }

  public setActiveBoard(id: string | null): void {
    if (id === null) {
      this.activeBoard = null;
      this.notifyObservers('activeBoardChanged', null);
      return;
    }

    const board = this.boards.get(id);
    if (board) {
      this.activeBoard = board;
      this.notifyObservers('activeBoardChanged', board);
    }
  }

  public getActiveBoard(): BoardState | null {
    return this.activeBoard;
  }

  public addObserver(observer: BoardManagerObserver): void {
    this.observers.push(observer);
  }

  public removeObserver(observer: BoardManagerObserver): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  private notifyObservers(event: BoardManagerEvent, board: BoardState | null): void {
    this.observers.forEach(observer => observer(event, board));
  }

  public reset(): void {
    // Cleanup all boards
    this.boards.forEach(board => {
      board.engineService.cleanup();
    });
    
    this.boards.clear();
    this.activeBoard = null;
    this.observers = [];
  }
} 