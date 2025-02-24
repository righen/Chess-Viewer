import { MoveTreeService, type MoveTreeObserver } from '../services/MoveTreeService';
import type { PgnMove } from '../services/PgnService';

describe('MoveTreeService', () => {
  let moveTreeService: MoveTreeService;
  let mockObserver: MoveTreeObserver;
  let mockMovesUpdateFn: jest.Mock;
  let mockCurrentMoveChangeFn: jest.Mock;
  let mockMoveTreeChangedFn: jest.Mock;

  beforeEach(() => {
    // Reset singleton instance before each test
    // @ts-ignore - accessing private property for testing
    MoveTreeService.instance = undefined;
    moveTreeService = MoveTreeService.getInstance();

    // Create mock observer functions
    mockMovesUpdateFn = jest.fn();
    mockCurrentMoveChangeFn = jest.fn();
    mockMoveTreeChangedFn = jest.fn();
    mockObserver = {
      onMovesUpdate: mockMovesUpdateFn,
      onCurrentMoveChange: mockCurrentMoveChangeFn,
      onMoveTreeChanged: mockMoveTreeChangedFn
    };
  });

  afterEach(() => {
    moveTreeService.reset();
  });

  describe('Observer Pattern', () => {
    it('should notify observers when moves are updated', () => {
      moveTreeService.addObserver(mockObserver);

      const moves: PgnMove[] = [
        { san: 'e4', fen: 'test-fen-1', variations: [] },
        { san: 'e5', fen: 'test-fen-2', variations: [] }
      ];

      moveTreeService.setMoves(moves);

      expect(mockMovesUpdateFn).toHaveBeenCalledWith(moves);
      expect(mockMoveTreeChangedFn).toHaveBeenCalled();
    });

    it('should notify observers when current move changes', () => {
      moveTreeService.addObserver(mockObserver);

      const moves: PgnMove[] = [
        { san: 'e4', fen: 'test-fen-1', variations: [] },
        { san: 'e5', fen: 'test-fen-2', variations: [] }
      ];

      moveTreeService.setMoves(moves);
      moveTreeService.goToMove(1);

      expect(mockCurrentMoveChangeFn).toHaveBeenCalledWith(1);
      expect(mockMoveTreeChangedFn).toHaveBeenCalled();
    });

    it('should notify new observers of current state immediately', () => {
      const moves: PgnMove[] = [
        { san: 'e4', fen: 'test-fen-1', variations: [] },
        { san: 'e5', fen: 'test-fen-2', variations: [] }
      ];

      moveTreeService.setMoves(moves);
      moveTreeService.goToMove(1);

      moveTreeService.addObserver(mockObserver);

      expect(mockMovesUpdateFn).toHaveBeenCalledWith(moves);
      expect(mockCurrentMoveChangeFn).toHaveBeenCalledWith(1);
      expect(mockMoveTreeChangedFn).toHaveBeenCalled();
    });

    it('should stop notifying removed observers', () => {
      moveTreeService.addObserver(mockObserver);

      const moves: PgnMove[] = [
        { san: 'e4', fen: 'test-fen-1', variations: [] }
      ];

      moveTreeService.setMoves(moves);
      
      // Clear the mock calls from setMoves
      mockMovesUpdateFn.mockClear();
      mockCurrentMoveChangeFn.mockClear();
      mockMoveTreeChangedFn.mockClear();
      
      // Now remove the observer
      moveTreeService.removeObserver(mockObserver);
      
      // These actions should not trigger notifications
      moveTreeService.goToMove(0);

      expect(mockMovesUpdateFn).not.toHaveBeenCalled();
      expect(mockCurrentMoveChangeFn).not.toHaveBeenCalled();
      expect(mockMoveTreeChangedFn).not.toHaveBeenCalled();
    });
  });

  describe('Move Management', () => {
    it('should set and get moves correctly', () => {
      const moves: PgnMove[] = [
        { san: 'e4', fen: 'test-fen-1', variations: [] },
        { san: 'e5', fen: 'test-fen-2', variations: [] }
      ];

      moveTreeService.setMoves(moves);

      expect(moveTreeService.getMoves()).toEqual(moves);
    });

    it('should handle empty moves array', () => {
      moveTreeService.setMoves([]);
      expect(moveTreeService.getMoves()).toEqual([]);
      expect(moveTreeService.getCurrentMoveIndex()).toBe(-1);
    });

    it('should filter out invalid moves', () => {
      const moves = [
        { san: 'e4', fen: 'test-fen-1', variations: [] },
        null,
        undefined,
        { invalid: 'move' }
      ];

      // @ts-ignore - testing invalid input
      moveTreeService.setMoves(moves);

      expect(moveTreeService.getMoves()).toEqual([
        { san: 'e4', fen: 'test-fen-1', variations: [] }
      ]);
    });

    it('should handle variations', () => {
      const variation: PgnMove[] = [
        { san: 'Nf6', fen: 'variation-fen-1', variations: [] },
        { san: 'Nc3', fen: 'variation-fen-2', variations: [] }
      ];

      const moves: PgnMove[] = [
        { san: 'e4', fen: 'test-fen-1', variations: [] },
        { san: 'e5', fen: 'test-fen-2', variations: [variation] }
      ];

      moveTreeService.setMoves(moves);
      expect(moveTreeService.getMoves()[1].variations[0]).toEqual(variation);
    });
  });

  describe('Move Navigation', () => {
    let testMoves: PgnMove[];

    beforeEach(() => {
      testMoves = [
        { san: 'e4', fen: 'fen-1', variations: [] },
        { san: 'e5', fen: 'fen-2', variations: [] },
        { san: 'Nf3', fen: 'fen-3', variations: [] }
      ];
      moveTreeService.setMoves(testMoves);
    });

    it('should start at move index -1', () => {
      expect(moveTreeService.getCurrentMoveIndex()).toBe(-1);
    });

    it('should navigate to valid moves', () => {
      expect(moveTreeService.goToMove(1)).toBe(true);
      expect(moveTreeService.getCurrentMoveIndex()).toBe(1);
    });

    it('should reject invalid move indices', () => {
      expect(moveTreeService.goToMove(-2)).toBe(false);
      expect(moveTreeService.goToMove(999)).toBe(false);
      expect(moveTreeService.getCurrentMoveIndex()).toBe(-1);
    });

    it('should allow navigation to starting position', () => {
      moveTreeService.goToMove(2);
      expect(moveTreeService.goToMove(-1)).toBe(true);
      expect(moveTreeService.getCurrentMoveIndex()).toBe(-1);
    });
  });

  describe('Reset Functionality', () => {
    it('should clear all state on reset', () => {
      const moves: PgnMove[] = [
        { san: 'e4', fen: 'test-fen-1', variations: [] },
        { san: 'e5', fen: 'test-fen-2', variations: [] }
      ];

      moveTreeService.setMoves(moves);
      moveTreeService.goToMove(1);
      moveTreeService.addObserver(mockObserver);

      moveTreeService.reset();

      expect(moveTreeService.getMoves()).toEqual([]);
      expect(moveTreeService.getCurrentMoveIndex()).toBe(-1);
      expect(mockMovesUpdateFn).toHaveBeenLastCalledWith([]);
      expect(mockCurrentMoveChangeFn).toHaveBeenLastCalledWith(-1);
    });
  });

  describe('Singleton Pattern', () => {
    it('should maintain a single instance', () => {
      const instance1 = MoveTreeService.getInstance();
      const instance2 = MoveTreeService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
}); 