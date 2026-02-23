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
  // クォーター設定
  quarterMinutes?: number;   // 1クォーターの時間（分）デフォルト10
  // タイマー状態（永続化）カウントダウン残り秒数
  timerSeconds?: number;     // 残り秒数（一時停止時に保存）
  timerStartedAt?: number;   // Date.now() タイマー開始時刻（実行中のみ）
  timerRunning?: boolean;    // タイマー実行中フラグ
  // 出場選手管理（永続化）
  onCourtPlayerIds?: number[];
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
  | 'foul'
  | 'subIn'
  | 'subOut';

export interface StatEvent {
  id?: number;
  gameId: number;
  playerId: number;
  teamId: number;
  quarter: number;
  action: StatAction;
  timestamp: Date;
  gameTime?: number; // ゲームクロック（秒）
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

// サンプルデータ投入（チームが1つもない場合のみ）
export async function ensureExampleData() {
  const count = await db.teams.count();
  if (count > 0) return;

  const team1Id = await db.teams.add({
    name: 'example1',
    isMyTeam: true,
    createdAt: new Date(),
  });

  await db.players.bulkAdd([
    { teamId: team1Id as number, number: 4, name: '田中' },
    { teamId: team1Id as number, number: 5, name: '鈴木' },
    { teamId: team1Id as number, number: 6, name: '山田' },
    { teamId: team1Id as number, number: 7, name: '佐藤' },
    { teamId: team1Id as number, number: 8, name: '高橋' },
  ]);

  const team2Id = await db.teams.add({
    name: 'example2',
    isMyTeam: false,
    createdAt: new Date(),
  });

  await db.players.bulkAdd([
    { teamId: team2Id as number, number: 4, name: '中村' },
    { teamId: team2Id as number, number: 5, name: '小林' },
    { teamId: team2Id as number, number: 6, name: '加藤' },
    { teamId: team2Id as number, number: 7, name: '吉田' },
    { teamId: team2Id as number, number: 8, name: '渡辺' },
  ]);
}
