import { create } from 'zustand';
import { db, type StatAction, type StatEvent } from './db';

interface GameState {
  // 選択中の選手
  selectedPlayerId: number | null;
  selectedTeamId: number | null;

  // 直前のイベント（取り消し用）
  lastEvent: StatEvent | null;

  // アクション
  selectPlayer: (playerId: number, teamId: number) => void;
  clearSelection: () => void;
  recordStat: (gameId: number, quarter: number, action: StatAction, gameTime?: number, zone?: string) => Promise<void>;
  undoLast: () => Promise<void>;
}

export const useGameStore = create<GameState>((set, get) => ({
  selectedPlayerId: null,
  selectedTeamId: null,
  lastEvent: null,

  selectPlayer: (playerId: number, teamId: number) => {
    set({ selectedPlayerId: playerId, selectedTeamId: teamId });
  },

  clearSelection: () => {
    set({ selectedPlayerId: null, selectedTeamId: null });
  },

  recordStat: async (gameId: number, quarter: number, action: StatAction, gameTime?: number, zone?: string) => {
    const { selectedPlayerId, selectedTeamId } = get();
    if (!selectedPlayerId || !selectedTeamId) return;

    const event: StatEvent = {
      gameId,
      playerId: selectedPlayerId,
      teamId: selectedTeamId,
      quarter,
      action,
      timestamp: new Date(),
      gameTime,
      zone,
    };

    const id = await db.statEvents.add(event);
    set({ lastEvent: { ...event, id } });
  },

  undoLast: async () => {
    const { lastEvent } = get();
    if (!lastEvent?.id) return;

    await db.statEvents.delete(lastEvent.id);
    set({ lastEvent: null });
  },
}));
