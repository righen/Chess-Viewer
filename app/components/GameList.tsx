import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { type PgnGame } from '../services/PgnService';
import { type GameListService } from '../services/GameListService';

interface GameListProps {
  games: PgnGame[];
  currentGameIndex: number;
  onGameSelect: (game: PgnGame) => void;
  gameListService: GameListService;
}

interface SortConfig {
  key: keyof PgnGame['headers'];
  direction: 'asc' | 'desc';
}

interface Filters {
  white: string;
  black: string;
  event: string;
  result: string;
  dateFrom: string;
  dateTo: string;
}

const ITEMS_PER_PAGE = 50;

const GameList: React.FC<GameListProps> = ({ games: initialGames, currentGameIndex, onGameSelect, gameListService }) => {
  const [games, setGames] = useState<PgnGame[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'Date', direction: 'desc' });
  const [filters, setFilters] = useState<Filters>({
    white: '',
    black: '',
    event: '',
    result: '',
    dateFrom: '',
    dateTo: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // Update games when initialGames prop changes
  useEffect(() => {
    console.log('Initial games updated:', {
      count: initialGames.length,
      firstGame: initialGames[0]?.headers
    });
    setGames(initialGames);
  }, [initialGames]);

  // Add observer to listen for game updates
  useEffect(() => {
    const observer = {
      onGamesUpdate: (updatedGames: PgnGame[]) => {
        console.log('GameList received games update:', {
          count: updatedGames.length,
          firstGame: updatedGames[0]?.headers
        });
        setGames(updatedGames);
      },
      onFilterChange: () => {},
      onSortChange: () => {}
    };

    gameListService.addObserver(observer);
    return () => gameListService.removeObserver(observer);
  }, [gameListService]);

  // Filter games
  const filteredGames = useMemo(() => {
    return games.filter(game => {
      const matchesWhite = !filters.white || game.headers.White?.toLowerCase().includes(filters.white.toLowerCase());
      const matchesBlack = !filters.black || game.headers.Black?.toLowerCase().includes(filters.black.toLowerCase());
      const matchesEvent = !filters.event || game.headers.Event?.toLowerCase().includes(filters.event.toLowerCase());
      const matchesResult = !filters.result || game.headers.Result === filters.result;
      const matchesDateFrom = !filters.dateFrom || (game.headers.Date && game.headers.Date >= filters.dateFrom);
      const matchesDateTo = !filters.dateTo || (game.headers.Date && game.headers.Date <= filters.dateTo);

      return matchesWhite && matchesBlack && matchesEvent && matchesResult && matchesDateFrom && matchesDateTo;
    });
  }, [games, filters]);

  // Sort games
  const sortedGames = useMemo(() => {
    const sorted = [...filteredGames].sort((a, b) => {
      const aValue = a.headers[sortConfig.key] || '';
      const bValue = b.headers[sortConfig.key] || '';
      if (aValue === bValue) return 0;
      const comparison = aValue.localeCompare(bValue);
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [filteredGames, sortConfig]);

  // Get the absolute index in the original games array
  const isCurrentGame = useCallback((game: PgnGame) => {
    const currentGame = games[currentGameIndex];
    if (!currentGame) return false;
    
    return (
      game.headers.White === currentGame.headers.White &&
      game.headers.Black === currentGame.headers.Black &&
      game.headers.Date === currentGame.headers.Date &&
      game.headers.Event === currentGame.headers.Event &&
      game.headers.Round === currentGame.headers.Round
    );
  }, [games, currentGameIndex]);

  // Pagination
  const totalPages = Math.ceil(sortedGames.length / ITEMS_PER_PAGE);
  const paginatedGames = sortedGames.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSort = (key: keyof PgnGame['headers']) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  const renderSortIndicator = (key: keyof PgnGame['headers']) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="bg-gray-900 rounded-lg shadow-lg shadow-black/20 overflow-hidden">
      {/* Filters Toggle */}
      <div className="px-6 py-3 border-b border-gray-700 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-gray-300 hover:text-white flex items-center gap-2"
          >
            <span>🔍</span>
            <span>{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
          </button>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400">{filteredGames.length} games</span>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="px-6 py-4 bg-gray-800/50 border-b border-gray-700 grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">White Player</label>
            <input
              type="text"
              value={filters.white}
              onChange={(e) => handleFilterChange('white', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
              placeholder="Filter by white player..."
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Black Player</label>
            <input
              type="text"
              value={filters.black}
              onChange={(e) => handleFilterChange('black', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
              placeholder="Filter by black player..."
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Event</label>
            <input
              type="text"
              value={filters.event}
              onChange={(e) => handleFilterChange('event', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
              placeholder="Filter by event..."
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Result</label>
            <select
              value={filters.result}
              onChange={(e) => handleFilterChange('result', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
            >
              <option value="">All Results</option>
              <option value="1-0">White Wins (1-0)</option>
              <option value="0-1">Black Wins (0-1)</option>
              <option value="1/2-1/2">Draw (½-½)</option>
              <option value="*">Ongoing (*)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Date From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Date To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
            />
          </div>
        </div>
      )}

      {/* Games Table */}
      <table className="w-full text-sm text-left text-gray-300">
        <thead className="text-xs uppercase bg-gray-700">
          <tr>
            <th 
              className="px-6 py-3 cursor-pointer hover:bg-gray-600"
              onClick={() => handleSort('White')}
            >
              White {renderSortIndicator('White')}
            </th>
            <th 
              className="px-6 py-3 cursor-pointer hover:bg-gray-600"
              onClick={() => handleSort('Black')}
            >
              Black {renderSortIndicator('Black')}
            </th>
            <th 
              className="px-6 py-3 cursor-pointer hover:bg-gray-600"
              onClick={() => handleSort('Result')}
            >
              Result {renderSortIndicator('Result')}
            </th>
            <th 
              className="px-6 py-3 cursor-pointer hover:bg-gray-600"
              onClick={() => handleSort('Date')}
            >
              Date {renderSortIndicator('Date')}
            </th>
            <th 
              className="px-6 py-3 cursor-pointer hover:bg-gray-600"
              onClick={() => handleSort('Event')}
            >
              Event {renderSortIndicator('Event')}
            </th>
          </tr>
        </thead>
        <tbody>
          {paginatedGames.map((game, index) => (
            <tr
              key={`${game.headers.Date}-${game.headers.Round}-${game.headers.White}-${game.headers.Black}-${index}`}
              className={`border-b border-gray-700 hover:bg-gray-600 cursor-pointer ${
                isCurrentGame(game) ? 'bg-gray-600' : 'bg-gray-800'
              }`}
              onClick={() => {
                console.log('Clicked game:', {
                  pgn: game.pgn,
                  headers: game.headers,
                  moves: game.moves.length,
                  rawGame: game
                });
                onGameSelect(game);
              }}
            >
              <td className="px-6 py-4">{game.headers.White || 'Unknown'}</td>
              <td className="px-6 py-4">{game.headers.Black || 'Unknown'}</td>
              <td className="px-6 py-4">{game.headers.Result || '*'}</td>
              <td className="px-6 py-4">{game.headers.Date || 'Unknown'}</td>
              <td className="px-6 py-4">{game.headers.Event || 'Unknown'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 bg-gray-800/50 border-t border-gray-700 flex justify-between items-center">
          <div className="text-sm text-gray-400">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredGames.length)} of {filteredGames.length} games
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⟪
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ◀
            </button>
            <span className="px-3 py-1 text-gray-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ▶
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⟫
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameList; 