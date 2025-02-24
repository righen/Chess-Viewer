import { type PgnGame } from './PgnService';

export interface GameFilter {
  white?: string;
  black?: string;
  event?: string;
  site?: string;
  result?: string;
  dateFrom?: string;
  dateTo?: string;
  ecoFrom?: string;
  ecoTo?: string;
  minElo?: number;
  maxElo?: number;
}

export interface GameSortConfig {
  field: keyof PgnGame['headers'];
  direction: 'asc' | 'desc';
}

export interface GameListObserver {
  onGamesUpdate: (games: PgnGame[]) => void;
  onFilterChange: (filter: GameFilter) => void;
  onSortChange: (sort: GameSortConfig) => void;
}

export class GameListService {
  private static instance: GameListService | null = null;
  private games: PgnGame[] = [];
  private currentFilter: GameFilter = {};
  private currentSort: GameSortConfig = { field: 'Date', direction: 'desc' };
  private observers: Set<GameListObserver> = new Set();

  private constructor() {}

  public static getInstance(): GameListService {
    if (!GameListService.instance) {
      GameListService.instance = new GameListService();
    }
    return GameListService.instance;
  }

  public setGames(games: PgnGame[]) {
    console.log('GameListService: Setting games:', {
      count: games.length,
      firstGameHeaders: games[0]?.headers
    });

    // Make deep copies of games to ensure headers are preserved
    this.games = games.map(game => ({
      ...game,
      headers: { ...game.headers }  // Make a copy of headers
    }));

    console.log('GameListService: Games set with headers:', {
      count: this.games.length,
      firstGameHeaders: this.games[0]?.headers
    });

    this.notifyGamesUpdate();
  }

  public addObserver(observer: GameListObserver) {
    this.observers.add(observer);
  }

  public removeObserver(observer: GameListObserver) {
    this.observers.delete(observer);
  }

  public getGames(): PgnGame[] {
    return this.applyFilterAndSort([...this.games]);
  }

  public setFilter(filter: GameFilter) {
    this.currentFilter = filter;
    this.notifyFilterChange();
    this.notifyGamesUpdate();
  }

  public setSort(sort: GameSortConfig) {
    this.currentSort = sort;
    this.notifySortChange();
    this.notifyGamesUpdate();
  }

  private applyFilterAndSort(games: PgnGame[]): PgnGame[] {
    let filtered = this.applyFilter(games);
    return this.applySort(filtered);
  }

  private applyFilter(games: PgnGame[]): PgnGame[] {
    return games.filter(game => {
      const headers = game.headers;
      
      if (this.currentFilter.white && !headers['White']?.toLowerCase().includes(this.currentFilter.white.toLowerCase())) {
        return false;
      }
      if (this.currentFilter.black && !headers['Black']?.toLowerCase().includes(this.currentFilter.black.toLowerCase())) {
        return false;
      }
      if (this.currentFilter.event && !headers['Event']?.toLowerCase().includes(this.currentFilter.event.toLowerCase())) {
        return false;
      }
      if (this.currentFilter.site && !headers['Site']?.toLowerCase().includes(this.currentFilter.site.toLowerCase())) {
        return false;
      }
      if (this.currentFilter.result && headers['Result'] !== this.currentFilter.result) {
        return false;
      }
      if (this.currentFilter.dateFrom && headers['Date'] && headers['Date'] < this.currentFilter.dateFrom) {
        return false;
      }
      if (this.currentFilter.dateTo && headers['Date'] && headers['Date'] > this.currentFilter.dateTo) {
        return false;
      }
      if (this.currentFilter.ecoFrom && headers['ECO'] && headers['ECO'] < this.currentFilter.ecoFrom) {
        return false;
      }
      if (this.currentFilter.ecoTo && headers['ECO'] && headers['ECO'] > this.currentFilter.ecoTo) {
        return false;
      }

      if (this.currentFilter.minElo || this.currentFilter.maxElo) {
        const whiteElo = parseInt(headers['WhiteElo'] || '0');
        const blackElo = parseInt(headers['BlackElo'] || '0');
        const avgElo = whiteElo && blackElo ? (whiteElo + blackElo) / 2 : 0;

        if (this.currentFilter.minElo && (!avgElo || avgElo < this.currentFilter.minElo)) {
          return false;
        }
        if (this.currentFilter.maxElo && (!avgElo || avgElo > this.currentFilter.maxElo)) {
          return false;
        }
      }

      return true;
    });
  }

  private applySort(games: PgnGame[]): PgnGame[] {
    return games.sort((a, b) => {
      const aValue = a.headers[this.currentSort.field] || '';
      const bValue = b.headers[this.currentSort.field] || '';
      const direction = this.currentSort.direction === 'asc' ? 1 : -1;
      
      return aValue.localeCompare(bValue) * direction;
    });
  }

  private notifyGamesUpdate() {
    const filteredAndSortedGames = this.getGames();
    this.observers.forEach(observer => observer.onGamesUpdate(filteredAndSortedGames));
  }

  private notifyFilterChange() {
    this.observers.forEach(observer => observer.onFilterChange(this.currentFilter));
  }

  private notifySortChange() {
    this.observers.forEach(observer => observer.onSortChange(this.currentSort));
  }
} 