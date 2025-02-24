'use client';

import { Chess } from 'chess.js';
import { ChessEngineService, type EngineSettings, type AnalysisMove, type AnalysisInfo } from './ChessEngineService';

export interface AnalysisObserver {
  onAnalysisUpdate(analysis: AnalysisMove[]): void;
  onInfoUpdate(info: AnalysisInfo): void;
  onEngineStatusChange(isAnalyzing: boolean): void;
}

export class EngineAnalysisService {
  private static instance: EngineAnalysisService;
  private engineService: ChessEngineService | null = null;
  private observers: Set<AnalysisObserver>;
  private isAnalyzing: boolean = false;
  private currentPosition: Chess | null = null;

  constructor() {
    this.observers = new Set();
  }

  public static getInstance(): EngineAnalysisService {
    if (!EngineAnalysisService.instance) {
      EngineAnalysisService.instance = new EngineAnalysisService();
    }
    return EngineAnalysisService.instance;
  }

  public addObserver(observer: AnalysisObserver) {
    this.observers.add(observer);
  }

  public removeObserver(observer: AnalysisObserver) {
    this.observers.delete(observer);
  }

  private notifyAnalysisUpdate(analysis: AnalysisMove[]) {
    this.observers.forEach(observer => observer.onAnalysisUpdate(analysis));
  }

  private notifyInfoUpdate(info: AnalysisInfo) {
    this.observers.forEach(observer => observer.onInfoUpdate(info));
  }

  private notifyEngineStatusChange(isAnalyzing: boolean) {
    this.observers.forEach(observer => observer.onEngineStatusChange(isAnalyzing));
  }

  public initialize(settings: EngineSettings) {
    if (this.engineService) {
      this.engineService.cleanup();
    }

    this.engineService = new ChessEngineService(settings);
    this.engineService.initialize(
      (analysis) => this.notifyAnalysisUpdate(analysis),
      (info) => this.notifyInfoUpdate(info),
      () => {} // Version update not needed here
    );
  }

  public startAnalysis(position: Chess) {
    if (!this.engineService) return;

    this.currentPosition = position;
    this.isAnalyzing = true;
    this.notifyEngineStatusChange(true);
    this.engineService.startAnalysis(position);
  }

  public stopAnalysis() {
    if (!this.engineService) return;

    this.isAnalyzing = false;
    this.notifyEngineStatusChange(false);
    this.engineService.stopAnalysis();
  }

  public toggleAnalysis(position: Chess) {
    if (this.isAnalyzing) {
      this.stopAnalysis();
    } else {
      this.startAnalysis(position);
    }
  }

  public updateSettings(settings: EngineSettings) {
    if (!this.engineService) return;

    this.engineService.updateSettings(settings);
    
    // If currently analyzing, restart analysis with new settings
    if (this.isAnalyzing && this.currentPosition) {
      this.engineService.startAnalysis(this.currentPosition);
    }
  }

  public cleanup() {
    if (this.engineService) {
      this.engineService.cleanup();
      this.engineService = null;
    }
    this.observers.clear();
    this.isAnalyzing = false;
    this.currentPosition = null;
  }

  public isEngineAnalyzing(): boolean {
    return this.isAnalyzing;
  }
} 