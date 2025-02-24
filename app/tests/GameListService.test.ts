import { GameListService, type GameFilter, type GameSortConfig, type GameListObserver } from '../services/GameListService';
import { type PgnGame } from '../services/PgnService';

describe('GameListService', () => {
  let gameListService: GameListService;
  let mockObserver: GameListObserver;
  let mockGamesUpdateFn: jest.Mock;
  let mockFilterChangeFn: jest.Mock;
  let mockSortChangeFn: jest.Mock;
  let sampleGames: PgnGame[];

  beforeEach(() => {
    // Reset singleton instance before each test
    // @ts-ignore - accessing private property for testing
    GameListService.instance = undefined;
    gameListService = GameListService.getInstance();

    // Create mock observer functions
    mockGamesUpdateFn = jest.fn();
    mockFilterChangeFn = jest.fn();
    mockSortChangeFn = jest.fn();
    mockObserver = {
      onGamesUpdate: mockGamesUpdateFn,
      onFilterChange: mockFilterChangeFn,
      onSortChange: mockSortChangeFn
    };

    // Setup sample games
    sampleGames = [
      {
        pgn: '1. e4 e5',
        headers: {
          Event: 'World Championship',
          Site: 'London',
          Date: '2024.01.01',
          Round: '1',
          White: 'Magnus Carlsen',
          Black: 'Alireza Firouzja',
          Result: '1-0',
          WhiteElo: '2850',
          BlackElo: '2800'
        },
        moves: []
      },
      {
        pgn: '1. d4 Nf6',
        headers: {
          Event: 'Tata Steel',
          Site: 'Wijk aan Zee',
          Date: '2024.01.15',
          Round: '3',
          White: 'Ding Liren',
          Black: 'Fabiano Caruana',
          Result: '1/2-1/2',
          WhiteElo: '2800',
          BlackElo: '2780'
        },
        moves: []
      },
      {
        pgn: '1. c4 e5',
        headers: {
          Event: 'World Championship',
          Site: 'London',
          Date: '2024.01.02',
          Round: '2',
          White: 'Alireza Firouzja',
          Black: 'Magnus Carlsen',
          Result: '0-1',
          WhiteElo: '2800',
          BlackElo: '2850'
        },
        moves: []
      }
    ];
  });

  describe('Observer Pattern', () => {
    it('should notify observers when games are updated', () => {
      gameListService.addObserver(mockObserver);
      gameListService.setGames(sampleGames);
      
      // Check that the callback was called once
      expect(mockGamesUpdateFn).toHaveBeenCalledTimes(1);
      
      // Get the actual games passed to the callback
      const receivedGames = mockGamesUpdateFn.mock.calls[0][0];
      
      // Verify the games array contains all the same games, regardless of order
      expect(receivedGames.length).toBe(sampleGames.length);
      sampleGames.forEach(expectedGame => {
        expect(receivedGames).toContainEqual(expectedGame);
      });
    });

    it('should notify observers when filter changes', () => {
      gameListService.addObserver(mockObserver);
      const filter: GameFilter = { white: 'Carlsen' };
      gameListService.setFilter(filter);
      
      expect(mockFilterChangeFn).toHaveBeenCalledWith(filter);
      expect(mockGamesUpdateFn).toHaveBeenCalled();
    });

    it('should notify observers when sort changes', () => {
      gameListService.addObserver(mockObserver);
      const sort: GameSortConfig = { field: 'Date', direction: 'asc' };
      gameListService.setSort(sort);
      
      expect(mockSortChangeFn).toHaveBeenCalledWith(sort);
      expect(mockGamesUpdateFn).toHaveBeenCalled();
    });

    it('should stop notifying removed observers', () => {
      gameListService.addObserver(mockObserver);
      gameListService.removeObserver(mockObserver);
      
      mockGamesUpdateFn.mockClear();
      gameListService.setGames(sampleGames);
      
      expect(mockGamesUpdateFn).not.toHaveBeenCalled();
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      gameListService.setGames(sampleGames);
    });

    it('should filter by white player', () => {
      gameListService.setFilter({ white: 'Carlsen' });
      const filtered = gameListService.getGames();
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].headers.White).toBe('Magnus Carlsen');
    });

    it('should filter by black player', () => {
      gameListService.setFilter({ black: 'Carlsen' });
      const filtered = gameListService.getGames();
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].headers.Black).toBe('Magnus Carlsen');
    });

    it('should filter by event', () => {
      gameListService.setFilter({ event: 'World Championship' });
      const filtered = gameListService.getGames();
      
      expect(filtered.length).toBe(2);
      expect(filtered[0].headers.Event).toBe('World Championship');
      expect(filtered[1].headers.Event).toBe('World Championship');
    });

    it('should filter by result', () => {
      gameListService.setFilter({ result: '1/2-1/2' });
      const filtered = gameListService.getGames();
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].headers.Result).toBe('1/2-1/2');
    });

    it('should filter by date range', () => {
      gameListService.setFilter({
        dateFrom: '2024.01.01',
        dateTo: '2024.01.01'
      });
      const filtered = gameListService.getGames();
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].headers.Date).toBe('2024.01.01');
    });

    it('should filter by Elo range', () => {
      gameListService.setFilter({
        minElo: 2820,
        maxElo: 2830,
        white: 'Carlsen'
      });
      const filtered = gameListService.getGames();
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].headers.White).toBe('Magnus Carlsen');
      expect(filtered[0].headers.Black).toBe('Alireza Firouzja');
    });

    it('should handle multiple filter criteria', () => {
      gameListService.setFilter({
        event: 'World Championship',
        white: 'Carlsen'
      });
      const filtered = gameListService.getGames();
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].headers.Event).toBe('World Championship');
      expect(filtered[0].headers.White).toBe('Magnus Carlsen');
    });
  });

  describe('Sorting', () => {
    beforeEach(() => {
      gameListService.setGames(sampleGames);
    });

    it('should sort by date ascending', () => {
      gameListService.setSort({ field: 'Date', direction: 'asc' });
      const sorted = gameListService.getGames();
      
      expect(sorted[0].headers.Date).toBe('2024.01.01');
      expect(sorted[1].headers.Date).toBe('2024.01.02');
      expect(sorted[2].headers.Date).toBe('2024.01.15');
    });

    it('should sort by date descending', () => {
      gameListService.setSort({ field: 'Date', direction: 'desc' });
      const sorted = gameListService.getGames();
      
      expect(sorted[0].headers.Date).toBe('2024.01.15');
      expect(sorted[1].headers.Date).toBe('2024.01.02');
      expect(sorted[2].headers.Date).toBe('2024.01.01');
    });

    it('should sort by white player name', () => {
      gameListService.setSort({ field: 'White', direction: 'asc' });
      const sorted = gameListService.getGames();
      
      expect(sorted[0].headers.White).toBe('Alireza Firouzja');
      expect(sorted[1].headers.White).toBe('Ding Liren');
      expect(sorted[2].headers.White).toBe('Magnus Carlsen');
    });

    it('should sort by event name', () => {
      gameListService.setSort({ field: 'Event', direction: 'asc' });
      const sorted = gameListService.getGames();
      
      expect(sorted[0].headers.Event).toBe('Tata Steel');
      expect(sorted[1].headers.Event).toBe('World Championship');
      expect(sorted[2].headers.Event).toBe('World Championship');
    });
  });

  describe('Singleton Pattern', () => {
    it('should maintain a single instance', () => {
      const instance1 = GameListService.getInstance();
      const instance2 = GameListService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
}); 