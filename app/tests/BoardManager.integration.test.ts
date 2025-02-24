import { BoardManager } from '../services/BoardManager';
import { type PgnGame } from '../services/PgnService';
import { OpeningBookService } from '../services/OpeningBookService';
import { GameListService } from '../services/GameListService';

// Mock ChessEngineService
jest.mock('../services/ChessEngineService', () => {
  return {
    ChessEngineService: jest.fn().mockImplementation(() => {
      let isAnalyzing = false;
      return {
        initialize: jest.fn(),
        startAnalysis: jest.fn(() => { isAnalyzing = true; }),
        stopAnalysis: jest.fn(() => { isAnalyzing = false; }),
        updateSettings: jest.fn(),
        cleanup: jest.fn(() => { isAnalyzing = false; }),
        isEngineAnalyzing: jest.fn(() => isAnalyzing)
      };
    })
  };
});

describe('BoardManager Integration Tests', () => {
  let boardManager: BoardManager;

  beforeEach(() => {
    // Reset all singleton instances before each test
    // @ts-ignore - accessing private property for testing
    BoardManager.instance = undefined;
    // @ts-ignore - accessing private property for testing
    OpeningBookService.instance = undefined;
    // @ts-ignore - accessing private property for testing
    GameListService.instance = undefined;

    boardManager = BoardManager.getInstance();
  });

  afterEach(() => {
    boardManager.reset();
  });

  describe('Board Instance Independence', () => {
    it('should maintain independent move history for each board', () => {
      const board1 = boardManager.createBoard('1', 'Board 1');
      const board2 = boardManager.createBoard('2', 'Board 2');

      // Make moves on board 1
      board1.gameManager.makeMove('e2', 'e4');
      board1.gameManager.makeMove('e7', 'e5');

      // Make different moves on board 2
      board2.gameManager.makeMove('d2', 'd4');
      board2.gameManager.makeMove('d7', 'd5');

      // Verify board 1 moves
      const board1Moves = board1.gameManager.getMoveHistory();
      expect(board1Moves.length).toBe(2);
      expect(board1Moves[0].san).toBe('e4');
      expect(board1Moves[1].san).toBe('e5');

      // Verify board 2 moves
      const board2Moves = board2.gameManager.getMoveHistory();
      expect(board2Moves.length).toBe(2);
      expect(board2Moves[0].san).toBe('d4');
      expect(board2Moves[1].san).toBe('d5');
    });

    it('should maintain independent opening book state for each board', async () => {
      const board1 = boardManager.createBoard('1', 'Board 1');
      const board2 = boardManager.createBoard('2', 'Board 2');

      // Create separate instances for each board
      // @ts-ignore - accessing private property for testing
      OpeningBookService.instance = undefined;
      const openingBook1 = OpeningBookService.getInstance();
      // @ts-ignore - accessing private property for testing
      OpeningBookService.instance = undefined;
      const openingBook2 = OpeningBookService.getInstance();
      
      // @ts-ignore - replacing private property for testing
      board1.openingBook = openingBook1;
      // @ts-ignore - replacing private property for testing
      board2.openingBook = openingBook2;

      // Set different databases for each board
      board1.openingBook.setDatabase('masters');
      board2.openingBook.setDatabase('lichess');

      expect(board1.openingBook.getCurrentDatabase()).toBe('masters');
      expect(board2.openingBook.getCurrentDatabase()).toBe('lichess');

      // Make moves and check opening positions
      board1.gameManager.makeMove('e2', 'e4');
      board2.gameManager.makeMove('d2', 'd4');

      const board1Position = await board1.openingBook.getMovesForPosition(board1.gameManager.getCurrentPosition().fen());
      const board2Position = await board2.openingBook.getMovesForPosition(board2.gameManager.getCurrentPosition().fen());

      expect(board1Position.fen).not.toBe(board2Position.fen);
    });

    it('should maintain independent game lists for each board', () => {
      const board1 = boardManager.createBoard('1', 'Board 1');
      const board2 = boardManager.createBoard('2', 'Board 2');

      // Create separate instances for each board
      // @ts-ignore - accessing private property for testing
      GameListService.instance = undefined;
      const gameList1 = GameListService.getInstance();
      // @ts-ignore - accessing private property for testing
      GameListService.instance = undefined;
      const gameList2 = GameListService.getInstance();
      
      // @ts-ignore - replacing private property for testing
      board1.gameListService = gameList1;
      // @ts-ignore - replacing private property for testing
      board2.gameListService = gameList2;

      const game1: PgnGame = {
        pgn: '1. e4 e5',
        moves: [
          { san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', variations: [] },
          { san: 'e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', variations: [] }
        ],
        headers: {
          Event: 'Game 1',
          White: 'Player 1',
          Black: 'Player 2',
          Result: '1-0'
        }
      };

      const game2: PgnGame = {
        pgn: '1. d4 d5',
        moves: [
          { san: 'd4', fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1', variations: [] },
          { san: 'd5', fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2', variations: [] }
        ],
        headers: {
          Event: 'Game 2',
          White: 'Player 3',
          Black: 'Player 4',
          Result: '0-1'
        }
      };

      // Load different games into each board
      board1.gameListService.setGames([game1]);
      board2.gameListService.setGames([game2]);

      // Verify game lists are independent
      const board1Games = board1.gameListService.getGames();
      const board2Games = board2.gameListService.getGames();

      expect(board1Games.length).toBe(1);
      expect(board2Games.length).toBe(1);
      expect(board1Games[0].headers.Event).toBe('Game 1');
      expect(board2Games[0].headers.Event).toBe('Game 2');

      // Test filtering on board 1
      board1.gameListService.setFilter({ white: 'Player 1' });
      expect(board1.gameListService.getGames().length).toBe(1);
      expect(board2.gameListService.getGames().length).toBe(1); // Board 2 unaffected
    });

    it('should maintain independent move tree state for each board', () => {
      const board1 = boardManager.createBoard('1', 'Board 1');
      const board2 = boardManager.createBoard('2', 'Board 2');

      const moves1 = [
        { san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', variations: [] },
        { san: 'e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', variations: [] }
      ];

      const moves2 = [
        { san: 'd4', fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1', variations: [] },
        { san: 'd5', fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2', variations: [] }
      ];

      board1.moveTree.setMoves(moves1);
      board2.moveTree.setMoves(moves2);

      // Navigate to different positions
      board1.moveTree.goToMove(1);
      board2.moveTree.goToMove(0);

      expect(board1.moveTree.getCurrentMoveIndex()).toBe(1);
      expect(board2.moveTree.getCurrentMoveIndex()).toBe(0);
      expect(board1.moveTree.getMoves()).toEqual(moves1);
      expect(board2.moveTree.getMoves()).toEqual(moves2);
    });

    it('should maintain independent engine analysis state for each board', () => {
      const board1 = boardManager.createBoard('1', 'Board 1');
      const board2 = boardManager.createBoard('2', 'Board 2');

      // Configure different engine settings for each board
      board1.engineService.initialize({
        threads: 1,
        hash: 16,
        multiPv: 1,
        depth: 20
      });

      board2.engineService.initialize({
        threads: 2,
        hash: 32,
        multiPv: 2,
        depth: 30
      });

      // Make different moves on each board
      board1.gameManager.makeMove('e2', 'e4');
      board2.gameManager.makeMove('d2', 'd4');

      // Initially both engines should be stopped
      expect(board1.engineService.isEngineAnalyzing()).toBe(false);
      expect(board2.engineService.isEngineAnalyzing()).toBe(false);

      // Start analysis on board 1 only
      board1.engineService.startAnalysis(board1.gameManager.getCurrentPosition());

      // Board 1 should be analyzing, board 2 should not
      expect(board1.engineService.isEngineAnalyzing()).toBe(true);
      expect(board2.engineService.isEngineAnalyzing()).toBe(false);

      // Stop analysis on board 1
      board1.engineService.stopAnalysis();

      // Both engines should be stopped again
      expect(board1.engineService.isEngineAnalyzing()).toBe(false);
      expect(board2.engineService.isEngineAnalyzing()).toBe(false);
    });
  });

  describe('Board State Management', () => {
    it('should cleanup resources when removing a board', () => {
      const board = boardManager.createBoard('1', 'Board 1');
      const engineCleanupSpy = jest.spyOn(board.engineService, 'cleanup');

      boardManager.removeBoard('1');

      expect(engineCleanupSpy).toHaveBeenCalled();
      expect(boardManager.getBoard('1')).toBeNull();
    });

    it('should handle active board changes correctly', () => {
      const board1 = boardManager.createBoard('1', 'Board 1');
      const board2 = boardManager.createBoard('2', 'Board 2');
      const mockObserver = jest.fn();

      boardManager.addObserver(mockObserver);
      boardManager.setActiveBoard('2');

      expect(boardManager.getActiveBoard()).toBe(board2);
      expect(mockObserver).toHaveBeenCalledWith('activeBoardChanged', board2);

      boardManager.removeBoard('2');
      expect(boardManager.getActiveBoard()).toBe(board1);
      expect(mockObserver).toHaveBeenCalledWith('activeBoardChanged', board1);
    });
  });
}); 