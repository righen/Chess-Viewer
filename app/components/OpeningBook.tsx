import React from 'react';
import { type OpeningMove } from '../services/OpeningBookService';

interface OpeningBookProps {
  moves: OpeningMove[];
  onMoveSelect: (move: OpeningMove) => void;
  totalGames: number;
  lastUpdated?: string;
}

const OpeningBook: React.FC<OpeningBookProps> = ({ moves, onMoveSelect, totalGames, lastUpdated }) => {
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculatePercentage = (num: number, total: number): number => {
    return total > 0 ? (num / total) * 100 : 0;
  };

  const calculatePopularity = (moveGames: number): number => {
    return totalGames > 0 ? (moveGames / totalGames) * 100 : 0;
  };

  if (moves.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">♟</div>
        <div className="text-gray-400">No moves found in the database for this position.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <div className="text-sm text-gray-400 flex items-center gap-2">
          <span className="text-2xl">📚</span>
          <span>{formatNumber(totalGames)} games in database</span>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <span className="text-lg">🕒</span>
          <span>Last updated: {formatDate(lastUpdated)}</span>
        </div>
      </div>

      <div className="grid gap-3">
        {moves.map((move, index) => {
          const whitePercentage = calculatePercentage(move.whiteWins, move.games);
          const drawPercentage = calculatePercentage(move.draws, move.games);
          const blackPercentage = calculatePercentage(move.blackWins, move.games);
          const popularity = calculatePopularity(move.games);

          return (
            <button
              key={index}
              onClick={() => onMoveSelect(move)}
              className="group relative block w-full text-left rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-all duration-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {/* Popularity indicator */}
              <div 
                className="absolute inset-y-0 left-0 bg-blue-500/20 transition-all duration-200 group-hover:bg-blue-500/30"
                style={{ width: `${popularity}%` }}
              />

              <div className="relative p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-2xl text-white font-bold group-hover:text-blue-400 transition-colors">
                      {move.san}
                    </span>
                    <div className="flex flex-col text-sm">
                      <span className="text-gray-400">{formatNumber(move.games)} games</span>
                      <span className="text-gray-500 text-xs">{popularity.toFixed(1)}% of positions</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Win rate bars */}
                  <div className="flex h-2 rounded-full overflow-hidden bg-gray-900/50">
                    <div 
                      className="bg-green-500 transition-all duration-200" 
                      style={{ width: `${whitePercentage}%` }}
                      title={`White wins: ${whitePercentage.toFixed(1)}%`}
                    />
                    <div 
                      className="bg-gray-500 transition-all duration-200" 
                      style={{ width: `${drawPercentage}%` }}
                      title={`Draws: ${drawPercentage.toFixed(1)}%`}
                    />
                    <div 
                      className="bg-red-500 transition-all duration-200" 
                      style={{ width: `${blackPercentage}%` }}
                      title={`Black wins: ${blackPercentage.toFixed(1)}%`}
                    />
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex flex-col items-center p-1 rounded bg-gray-900/30">
                      <span className="text-green-400 font-medium">{formatNumber(move.whiteWins)}</span>
                      <span className="text-gray-500">White</span>
                    </div>
                    <div className="flex flex-col items-center p-1 rounded bg-gray-900/30">
                      <span className="text-gray-400 font-medium">{formatNumber(move.draws)}</span>
                      <span className="text-gray-500">Draws</span>
                    </div>
                    <div className="flex flex-col items-center p-1 rounded bg-gray-900/30">
                      <span className="text-red-400 font-medium">{formatNumber(move.blackWins)}</span>
                      <span className="text-gray-500">Black</span>
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default OpeningBook; 