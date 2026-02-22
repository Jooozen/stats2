import type { StatEvent } from './db';

export interface PlayerStats {
  pts: number;
  fg: number;    // フィールドゴール成功
  fga: number;   // フィールドゴール試投
  tp: number;    // 3P成功
  tpa: number;   // 3P試投
  ft: number;    // FT成功
  fta: number;   // FT試投
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  foul: number;
}

export function emptyStats(): PlayerStats {
  return { pts: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, foul: 0 };
}

export function calcPlayerStats(events: StatEvent[]): PlayerStats {
  const s = emptyStats();
  for (const e of events) {
    switch (e.action) {
      case 'pts2':
        s.pts += 2; s.fg++; s.fga++; break;
      case 'pts3':
        s.pts += 3; s.fg++; s.fga++; s.tp++; s.tpa++; break;
      case 'ft':
        s.pts += 1; s.ft++; s.fta++; break;
      case 'miss2':
        s.fga++; break;
      case 'miss3':
        s.fga++; s.tpa++; break;
      case 'missFt':
        s.fta++; break;
      case 'reb':
        s.reb++; break;
      case 'ast':
        s.ast++; break;
      case 'stl':
        s.stl++; break;
      case 'blk':
        s.blk++; break;
      case 'to':
        s.to++; break;
      case 'foul':
        s.foul++; break;
    }
  }
  return s;
}

export function calcTeamScore(events: StatEvent[]): number {
  let score = 0;
  for (const e of events) {
    if (e.action === 'pts2') score += 2;
    else if (e.action === 'pts3') score += 3;
    else if (e.action === 'ft') score += 1;
  }
  return score;
}

export function mergeStats(a: PlayerStats, b: PlayerStats): PlayerStats {
  return {
    pts: a.pts + b.pts,
    fg: a.fg + b.fg,
    fga: a.fga + b.fga,
    tp: a.tp + b.tp,
    tpa: a.tpa + b.tpa,
    ft: a.ft + b.ft,
    fta: a.fta + b.fta,
    reb: a.reb + b.reb,
    ast: a.ast + b.ast,
    stl: a.stl + b.stl,
    blk: a.blk + b.blk,
    to: a.to + b.to,
    foul: a.foul + b.foul,
  };
}
