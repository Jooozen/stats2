import Dexie, { type Table } from 'dexie';

// チーム
export interface Team {
  id?: number;
  name: string;
  isMyTeam: boolean;
  createdAt: Date;
}

// 選手
export interface Player {
  id?: number;
  teamId: number;
  number: number;
  name: string;
}

// 試合
export interface Game {
  id?: number;
  myTeamId: number;
  opponentTeamId: number;
  date: Date;
  status: 'live' | 'finished';
  currentQuarter: number;
  createdAt: Date;
}

// スタッツイベント
export type StatAction =
  | 'pts2'
  | 'pts3'
  | 'ft'
  | 'miss2'
  | 'miss3'
  | 'missFt'
  | 'reb'
  | 'ast'
  | 'stl'
  | 'blk'
  | 'to'
  | 'foul';

export interface StatEvent {
  id?: number;
  gameId: number;
  playerId: number;
  teamId: number;
  quarter: number;
  action: StatAction;
  timestamp: Date;
}

export class BasketballDB extends Dexie {
  teams!: Table<Team>;
  players!: Table<Player>;
  games!: Table<Game>;
  statEvents!: Table<StatEvent>;

  constructor() {
    super('BasketballStatsDB');
    this.version(1).stores({
      teams: '++id, name, isMyTeam, createdAt',
      players: '++id, teamId, number, name',
      games: '++id, myTeamId, opponentTeamId, date, status, createdAt',
      statEvents: '++id, gameId, playerId, teamId, quarter, action, timestamp',
    });
  }
}

export const db = new BasketballDB();
