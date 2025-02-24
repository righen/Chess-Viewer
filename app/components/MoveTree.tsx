import React from 'react';
import { Chess } from 'chess.js';

interface Move {
  san: string;
  fen: string;
  variations: Move[][];
}

interface MoveTreeProps {
  moves: Move[];
  currentMoveIndex: number;
  onMoveClick: (moveIndex: number) => void;
  className?: string;
}

interface MoveLineProps {
  moves: Move[];
  startIndex: number;
  currentMoveIndex: number;
  onMoveClick: (moveIndex: number) => void;
  isMainLine?: boolean;
}

const MoveLine: React.FC<MoveLineProps> = ({ moves, startIndex, currentMoveIndex, onMoveClick, isMainLine = true }) => {
  if (!moves || moves.length === 0) {
    console.log('MoveLine: No moves to display');
    return null;
  }

  console.log('MoveLine rendering:', {
    movesCount: moves.length,
    startIndex,
    currentMoveIndex,
    isMainLine
  });

  return (
    <div className={`flex flex-wrap gap-1 ${!isMainLine ? 'ml-4 mt-1' : ''}`}>
      {moves.map((move, index) => {
        const absoluteIndex = startIndex + index;
        const moveNumber = Math.floor(absoluteIndex / 2) + 1;
        const isWhiteMove = absoluteIndex % 2 === 0;

        console.log('Rendering move:', {
          san: move.san,
          absoluteIndex,
          moveNumber,
          isWhiteMove,
          variationsCount: move.variations?.length || 0
        });

        return (
          <React.Fragment key={absoluteIndex}>
            {(isWhiteMove || (!isMainLine && index === 0)) && (
              <span className="text-gray-500 select-none">
                {moveNumber}{isWhiteMove ? '.' : '...'}
              </span>
            )}
            <button
              onClick={() => {
                console.log('Move clicked:', absoluteIndex);
                onMoveClick(absoluteIndex);
              }}
              className={`px-2 py-0.5 rounded text-left ${
                currentMoveIndex === absoluteIndex
                  ? 'bg-blue-900/50 text-blue-300'
                  : 'text-white hover:bg-gray-800'
              }`}
            >
              {move.san}
            </button>
            {move.variations && move.variations.length > 0 && move.variations.map((variation, varIndex) => {
              console.log('Rendering variation:', {
                parentMove: move.san,
                variationIndex: varIndex,
                movesInVariation: variation.length
              });
              return (
                <div key={varIndex} className="w-full">
                  <div className="text-gray-500 ml-4 mt-1">({moveNumber}...)</div>
                  <MoveLine
                    moves={variation}
                    startIndex={absoluteIndex + 1}
                    currentMoveIndex={currentMoveIndex}
                    onMoveClick={onMoveClick}
                    isMainLine={false}
                  />
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const MoveTree: React.FC<MoveTreeProps> = ({ moves, currentMoveIndex, onMoveClick, className = '' }) => {
  console.log('MoveTree rendering with:', {
    movesCount: moves?.length || 0,
    currentMoveIndex,
    firstMove: moves?.[0]?.san,
    hasVariations: moves?.some(m => m.variations?.length > 0)
  });

  if (!moves || moves.length === 0) {
    console.log('MoveTree: No moves to display');
    return (
      <div className={`bg-gray-900 rounded-lg shadow-lg shadow-black/20 p-4 ${className}`}>
        <div className="text-gray-500 text-center">No moves to display</div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900 rounded-lg shadow-lg shadow-black/20 p-4 ${className}`}>
      <div className="space-y-2">
        <MoveLine
          moves={moves}
          startIndex={0}
          currentMoveIndex={currentMoveIndex}
          onMoveClick={onMoveClick}
        />
      </div>
    </div>
  );
};

export default MoveTree; 