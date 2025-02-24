import { Chess } from 'chess.js';

export interface PgnHeaders {
  White?: string;
  Black?: string;
  Date?: string;
  Event?: string;
  Site?: string;
  Result?: string;
  [key: string]: string | undefined;
}

export interface PgnMove {
  san: string;
  fen: string;
  variations: PgnMove[][];
}

export interface PgnGame {
  pgn: string;
  moves: PgnMove[];
  headers: PgnHeaders;
}

export interface PgnLoadResult {
  success: boolean;
  games: PgnGame[];
  error?: string;
}

export class PgnService {
  private static instance: PgnService;

  // Singleton pattern
  public static getInstance(): PgnService {
    if (!PgnService.instance) {
      PgnService.instance = new PgnService();
    }
    return PgnService.instance;
  }

  private constructor() {}

  // Factory method for creating PgnGame objects
  private createGame(pgn: string, moves: PgnMove[], headers: PgnHeaders): PgnGame {
    console.log('Creating game with input headers:', headers);
    
    // Ensure all required headers have values, but don't override existing values
    const processedHeaders = {
      ...headers,  // Keep original headers
      // Only set defaults if values don't exist
      White: headers.White || 'Unknown',
      Black: headers.Black || 'Unknown',
      Date: headers.Date || 'Unknown',
      Event: headers.Event || 'Unknown',
      Site: headers.Site || 'Unknown',
      Result: headers.Result || '*',
      Round: headers.Round || '-'
    };

    console.log('Final processed headers:', processedHeaders);

    return { 
      pgn, 
      moves, 
      headers: processedHeaders 
    };
  }

  private cleanPgn(pgnText: string): string {
    return pgnText
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
      .replace(/\r\n/g, '\n')                 // Normalize line endings
      .trim();
  }

  private splitGames(pgnText: string): string[] {
    const games: string[] = [];
    let currentGame = '';
    let inGame = false;
    
    const lines = pgnText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Start of a new game when we find a header
      if (trimmedLine.startsWith('[')) {
        // If we were already in a game and find a new game's headers
        if (inGame && i > 0 && !lines[i-1].trim().startsWith('[')) {
          games.push(currentGame.trim());
          currentGame = '';
        }
        inGame = true;
      }
      
      // Add the line to current game
      if (trimmedLine || inGame) {
        currentGame += line + '\n';
      }
    }
    
    // Add the last game if it exists
    if (currentGame.trim()) {
      games.push(currentGame.trim());
    }
    
    // Filter out invalid games (must have moves)
    return games.filter(game => {
      const hasValidMoves = game.match(/\d+\./);
      return hasValidMoves;
    });
  }

  private parseMoves(chess: Chess): PgnMove[] {
    const moves: PgnMove[] = [];
    const replayChess = new Chess();
    
    chess.history({ verbose: true }).forEach(move => {
      replayChess.move(move);
      moves.push({
        san: move.san,
        fen: replayChess.fen(),
        variations: []
      });
    });

    return moves;
  }

  private extractHeadersFromText(gameText: string): Record<string, string> {
    const headers: Record<string, string> = {};
    
    // Log the first part of the game text to see what we're working with
    console.log('Extracting headers from game text:', {
      textPreview: gameText.slice(0, 500),
      containsBrackets: gameText.includes('['),
      containsQuotes: gameText.includes('"')
    });

    // Match standard PGN headers with better regex
    // This regex handles multiline headers and is more lenient with whitespace
    const headerRegex = /\[([\w\s]+)\s+"([^"]+)"\]/g;
    let match;
    
    while ((match = headerRegex.exec(gameText)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim();
      console.log('Found header:', { key, value });
      headers[key] = value;
    }
    
    console.log('Final extracted headers:', headers);
    return headers;
  }

  public loadFromText(pgnText: string): PgnLoadResult {
    try {
      console.log('PgnService: Loading PGN from text:', pgnText.slice(0, 200));
      const cleanedPgn = this.cleanPgn(pgnText);
      const gameTexts = this.splitGames(cleanedPgn);
      
      console.log('PgnService: Split games:', {
        numberOfGames: gameTexts.length,
        firstGame: gameTexts[0]?.slice(0, 200)
      });

      const games: PgnGame[] = [];

      for (const gameText of gameTexts) {
        try {
          console.log('PgnService: Processing game text:', {
            length: gameText.length,
            preview: gameText.slice(0, 200),
            hasHeaders: gameText.includes('['),
            hasMoves: gameText.includes('1.')
          });

          // Create a chess instance
          const chess = new Chess();
          
          // Extract headers first
          const extractedHeaders = gameText.includes('[') 
            ? this.extractHeadersFromText(gameText)
            : {
                White: 'Unknown',
                Black: 'Unknown',
                Date: 'Unknown',
                Event: 'Unknown',
                Site: 'Unknown',
                Result: '*',
                Round: '-'
              };

          // Set all headers in chess.js
          Object.entries(extractedHeaders).forEach(([key, value]) => {
            chess.header(key, value);
          });
          
          // Load the PGN
          chess.loadPgn(gameText);

          // Parse moves
          const moves = this.parseMoves(chess);
          console.log('PgnService: Parsed game moves:', {
            numberOfMoves: moves.length,
            firstMove: moves[0]?.san,
            lastMove: moves[moves.length - 1]?.san
          });

          if (moves.length > 0) {
            const game = this.createGame(gameText, moves, extractedHeaders);
            console.log('PgnService: Created game object:', {
              headers: game.headers,
              movesCount: game.moves.length
            });
            games.push(game);
          }
        } catch (e) {
          console.error('PgnService: Failed to load game:', e);
          // Continue to next game
        }
      }

      console.log('PgnService: Finished loading games:', {
        totalGames: games.length,
        allGames: games.map(g => ({
          white: g.headers.White,
          black: g.headers.Black,
          event: g.headers.Event,
          moves: g.moves.length
        }))
      });

      return { 
        success: games.length > 0, 
        games,
        error: games.length === 0 ? 'No valid games found in PGN' : undefined
      };
    } catch (error) {
      console.error('PgnService: Error loading PGN:', error);
      return { 
        success: false, 
        games: [], 
        error: error instanceof Error ? error.message : 'Unknown error loading PGN' 
      };
    }
  }

  public async loadFromFile(file: File): Promise<PgnLoadResult> {
    try {
      const text = await file.text();
      return this.loadFromText(text);
    } catch (error) {
      return { 
        success: false, 
        games: [], 
        error: error instanceof Error ? error.message : 'Error reading file' 
      };
    }
  }

  public validatePgn(pgnText: string): boolean {
    try {
      const chess = new Chess();
      chess.loadPgn(this.cleanPgn(pgnText));
      return true;
    } catch {
      return false;
    }
  }
} 