import { OpeningBookService, type DatabaseType, type OpeningPosition } from '../services/OpeningBookService';
import { Chess } from 'chess.js';

describe('OpeningBookService', () => {
  let openingBookService: OpeningBookService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Reset singleton instance before each test
    // @ts-ignore - accessing private property for testing
    OpeningBookService.instance = undefined;
    openingBookService = OpeningBookService.getInstance();
    
    // Store original fetch
    originalFetch = global.fetch;

    // Mock fetch with a default successful response matching API format
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        moves: [
          { san: 'e4', white: 100, draws: 50, black: 50, uci: 'e2e4' },
          { san: 'd4', white: 80, draws: 40, black: 40, uci: 'd2d4' }
        ],
        updated: '2024-03-20T12:00:00Z'
      })
    });
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    openingBookService.clearCache();
  });

  describe('Database Management', () => {
    it('should start with masters database by default', () => {
      expect(openingBookService.getCurrentDatabase()).toBe('masters');
    });

    it('should switch databases and clear cache', () => {
      // Mock cache internal state
      // @ts-ignore - accessing private property for testing
      openingBookService.cache.set('test', { position: {}, timestamp: Date.now() });
      
      openingBookService.setDatabase('lichess');
      
      expect(openingBookService.getCurrentDatabase()).toBe('lichess');
      // @ts-ignore - accessing private property for testing
      expect(openingBookService.cache.size).toBe(0);
    });
  });

  describe('Cache Management', () => {
    it('should cache positions and respect timeout', async () => {
      const chess = new Chess();
      const startingFen = chess.fen();

      // First call should fetch from API
      await openingBookService.getMovesForPosition(startingFen);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await openingBookService.getMovesForPosition(startingFen);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Simulate cache timeout
      // @ts-ignore - accessing private property for testing
      const cacheEntry = openingBookService.cache.get(`masters:${startingFen}`);
      if (cacheEntry) {
        cacheEntry.timestamp = Date.now() - 6 * 60 * 1000; // 6 minutes old
      }

      // Third call should fetch again due to timeout
      await openingBookService.getMovesForPosition(startingFen);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should clear cache', async () => {
      const chess = new Chess();
      const startingFen = chess.fen();

      // Populate cache
      await openingBookService.getMovesForPosition(startingFen);
      
      // Clear cache
      openingBookService.clearCache();
      
      // Should fetch again
      await openingBookService.getMovesForPosition(startingFen);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Position Fetching', () => {
    it('should fetch and transform position data correctly', async () => {
      const chess = new Chess();
      const startingFen = chess.fen();

      const result = await openingBookService.getMovesForPosition(startingFen);

      expect(result.fen).toBe(startingFen);
      expect(result.moves).toHaveLength(2);
      expect(result.totalGames).toBe(360); // Sum of all games (200 + 160)
      expect(result.lastUpdated).toBe('2024-03-20T12:00:00Z');

      // Verify move transformation
      const e4Move = result.moves.find(m => m.san === 'e4');
      expect(e4Move).toBeDefined();
      expect(e4Move?.games).toBe(200); // 100 + 50 + 50
      expect(e4Move?.whiteWins).toBe(100);
      expect(e4Move?.draws).toBe(50);
      expect(e4Move?.blackWins).toBe(50);

      // Verify FEN calculation
      const expectedFen = chess.fen();
      chess.move('e4');
      expect(e4Move?.fen.split(' ')[0]).toBe(chess.fen().split(' ')[0]);
    });

    it('should handle API errors gracefully', async () => {
      // Mock fetch to simulate error
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await openingBookService.getMovesForPosition('invalid fen');

      expect(result.moves).toHaveLength(0);
      expect(result.totalGames).toBe(0);
      expect(result.fen).toBe('invalid fen');
      expect(result.lastUpdated).toBeDefined();
    });

    it('should handle invalid FEN positions', async () => {
      const invalidFen = 'invalid fen string';
      
      // Mock fetch to return valid data even for invalid FEN
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          moves: [],
          updated: '2024-03-20T12:00:00Z'
        })
      });

      const result = await openingBookService.getMovesForPosition(invalidFen);

      expect(result.fen).toBe(invalidFen);
      expect(result.moves).toHaveLength(0);
      expect(result.totalGames).toBe(0);
      expect(result.lastUpdated).toBeDefined();
    });
  });

  describe('Cache Timeout Configuration', () => {
    it('should allow custom cache timeout', async () => {
      const chess = new Chess();
      const startingFen = chess.fen();

      // Set custom timeout (1 second)
      openingBookService.setCacheTimeout(1000);

      // First call
      await openingBookService.getMovesForPosition(startingFen);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should fetch again after timeout
      await openingBookService.getMovesForPosition(startingFen);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
}); 