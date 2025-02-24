import { GameManager, type PositionObserver } from '../services/GameManager';
import { Chess } from 'chess.js';
import { type PgnGame, type PgnMove } from '../services/PgnService';

describe('GameManager', () => {
  let gameManager: GameManager;
  let mockObserver: PositionObserver;
  let mockPositionChangeFn: jest.Mock;

  beforeEach(() => {
    // Reset singleton instance before each test
    // @ts-ignore - accessing private property for testing
    GameManager.instance = undefined;
    gameManager = GameManager.getInstance();
    
    // Create mock observer
    mockPositionChangeFn = jest.fn();
    mockObserver = {
      onPositionChange: mockPositionChangeFn
    };
  });

  afterEach(() => {
    gameManager.reset();
  });

  describe('Observer Pattern', () => {
    it('should notify observers when position changes', () => {
      gameManager.addObserver(mockObserver);
      gameManager.makeMove('e2', 'e4');
      
      expect(mockPositionChangeFn).toHaveBeenCalled();
      const [position, moveIndex] = mockPositionChangeFn.mock.calls[0];
      expect(position).toBeInstanceOf(Chess);
      expect(moveIndex).toBe(0);
    });

    it('should stop notifying removed observers', () => {
      gameManager.addObserver(mockObserver);
      gameManager.removeObserver(mockObserver);
      
      mockPositionChangeFn.mockClear();
      gameManager.makeMove('e2', 'e4');
      
      expect(mockPositionChangeFn).not.toHaveBeenCalled();
    });
  });

  describe('Move Management', () => {
    it('should make valid moves', () => {
      expect(gameManager.makeMove('e2', 'e4')).toBe(true);
      expect(gameManager.makeMove('e7', 'e5')).toBe(true);
      
      const position = gameManager.getCurrentPosition();
      expect(position.fen()).toContain('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR');
    });

    it('should reject invalid moves', () => {
      expect(gameManager.makeMove('e2', 'e5')).toBe(false);
      expect(gameManager.getCurrentMoveIndex()).toBe(-1);
    });

    it('should handle pawn promotion', () => {
      // Setup a position where white can promote a pawn
      const fen = '8/1P6/8/8/8/8/7k/K7 w - - 0 1';
      expect(gameManager.loadFEN(fen)).toBe(true);
      
      // Make the promotion move
      expect(gameManager.makeMove('b7', 'b8', 'q')).toBe(true);
      
      const position = gameManager.getCurrentPosition();
      const piece = position.get('b8');
      expect(piece).toBeDefined();
      expect(piece?.type).toBe('q');
      expect(piece?.color).toBe('w');
    });
  });

  describe('Game Navigation', () => {
    beforeEach(() => {
      // Setup a few moves
      gameManager.makeMove('e2', 'e4');
      gameManager.makeMove('e7', 'e5');
      gameManager.makeMove('g1', 'f3');
    });

    it('should navigate through moves', () => {
      expect(gameManager.getCurrentMoveIndex()).toBe(2);
      
      // Go back to start
      expect(gameManager.goToMove(-1)).toBe(true);
      expect(gameManager.getCurrentMoveIndex()).toBe(-1);
      expect(gameManager.getCurrentPosition().fen()).toContain('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
      
      // Go to middle move
      expect(gameManager.goToMove(1)).toBe(true);
      expect(gameManager.getCurrentMoveIndex()).toBe(1);
      expect(gameManager.getCurrentPosition().fen()).toContain('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR');
    });

    it('should reject invalid move indices', () => {
      expect(gameManager.goToMove(-2)).toBe(false);
      expect(gameManager.goToMove(999)).toBe(false);
    });
  });

  describe('PGN Loading', () => {
    const testPgn = `[Event "Test Game"]
[Site "Chess Club"]
[Date "2024.02.24"]
[Round "1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

    it('should load PGN text successfully', () => {
      const result = gameManager.loadPGN(testPgn);
      
      expect(result.success).toBe(true);
      expect(result.games.length).toBe(1);
      expect(result.games[0].headers.Event).toBe('Test Game');
      expect(result.games[0].moves.length).toBe(6);
    });

    it('should load game with headers and moves', () => {
      const game: PgnGame = {
        pgn: testPgn,
        headers: {
          Event: 'Test Game',
          Site: 'Chess Club',
          Date: '2024.02.24',
          Round: '1',
          White: 'Player 1',
          Black: 'Player 2',
          Result: '1-0'
        },
        moves: [
          { san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', variations: [] },
          { san: 'e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', variations: [] }
        ]
      };

      expect(gameManager.loadGame(game)).toBe(true);
      expect(gameManager.getCurrentPosition().header()).toEqual(game.headers);
      expect(gameManager.getMoveHistory().length).toBe(2);
    });

    it('should handle invalid PGN text', () => {
      const result = gameManager.loadPGN('Invalid PGN');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('FEN Loading', () => {
    it('should load valid FEN position', () => {
      const fen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
      expect(gameManager.loadFEN(fen)).toBe(true);
      expect(gameManager.getCurrentPosition().fen()).toBe(fen);
    });

    it('should reject invalid FEN', () => {
      expect(gameManager.loadFEN('invalid fen')).toBe(false);
    });
  });

  describe('Singleton Pattern', () => {
    it('should maintain a single instance', () => {
      const instance1 = GameManager.getInstance();
      const instance2 = GameManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
}); 