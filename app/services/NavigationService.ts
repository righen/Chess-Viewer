'use client';

import { GameManager } from './GameManager';

export type NavigationCommand = 'first' | 'prev' | 'next' | 'last' | 'flip';

export interface NavigationObserver {
  onNavigationCommand(command: NavigationCommand): void;
}

export interface KeyboardShortcut {
  key: string;
  command: NavigationCommand;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export class NavigationService {
  private static instance: NavigationService;
  private observers: Set<NavigationObserver>;
  private shortcuts: KeyboardShortcut[];
  private gameManager: GameManager;
  private enabled: boolean = true;

  constructor() {
    this.observers = new Set();
    this.gameManager = new GameManager();
    this.shortcuts = [
      { key: 'ArrowLeft', command: 'prev' },
      { key: 'ArrowRight', command: 'next' },
      { key: 'Home', command: 'first' },
      { key: 'End', command: 'last' },
      { key: 'f', command: 'flip' }
    ];

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
    }
  }

  public static getInstance(): NavigationService {
    if (!NavigationService.instance) {
      NavigationService.instance = new NavigationService();
    }
    return NavigationService.instance;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    
    const shortcut = this.shortcuts.find(s => 
      s.key === e.key &&
      (!s.ctrlKey || e.ctrlKey) &&
      (!s.shiftKey || e.shiftKey) &&
      (!s.altKey || e.altKey)
    );

    if (shortcut) {
      e.preventDefault();
      this.observers.forEach(observer => observer.onNavigationCommand(shortcut.command));
    }
  };

  public addObserver(observer: NavigationObserver) {
    this.observers.add(observer);
  }

  public removeObserver(observer: NavigationObserver) {
    this.observers.delete(observer);
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public addShortcut(shortcut: KeyboardShortcut) {
    this.shortcuts.push(shortcut);
  }

  public removeShortcut(key: string) {
    this.shortcuts = this.shortcuts.filter(s => s.key !== key);
  }

  public cleanup() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    this.observers.clear();
  }
} 