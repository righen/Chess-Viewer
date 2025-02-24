import { BoardManager, type BoardState, type BoardManagerEvent, type BoardManagerObserver } from '../services/BoardManager';

describe('BoardManager', () => {
  let boardManager: BoardManager;
  let mockObserverFn: jest.Mock;

  beforeEach(() => {
    // Reset singleton instance before each test
    // @ts-ignore - accessing private property for testing
    BoardManager.instance = undefined;
    boardManager = BoardManager.getInstance();

    mockObserverFn = jest.fn();
  });

  afterEach(() => {
    boardManager.reset();
  });

  describe('Singleton Pattern', () => {
    it('should maintain a single instance', () => {
      const instance1 = BoardManager.getInstance();
      const instance2 = BoardManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Board Management', () => {
    it('should create a new board', () => {
      const board = boardManager.createBoard('1', 'Board 1');
      expect(board).toBeDefined();
      expect(board.id).toBe('1');
      expect(board.name).toBe('Board 1');
      expect(board.gameManager).toBeDefined();
      expect(board.engineService).toBeDefined();
      expect(board.openingBook).toBeDefined();
      expect(board.moveTree).toBeDefined();
      expect(board.navigationService).toBeDefined();
    });

    it('should not allow duplicate board ids', () => {
      boardManager.createBoard('1', 'Board 1');
      expect(() => boardManager.createBoard('1', 'Board 1')).toThrow();
    });

    it('should set first created board as active', () => {
      const board = boardManager.createBoard('1', 'Board 1');
      expect(boardManager.getActiveBoard()).toBe(board);
    });

    it('should get board by id', () => {
      const board = boardManager.createBoard('1', 'Board 1');
      expect(boardManager.getBoard('1')).toBe(board);
    });

    it('should return null for non-existent board', () => {
      expect(boardManager.getBoard('non-existent')).toBeNull();
    });
  });

  describe('Active Board Management', () => {
    it('should set active board', () => {
      const board1 = boardManager.createBoard('1', 'Board 1');
      const board2 = boardManager.createBoard('2', 'Board 2');

      boardManager.setActiveBoard('2');
      expect(boardManager.getActiveBoard()).toBe(board2);
    });

    it('should handle active board removal', () => {
      boardManager.createBoard('1', 'Board 1');
      const board2 = boardManager.createBoard('2', 'Board 2');

      boardManager.setActiveBoard('1');
      boardManager.removeBoard('1');

      expect(boardManager.getActiveBoard()).toBe(board2);
    });

    it('should set active board to null when removing last board', () => {
      boardManager.createBoard('1', 'Board 1');
      boardManager.removeBoard('1');
      expect(boardManager.getActiveBoard()).toBeNull();
    });
  });

  describe('Observer Pattern', () => {
    beforeEach(() => {
      boardManager.addObserver(mockObserverFn);
    });

    it('should notify observers when board is created', () => {
      const board = boardManager.createBoard('1', 'Board 1');
      expect(mockObserverFn).toHaveBeenCalledWith('boardCreated', board);
    });

    it('should notify observers when board is removed', () => {
      const board = boardManager.createBoard('1', 'Board 1');
      boardManager.removeBoard('1');
      expect(mockObserverFn).toHaveBeenCalledWith('boardRemoved', board);
    });

    it('should notify observers when active board changes', () => {
      const board = boardManager.createBoard('1', 'Board 1');
      boardManager.setActiveBoard('1');
      expect(mockObserverFn).toHaveBeenCalledWith('activeBoardChanged', board);
    });

    it('should stop notifying removed observers', () => {
      boardManager.removeObserver(mockObserverFn);
      boardManager.createBoard('1', 'Board 1');
      expect(mockObserverFn).not.toHaveBeenCalled();
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources when removing board', () => {
      const board = boardManager.createBoard('1', 'Board 1');
      const cleanupSpy = jest.spyOn(board.engineService, 'cleanup');
      
      boardManager.removeBoard('1');
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should cleanup all resources on reset', () => {
      const board1 = boardManager.createBoard('1', 'Board 1');
      const board2 = boardManager.createBoard('2', 'Board 2');
      const cleanup1 = jest.spyOn(board1.engineService, 'cleanup');
      const cleanup2 = jest.spyOn(board2.engineService, 'cleanup');

      boardManager.reset();
      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
    });
  });
}); 