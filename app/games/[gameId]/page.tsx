'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db, type Game, type Team, type Player, type StatEvent, type StatAction, type ShotZone, type GameCategory, SHOT_ZONE_INFO, GAME_CATEGORY_CONFIG } from '@/lib/db';
import { calcTeamScore, calcPlayerStats } from '@/lib/stats';
import { useGameStore } from '@/lib/store';

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4', 'OT'];

// 6列 x 2行のスタッツボタン配置
// category: 'shoot' = シュート関係, 'other' = それ以外
const STAT_ROW1: { action: StatAction; label: string; category: 'shoot' | 'other' }[] = [
  { action: 'pts2', label: '2P', category: 'shoot' },
  { action: 'pts3', label: '3P', category: 'shoot' },
  { action: 'ft', label: 'FT', category: 'shoot' },
  { action: 'reb', label: 'REB', category: 'other' },
  { action: 'ast', label: 'AST', category: 'other' },
  { action: 'stl', label: 'STL', category: 'other' },
];
const STAT_ROW2: { action: StatAction; label: string; category: 'shoot' | 'other' }[] = [
  { action: 'miss2', label: 'ミス2P', category: 'shoot' },
  { action: 'miss3', label: 'ミス3P', category: 'shoot' },
  { action: 'missFt', label: 'ミスFT', category: 'shoot' },
  { action: 'blk', label: 'BLK', category: 'other' },
  { action: 'to', label: 'TO', category: 'other' },
  { action: 'foul', label: 'FOUL', category: 'other' },
];
const ALL_STAT_BUTTONS = [...STAT_ROW1, ...STAT_ROW2];

// コート上のシュートゾーン（SVGポリゴン座標）バスケットは上側
// 3Pラインのアーク（ベジェ曲線の近似点）に沿ってゾーンを分割
// アーク: (32,58)→(34,78)→(39,95)→(57,124)→(83,144)→(98,153)→(150,161)→(202,153)→(217,144)→(243,124)→(261,95)→(266,78)→(268,58)
const COURT_ZONES: { id: ShotZone; label: string; is3pt: boolean; points: string; labelX: number; labelY: number }[] = [
  // ペイント（2PT）- ゴール付近
  { id: 'paint', label: 'ペイント', is3pt: false,
    points: '88,4 212,4 212,104 88,104', labelX: 150, labelY: 54 },
  // 3P左コーナー - ベースライン左、3Pライン外側
  { id: 'threeLeftCorner', label: '左C', is3pt: true,
    points: '4,4 32,4 32,58 34,78 39,95 4,95', labelX: 19, labelY: 48 },
  // 3P右コーナー - ベースライン右、3Pライン外側
  { id: 'threeRightCorner', label: '右C', is3pt: true,
    points: '268,4 296,4 296,95 261,95 266,78 268,58', labelX: 281, labelY: 48 },
  // ミドル左（2PT）- 3Pライン内側、ペイント左
  { id: 'midLeft', label: 'M左', is3pt: false,
    points: '32,4 88,4 88,104 83,144 57,124 39,95 34,78 32,58', labelX: 58, labelY: 70 },
  // ミドル右（2PT）- 3Pライン内側、ペイント右
  { id: 'midRight', label: 'M右', is3pt: false,
    points: '212,4 268,4 268,58 266,78 261,95 243,124 217,144 212,104', labelX: 242, labelY: 70 },
  // ミドル中央（2PT）- フリースロー下、3Pアーク上
  { id: 'midCenter', label: 'M中央', is3pt: false,
    points: '88,104 212,104 217,144 202,153 150,161 98,153 83,144', labelX: 150, labelY: 130 },
  // 3P左ウイング - 3Pアーク外側左
  { id: 'threeLeftWing', label: '左W', is3pt: true,
    points: '4,95 39,95 57,124 83,144 98,153 100,276 4,276', labelX: 48, labelY: 190 },
  // 3Pトップ - 3Pアーク外側中央
  { id: 'threeTop', label: 'トップ', is3pt: true,
    points: '100,153 115,157 150,161 185,157 200,153 200,276 100,276', labelX: 150, labelY: 218 },
  // 3P右ウイング - 3Pアーク外側右
  { id: 'threeRightWing', label: '右W', is3pt: true,
    points: '261,95 296,95 296,276 200,276 200,153 202,153 217,144 243,124', labelX: 252, labelY: 190 },
];

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const STAT_COLUMNS = [
  { key: 'pts', label: 'PTS' },
  { key: 'fg', label: 'FG' },
  { key: 'tp', label: '3P' },
  { key: 'ft', label: 'FT' },
  { key: 'reb', label: 'REB' },
  { key: 'ast', label: 'AST' },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'to', label: 'TO' },
  { key: 'foul', label: 'PF' },
] as const;

export default function GameStatsPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = Number(params.gameId);

  const [game, setGame] = useState<Game | null>(null);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [opponentTeam, setOpponentTeam] = useState<Team | null>(null);
  const [myPlayers, setMyPlayers] = useState<Player[]>([]);
  const [opponentPlayers, setOpponentPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<StatEvent[]>([]);
  const [quarter, setQuarter] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  // 選択サイド（同一チーム対戦時に左右を区別）
  const [selectedSide, setSelectedSide] = useState<'my' | 'opp' | null>(null);

  // タイマー（カウントダウン）
  const [timerDisplay, setTimerDisplay] = useState(600); // 残り秒数
  const [timerRunning, setTimerRunning] = useState(false);
  const remainingRef = useRef(600); // 残り秒数（開始時点）
  const startTimeRef = useRef(0);
  const [quarterDuration, setQuarterDuration] = useState(600); // 1Q秒数
  // 停止時の手入力用
  const [editMin, setEditMin] = useState('');
  const [editSec, setEditSec] = useState('');

  // 出場管理
  const [onCourtIds, setOnCourtIds] = useState<Set<number>>(new Set());

  // モーダル
  const [showStats, setShowStats] = useState(false);
  const [statsTab, setStatsTab] = useState<'my' | 'opp'>('my');
  const [showMemberChange, setShowMemberChange] = useState(false);
  const [memberTab, setMemberTab] = useState<'my' | 'opp'>('opp');
  const [showTimeline, setShowTimeline] = useState(false);

  // コートゾーン選択
  const [selectedZone, setSelectedZone] = useState<ShotZone | null>(null);

  const {
    selectedPlayerId,
    selectedTeamId,
    selectPlayer,
    clearSelection,
    recordStat,
    undoLast,
    lastEvent,
  } = useGameStore();

  // ---------- データ読み込み ----------
  const loadGame = useCallback(async () => {
    try {
      const g = await db.games.get(gameId);
      if (!g) return;
      setGame(g);
      setQuarter(g.currentQuarter);

      // クォーター時間を復元
      const qMins = g.quarterMinutes || 10;
      const qDur = qMins * 60;
      setQuarterDuration(qDur);

      // タイマー復元（カウントダウン: timerSeconds = 残り秒数）
      const saved = g.timerSeconds ?? qDur;
      if (g.timerRunning && g.timerStartedAt) {
        const elapsed = (Date.now() - g.timerStartedAt) / 1000;
        const remaining = Math.max(0, saved - elapsed);
        remainingRef.current = remaining;
        if (remaining > 0) {
          startTimeRef.current = Date.now();
          setTimerRunning(true);
        }
        setTimerDisplay(remaining);
      } else {
        remainingRef.current = saved;
        setTimerDisplay(saved);
      }

      if (g.onCourtPlayerIds) {
        setOnCourtIds(new Set(g.onCourtPlayerIds));
      }

      const mt = await db.teams.get(g.myTeamId);
      const ot = await db.teams.get(g.opponentTeamId);
      setMyTeam(mt || null);
      setOpponentTeam(ot || null);

      await reloadPlayers(g.myTeamId, g.opponentTeamId);

      const ev = await db.statEvents.where('gameId').equals(gameId).toArray();
      setEvents(ev);
    } catch {
      // DB not ready
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  async function reloadPlayers(myTeamId: number, oppTeamId: number) {
    const mp = await db.players.where('teamId').equals(myTeamId).toArray();
    const op = await db.players.where('teamId').equals(oppTeamId).toArray();
    setMyPlayers(mp.sort((a, b) => a.number - b.number));
    setOpponentPlayers(op.sort((a, b) => a.number - b.number));
  }

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  // タイマー更新（カウントダウン）
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const remaining = Math.max(0, remainingRef.current - elapsed);
      setTimerDisplay(remaining);
      if (remaining <= 0) {
        // 時間切れ → 自動停止
        remainingRef.current = 0;
        setTimerRunning(false);
        if (game?.id) {
          db.games.update(game.id, {
            timerSeconds: 0,
            timerRunning: false,
            timerStartedAt: undefined,
          });
        }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [timerRunning, game?.id]);

  // 経過ゲーム時間（スタッツ記録用: クォーター開始からの秒数）
  function getGameTime(): number {
    const remaining = timerRunning
      ? Math.max(0, remainingRef.current - (Date.now() - startTimeRef.current) / 1000)
      : remainingRef.current;
    return Math.floor(quarterDuration - remaining);
  }

  async function toggleTimer() {
    if (timerRunning) {
      // 一時停止
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
      setTimerDisplay(remainingRef.current);
      setTimerRunning(false);
      if (game?.id) {
        await db.games.update(game.id, {
          timerSeconds: remainingRef.current,
          timerRunning: false,
          timerStartedAt: undefined,
        });
      }
    } else {
      // 開始（残り0なら開始しない）
      if (remainingRef.current <= 0) return;
      startTimeRef.current = Date.now();
      setTimerRunning(true);
      if (game?.id) {
        await db.games.update(game.id, {
          timerRunning: true,
          timerStartedAt: Date.now(),
          timerSeconds: remainingRef.current,
        });
      }
    }
  }

  async function resetTimer() {
    remainingRef.current = quarterDuration;
    setTimerDisplay(quarterDuration);
    setTimerRunning(false);
    if (game?.id) {
      await db.games.update(game.id, {
        timerSeconds: quarterDuration,
        timerRunning: false,
        timerStartedAt: undefined,
      });
    }
  }

  // 停止中に手入力で時間変更
  async function setTimerManual(mins: number, secs: number) {
    const total = Math.max(0, Math.min(mins * 60 + secs, 99 * 60 + 59));
    remainingRef.current = total;
    setTimerDisplay(total);
    if (game?.id) {
      await db.games.update(game.id, { timerSeconds: total });
    }
  }

  // スコア算出
  const myScore = calcTeamScore(
    events.filter((e) => game && e.teamId === game.myTeamId)
  );
  const opponentScore = calcTeamScore(
    events.filter((e) => game && e.teamId === game.opponentTeamId)
  );

  const selectedPlayer = selectedPlayerId
    ? (selectedSide === 'my' ? myPlayers : opponentPlayers).find((p) => p.id === selectedPlayerId)
    : null;
  const isMyTeamSelected = selectedSide === 'my';

  async function reloadEvents() {
    const ev = await db.statEvents.where('gameId').equals(gameId).toArray();
    setEvents(ev);
  }

  async function handleAction(action: StatAction) {
    if (!selectedPlayerId || !selectedTeamId) {
      showFeedback('選手を選択してください');
      return;
    }
    const gt = getGameTime();
    await recordStat(gameId, quarter, action, gt);
    await reloadEvents();

    const btn = ALL_STAT_BUTTONS.find((b) => b.action === action);
    showFeedback(
      `#${selectedPlayer?.number} ${selectedPlayer?.name} → ${btn?.label}  [${formatTime(gt)}]`
    );
  }

  async function handleUndo() {
    if (!lastEvent) {
      showFeedback('取り消す記録がありません');
      return;
    }
    const p = [...myPlayers, ...opponentPlayers].find(
      (pl) => pl.id === lastEvent.playerId
    );
    const btn = ALL_STAT_BUTTONS.find((b) => b.action === lastEvent.action);
    await undoLast();
    await reloadEvents();
    showFeedback(`↩ #${p?.number} ${p?.name} ${btn?.label || lastEvent.action} を取消`);
  }

  // コートゾーンタップ → 成功/失敗選択
  function handleZoneTap(zoneId: ShotZone) {
    if (!selectedPlayerId || !selectedTeamId) {
      showFeedback('選手を選択してください');
      return;
    }
    setSelectedZone(zoneId);
  }

  async function handleCourtShot(made: boolean) {
    if (!selectedPlayerId || !selectedTeamId || !selectedZone) return;
    const zone = COURT_ZONES.find(z => z.id === selectedZone);
    if (!zone) return;

    const action: StatAction = zone.is3pt
      ? (made ? 'pts3' : 'miss3')
      : (made ? 'pts2' : 'miss2');

    const gt = getGameTime();
    await recordStat(gameId, quarter, action, gt, selectedZone);
    await reloadEvents();

    const zoneInfo = SHOT_ZONE_INFO[selectedZone];
    showFeedback(
      `#${selectedPlayer?.number} ${selectedPlayer?.name} → ${zoneInfo.label}${zone.is3pt ? '3P' : '2P'} ${made ? '成功!' : '失敗'} [${formatTime(gt)}]`
    );
    setSelectedZone(null);
  }

  // ゾーン別シュート集計（選択中の選手用）
  function getZoneStatsForPlayer(playerId: number): Record<string, { makes: number; attempts: number }> {
    const stats: Record<string, { makes: number; attempts: number }> = {};
    for (const e of events) {
      if (e.playerId !== playerId || !e.zone) continue;
      if (!['pts2', 'pts3', 'miss2', 'miss3'].includes(e.action)) continue;
      if (!stats[e.zone]) stats[e.zone] = { makes: 0, attempts: 0 };
      stats[e.zone].attempts++;
      if (e.action === 'pts2' || e.action === 'pts3') stats[e.zone].makes++;
    }
    return stats;
  }

  async function changeQuarter(q: number) {
    setQuarter(q);
    // OTに切り替えた場合、OT時間でタイマーをリセット
    if (q >= 5 && game?.overtimeMinutes) {
      const otDur = game.overtimeMinutes * 60;
      setQuarterDuration(otDur);
      remainingRef.current = otDur;
      setTimerDisplay(otDur);
      setTimerRunning(false);
      if (game.id) {
        await db.games.update(game.id, {
          currentQuarter: q,
          timerSeconds: otDur,
          timerRunning: false,
          timerStartedAt: undefined,
        });
      }
    } else {
      // 通常クォーター
      const qDur = (game?.quarterMinutes || 10) * 60;
      setQuarterDuration(qDur);
      if (game?.id) {
        await db.games.update(game.id, { currentQuarter: q });
      }
    }
  }

  async function finishGame() {
    if (!confirm('試合を終了しますか？')) return;
    if (game?.id) {
      if (timerRunning) {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        remainingRef.current = Math.max(0, remainingRef.current - elapsed);
        setTimerRunning(false);
      }
      await db.games.update(game.id, {
        status: 'finished' as const,
        timerRunning: false,
        timerSeconds: remainingRef.current,
      });
      router.push(`/games/${game.id}/summary`);
    }
  }

  async function suspendGame() {
    if (!confirm('試合を中断しますか？（後から再開できます）')) return;
    if (game?.id) {
      if (timerRunning) {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        remainingRef.current = Math.max(0, remainingRef.current - elapsed);
        setTimerRunning(false);
      }
      await db.games.update(game.id, {
        timerRunning: false,
        timerSeconds: remainingRef.current,
      });
      router.push('/games');
    }
  }

  async function toggleOnCourt(playerId: number, teamId: number) {
    const gt = getGameTime();
    const next = new Set(onCourtIds);
    if (next.has(playerId)) {
      next.delete(playerId);
      await db.statEvents.add({
        gameId, playerId, teamId, quarter,
        action: 'subOut', timestamp: new Date(), gameTime: gt,
      });
    } else {
      next.add(playerId);
      await db.statEvents.add({
        gameId, playerId, teamId, quarter,
        action: 'subIn', timestamp: new Date(), gameTime: gt,
      });
    }
    setOnCourtIds(next);
    if (game?.id) {
      await db.games.update(game.id, { onCourtPlayerIds: Array.from(next) });
    }
    await reloadEvents();
  }

  // メンバー追加
  async function handleAddPlayer(teamId: number, number: number, name: string) {
    await db.players.add({ teamId, number, name });
    if (game) {
      await reloadPlayers(game.myTeamId, game.opponentTeamId);
    }
  }

  function showFeedback(msg: string) {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(''), 2000);
  }

  function getPlayerStatsForTeam(teamId: number, players: Player[]) {
    const teamEvents = events.filter(
      (e) => e.teamId === teamId && e.action !== 'subIn' && e.action !== 'subOut'
    );
    return players.map((player) => {
      const playerEvents = teamEvents.filter((e) => e.playerId === player.id);
      const stats = calcPlayerStats(playerEvents);
      return { player, stats };
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <p className="text-gray-400 text-lg">読み込み中...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <p className="text-gray-400 text-lg">試合が見つかりません</p>
      </div>
    );
  }

  const hasSelection = selectedPlayerId !== null && selectedTeamId !== null;

  // ファール集計
  function getPlayerFouls(playerId: number): number {
    return events.filter((e) => e.playerId === playerId && e.action === 'foul').length;
  }
  function getTeamQuarterFouls(teamId: number): number {
    return events.filter((e) => e.teamId === teamId && e.action === 'foul' && e.quarter === quarter).length;
  }
  const myTeamQFouls = getTeamQuarterFouls(game.myTeamId);
  const oppTeamQFouls = getTeamQuarterFouls(game.opponentTeamId);

  // タイムアウト集計
  const categoryConfig = game.category ? GAME_CATEGORY_CONFIG[game.category] : null;

  function getTeamTimeouts(teamId: number, half: 'first' | 'second' | 'overtime'): number {
    return events.filter((e) => {
      if (e.teamId !== teamId || e.action !== 'timeout') return false;
      if (half === 'first') return e.quarter <= 2;
      if (half === 'second') return e.quarter >= 3 && e.quarter <= 4;
      return e.quarter >= 5; // OT
    }).length;
  }

  function getTimeoutRemaining(teamId: number): { used: number; max: number; label: string } {
    if (!categoryConfig) return { used: 0, max: 0, label: '' };
    const rules = categoryConfig.timeouts;
    if (quarter <= 2) {
      const used = getTeamTimeouts(teamId, 'first');
      return { used, max: rules.firstHalf, label: '前半' };
    } else if (quarter <= 4) {
      const used = getTeamTimeouts(teamId, 'second');
      return { used, max: rules.secondHalf, label: '後半' };
    } else {
      const used = getTeamTimeouts(teamId, 'overtime');
      return { used, max: rules.overtime, label: 'OT' };
    }
  }

  const myTO = getTimeoutRemaining(game.myTeamId);
  const oppTO = getTimeoutRemaining(game.opponentTeamId);

  async function handleTimeout(teamId: number) {
    const gt = getGameTime();
    await db.statEvents.add({
      gameId, playerId: 0, teamId, quarter,
      action: 'timeout', timestamp: new Date(), gameTime: gt,
    });
    await reloadEvents();
    const teamName = teamId === game?.myTeamId ? (myTeam?.name || '自チーム') : (opponentTeam?.name || '相手');
    showFeedback(`${teamName} タイムアウト [${formatTime(gt)}]`);
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-900 overflow-hidden select-none">
      {/* スコアボード */}
      <div className="bg-gray-800 border-b border-gray-700 px-3 py-1.5">
        {/* 1行目: チーム名 + スコア + チームファール */}
        <div className="flex items-center justify-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-orange-400 truncate max-w-[80px]">
              {myTeam?.name || '自チーム'}
            </span>
            {myTeamQFouls > 0 && (
              <span className={`text-[10px] font-bold px-1 rounded ${myTeamQFouls >= 5 ? 'bg-red-600 text-white' : 'bg-gray-700 text-yellow-400'}`}>
                F{myTeamQFouls}
              </span>
            )}
          </div>
          <span className="text-3xl font-bold tabular-nums text-white">{myScore}</span>
          <span className="text-lg text-gray-500">-</span>
          <span className="text-3xl font-bold tabular-nums text-white">{opponentScore}</span>
          <div className="flex items-center gap-1">
            {oppTeamQFouls > 0 && (
              <span className={`text-[10px] font-bold px-1 rounded ${oppTeamQFouls >= 5 ? 'bg-red-600 text-white' : 'bg-gray-700 text-yellow-400'}`}>
                F{oppTeamQFouls}
              </span>
            )}
            <span className="text-sm font-bold text-blue-400 truncate max-w-[80px]">
              {opponentTeam?.name || '相手'}
            </span>
          </div>
        </div>
        {/* 2行目: Q選択 + タイマー */}
        <div className="flex items-center justify-center gap-1.5 mt-1">
          {QUARTER_LABELS.map((label, i) => (
            <button
              key={label}
              onClick={() => changeQuarter(i + 1)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                quarter === i + 1
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="mx-0.5" />
          {timerRunning ? (
            <button
              onClick={toggleTimer}
              className={`flex items-center gap-1 text-base font-mono font-bold px-2.5 py-1 rounded transition-colors ${
                timerDisplay <= 60 ? 'bg-red-700 text-red-100 animate-pulse' : 'bg-gray-700 text-white'
              }`}
            >
              <span className="tabular-nums">{formatTime(timerDisplay)}</span>
              <span className="text-xs">⏸</span>
            </button>
          ) : (
            <div className="flex items-center gap-0.5">
              <input
                type="number"
                value={editMin || String(Math.floor(timerDisplay / 60))}
                onChange={(e) => setEditMin(e.target.value)}
                onBlur={() => {
                  const m = parseInt(editMin) || 0;
                  const s = Math.floor(timerDisplay % 60);
                  setTimerManual(m, s);
                  setEditMin('');
                }}
                className="w-9 bg-gray-700 text-white text-center text-sm font-mono font-bold rounded px-0.5 py-1 focus:outline-none focus:ring-1 focus:ring-orange-500"
                inputMode="numeric"
                min="0"
              />
              <span className="text-gray-400 text-sm font-bold">:</span>
              <input
                type="number"
                value={editSec || String(Math.floor(timerDisplay % 60)).padStart(2, '0')}
                onChange={(e) => setEditSec(e.target.value)}
                onBlur={() => {
                  const m = Math.floor(timerDisplay / 60);
                  const s = parseInt(editSec) || 0;
                  setTimerManual(m, Math.min(s, 59));
                  setEditSec('');
                }}
                className="w-9 bg-gray-700 text-white text-center text-sm font-mono font-bold rounded px-0.5 py-1 focus:outline-none focus:ring-1 focus:ring-orange-500"
                inputMode="numeric"
                min="0"
                max="59"
              />
              <button
                onClick={toggleTimer}
                disabled={timerDisplay <= 0}
                className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                  timerDisplay > 0
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                ▶
              </button>
            </div>
          )}
          <button onClick={resetTimer} className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs font-bold">
            RST
          </button>
        </div>
        {/* 3行目: 機能ボタン */}
        <div className="flex items-center justify-center gap-2 mt-1">
          <button onClick={() => setShowStats(true)} className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-bold">
            スタッツ
          </button>
          <button onClick={finishGame} className="px-3 py-1 bg-red-600 text-white rounded text-xs font-bold">
            試合終了
          </button>
          <button onClick={() => setShowTimeline(true)} className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-bold">
            タイムライン
          </button>
          <button onClick={suspendGame} className="px-3 py-1 bg-gray-600 text-white rounded text-xs font-bold">
            中断
          </button>
        </div>
        {/* 4行目: タイムアウト残数 */}
        {categoryConfig && (
          <div className="flex items-center justify-between mt-1 px-1">
            <button
              onClick={() => {
                if (myTO.used >= myTO.max) { showFeedback('タイムアウト残り0回です'); return; }
                handleTimeout(game.myTeamId);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                myTO.used < myTO.max
                  ? 'bg-orange-700 text-white active:bg-orange-600'
                  : 'bg-gray-700 text-gray-500'
              }`}
            >
              <span>TO</span>
              <span className="flex gap-0.5">
                {Array.from({ length: myTO.max }).map((_, i) => (
                  <span key={i} className={`w-2 h-2 rounded-full ${i < myTO.max - myTO.used ? 'bg-orange-400' : 'bg-gray-600'}`} />
                ))}
              </span>
              <span className="text-[9px] opacity-70">{myTO.max - myTO.used}/{myTO.max}</span>
            </button>
            <span className="text-[9px] text-gray-500 font-bold">{myTO.label}</span>
            <button
              onClick={() => {
                if (oppTO.used >= oppTO.max) { showFeedback('タイムアウト残り0回です'); return; }
                handleTimeout(game.opponentTeamId);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                oppTO.used < oppTO.max
                  ? 'bg-blue-700 text-white active:bg-blue-600'
                  : 'bg-gray-700 text-gray-500'
              }`}
            >
              <span className="text-[9px] opacity-70">{oppTO.max - oppTO.used}/{oppTO.max}</span>
              <span className="flex gap-0.5">
                {Array.from({ length: oppTO.max }).map((_, i) => (
                  <span key={i} className={`w-2 h-2 rounded-full ${i < oppTO.max - oppTO.used ? 'bg-blue-400' : 'bg-gray-600'}`} />
                ))}
              </span>
              <span>TO</span>
            </button>
          </div>
        )}
      </div>

      {/* 選択中の選手 + フィードバック */}
      <div
        className={`px-2 py-1 text-center text-xs font-bold transition-colors ${
          feedbackMessage
            ? 'bg-green-700 text-white animate-pulse'
            : hasSelection
              ? isMyTeamSelected ? 'bg-orange-600 text-white' : 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-500'
        }`}
      >
        {feedbackMessage
          ? feedbackMessage
          : hasSelection
            ? `#${selectedPlayer?.number} ${selectedPlayer?.name}`
            : '↓ 選手をタップ'}
      </div>

      {/* 選手リスト + コート図 */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* 選手リスト（左右分割） */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="flex-1 border-r border-gray-700 overflow-y-auto">
            <div className="px-0.5 py-0.5">
              <h3 className="text-center text-[10px] text-orange-400 font-bold sticky top-0 bg-gray-900 py-0.5 z-10">
                {myTeam?.name}
              </h3>
              <div className="space-y-px">
                {myPlayers.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    teamId={game.myTeamId}
                    isSelected={selectedPlayerId === player.id && selectedSide === 'my'}
                    isOnCourt={onCourtIds.has(player.id!)}
                    pts={calcTeamScore(events.filter((e) => e.playerId === player.id))}
                    fouls={getPlayerFouls(player.id!)}
                    teamColor="orange"
                    onSelect={() => {
                      if (selectedPlayerId === player.id && selectedSide === 'my') {
                        clearSelection(); setSelectedSide(null);
                      } else {
                        selectPlayer(player.id!, game.myTeamId); setSelectedSide('my');
                      }
                    }}
                    onToggleCourt={() => toggleOnCourt(player.id!, game.myTeamId)}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="px-0.5 py-0.5">
              <h3 className="text-center text-[10px] text-blue-400 font-bold sticky top-0 bg-gray-900 py-0.5 z-10">
                {opponentTeam?.name}
              </h3>
              <div className="space-y-px">
                {opponentPlayers.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    teamId={game.opponentTeamId}
                    isSelected={selectedPlayerId === player.id && selectedSide === 'opp'}
                    isOnCourt={onCourtIds.has(player.id!)}
                    pts={calcTeamScore(events.filter((e) => e.playerId === player.id))}
                    fouls={getPlayerFouls(player.id!)}
                    teamColor="blue"
                    onSelect={() => {
                      if (selectedPlayerId === player.id && selectedSide === 'opp') {
                        clearSelection(); setSelectedSide(null);
                      } else {
                        selectPlayer(player.id!, game.opponentTeamId); setSelectedSide('opp');
                      }
                    }}
                    onToggleCourt={() => toggleOnCourt(player.id!, game.opponentTeamId)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* コート図（シュートゾーン選択） */}
        <div className="flex-shrink-0 border-t border-gray-700 relative">
          <div className="flex justify-center px-2 py-1">
            <svg viewBox="0 0 300 280" className="w-full max-w-[340px]" style={{ maxHeight: '28vh' }}>
              {/* コート背景 */}
              <rect x="0" y="0" width="300" height="280" fill="#1a472a" rx="3" />
              {/* コート外枠 */}
              <rect x="4" y="4" width="292" height="272" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
              {/* バックボード */}
              <line x1="132" y1="16" x2="168" y2="16" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
              {/* リム */}
              <circle cx="150" cy="24" r="7" fill="none" stroke="#f97316" strokeWidth="1.5" />
              <line x1="150" y1="17" x2="150" y2="16" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
              {/* 制限エリア */}
              <path d="M 132 4 L 132 28 A 18 18 0 0 0 168 28 L 168 4" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              {/* ペイントエリア */}
              <rect x="88" y="4" width="124" height="100" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              {/* レーンマーク */}
              {[30, 45, 60, 75].map(y => (
                <g key={y}>
                  <line x1="84" y1={y} x2="91" y2={y} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                  <line x1="209" y1={y} x2="216" y2={y} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                </g>
              ))}
              {/* フリースローライン */}
              <line x1="88" y1="104" x2="212" y2="104" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              {/* フリースロー半円（下方向=バスケットから離れる） */}
              <path d="M 118 104 A 32 32 0 0 1 182 104" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              {/* フリースロー半円（上方向=ペイント内、破線） */}
              <path d="M 118 104 A 32 32 0 0 0 182 104" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="4,4" />
              {/* 3ポイントライン */}
              <path d="M 32 4 L 32 58 C 32 195, 268 195, 268 58 L 268 4" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              {/* センターサークル（ハーフコートライン） */}
              <line x1="4" y1="276" x2="296" y2="276" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <circle cx="150" cy="276" r="28" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />

              {/* クリック可能なゾーンオーバーレイ */}
              {COURT_ZONES.map((zone) => {
                const zoneStats = selectedPlayerId ? getZoneStatsForPlayer(selectedPlayerId) : {};
                const st = zoneStats[zone.id];
                const isActive = hasSelection;
                const isSelected = selectedZone === zone.id;
                return (
                  <g key={zone.id} onClick={() => isActive && handleZoneTap(zone.id)} style={{ cursor: isActive ? 'pointer' : 'default' }}>
                    <polygon
                      points={zone.points}
                      fill={isSelected ? 'rgba(255,255,255,0.35)' : isActive ? 'rgba(255,255,255,0.06)' : 'transparent'}
                      stroke={isActive ? 'rgba(255,255,255,0.2)' : 'transparent'}
                      strokeWidth="0.5"
                    />
                    <text
                      x={zone.labelX} y={zone.labelY - (st ? 6 : 0)}
                      textAnchor="middle" dominantBaseline="central"
                      fill={isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)'}
                      fontSize="9" fontWeight="bold"
                    >
                      {zone.label}{zone.is3pt ? ' 3P' : ' 2P'}
                    </text>
                    {st && st.attempts > 0 && (
                      <text
                        x={zone.labelX} y={zone.labelY + 10}
                        textAnchor="middle" dominantBaseline="central"
                        fill={st.makes / st.attempts >= 0.5 ? '#4ade80' : '#f87171'}
                        fontSize="10" fontWeight="bold"
                      >
                        {st.makes}/{st.attempts}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* 成功/失敗 選択オーバーレイ */}
          {selectedZone && (() => {
            const zoneInfo = SHOT_ZONE_INFO[selectedZone];
            return (
              <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center gap-2">
                <p className="text-white text-sm font-bold">
                  {zoneInfo.label}（{zoneInfo.is3pt ? '3P' : '2P'}）
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => handleCourtShot(true)}
                    className="px-8 py-3 bg-green-600 active:bg-green-700 text-white font-bold rounded-xl text-lg transition-colors"
                  >
                    成功
                  </button>
                  <button
                    onClick={() => handleCourtShot(false)}
                    className="px-8 py-3 bg-red-600 active:bg-red-700 text-white font-bold rounded-xl text-lg transition-colors"
                  >
                    失敗
                  </button>
                </div>
                <button
                  onClick={() => setSelectedZone(null)}
                  className="text-gray-400 text-xs mt-1"
                >
                  キャンセル
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* アクションボタン: 6列 x 2行 */}
      <div className="bg-gray-800 border-t border-gray-700 px-1 py-1 space-y-1">
        <div className="grid grid-cols-6 gap-1">
          {STAT_ROW1.map((btn) => (
            <button
              key={btn.action}
              onClick={() => handleAction(btn.action)}
              disabled={!hasSelection}
              className={`py-2.5 text-sm font-bold rounded-lg transition-colors active:scale-95 ${
                btn.category === 'shoot'
                  ? hasSelection
                    ? 'bg-green-600 text-white'
                    : 'bg-green-900 text-green-700 cursor-not-allowed'
                  : hasSelection
                    ? 'bg-sky-600 text-white'
                    : 'bg-sky-900 text-sky-700 cursor-not-allowed'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-1">
          {STAT_ROW2.map((btn) => (
            <button
              key={btn.action}
              onClick={() => handleAction(btn.action)}
              disabled={!hasSelection}
              className={`py-2.5 text-sm font-bold rounded-lg transition-colors active:scale-95 ${
                btn.category === 'shoot'
                  ? hasSelection
                    ? 'bg-gray-600 text-gray-100'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : hasSelection
                    ? 'bg-sky-700 text-white'
                    : 'bg-sky-950 text-sky-800 cursor-not-allowed'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
        {/* 戻す・交代 */}
        <div className="flex gap-1">
          <button
            onClick={handleUndo}
            className="flex-1 py-2 text-sm bg-yellow-700 text-white font-bold rounded-lg transition-colors active:scale-95"
          >
            戻す
          </button>
          <button
            onClick={() => setShowMemberChange(true)}
            className="flex-1 py-2 text-sm bg-teal-700 text-white font-bold rounded-lg transition-colors"
          >
            メンバーチェンジ
          </button>
        </div>
      </div>

      {/* スタッツ確認パネル */}
      {showStats && (
        <StatsPanel
          myTeam={myTeam}
          opponentTeam={opponentTeam}
          myPlayerStats={getPlayerStatsForTeam(game.myTeamId, myPlayers)}
          oppPlayerStats={getPlayerStatsForTeam(game.opponentTeamId, opponentPlayers)}
          statsTab={statsTab}
          setStatsTab={setStatsTab}
          onClose={() => setShowStats(false)}
        />
      )}

      {/* タイムラインパネル */}
      {showTimeline && (
        <TimelinePanel
          events={events}
          myPlayers={myPlayers}
          opponentPlayers={opponentPlayers}
          myTeamId={game.myTeamId}
          myTeamName={myTeam?.name || '自チーム'}
          oppTeamName={opponentTeam?.name || '相手'}
          onUpdate={async (eventId, newAction) => {
            await db.statEvents.update(eventId, { action: newAction });
            await reloadEvents();
          }}
          onDelete={async (eventId) => {
            await db.statEvents.delete(eventId);
            await reloadEvents();
          }}
          onClose={() => setShowTimeline(false)}
        />
      )}

      {/* メンバーチェンジパネル */}
      {showMemberChange && (
        <MemberChangePanel
          myTeam={myTeam}
          opponentTeam={opponentTeam}
          myPlayers={myPlayers}
          opponentPlayers={opponentPlayers}
          myTeamId={game.myTeamId}
          opponentTeamId={game.opponentTeamId}
          memberTab={memberTab}
          setMemberTab={setMemberTab}
          onAddPlayer={handleAddPlayer}
          onClose={() => setShowMemberChange(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// PlayerRow
// ============================================================
function PlayerRow({
  player,
  isSelected,
  isOnCourt,
  pts,
  fouls,
  teamColor,
  onSelect,
  onToggleCourt,
}: {
  player: Player;
  teamId: number;
  isSelected: boolean;
  isOnCourt: boolean;
  pts: number;
  fouls: number;
  teamColor: 'orange' | 'blue';
  onSelect: () => void;
  onToggleCourt: () => void;
}) {
  const selectedBg = teamColor === 'orange' ? 'bg-orange-500 ring-orange-300' : 'bg-blue-500 ring-blue-300';

  return (
    <div className="flex items-center gap-px">
      <button
        onClick={(e) => { e.stopPropagation(); onToggleCourt(); }}
        className={`w-4 h-4 rounded-full flex-shrink-0 border-2 transition-colors ${
          isOnCourt ? 'bg-green-500 border-green-400' : 'bg-gray-700 border-gray-600'
        }`}
        title={isOnCourt ? 'ベンチへ' : 'コートイン'}
      />
      <button
        onClick={onSelect}
        className={`flex-1 text-left px-1.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center min-w-0 ${
          isSelected ? `${selectedBg} text-white ring-2` : 'bg-gray-800 text-gray-200 active:bg-gray-600'
        }`}
      >
        <span className="truncate flex-1 min-w-0">
          <span className="font-mono font-bold mr-0.5 text-[10px]">#{player.number}</span>
          <span className="text-[11px]">{player.name}</span>
        </span>
        <span className="flex items-center gap-1 flex-shrink-0 ml-0.5">
          {pts > 0 && (
            <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
              {pts}p
            </span>
          )}
          {fouls > 0 && (
            <span className={`text-[10px] font-bold px-1 rounded ${
              fouls >= 5 ? 'bg-red-600 text-white' : fouls >= 4 ? 'bg-yellow-600 text-white' : isSelected ? 'text-white/70' : 'text-red-400'
            }`}>
              F{fouls}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

// ============================================================
// MemberChangePanel（メンバーチェンジモーダル）
// ============================================================
function MemberChangePanel({
  myTeam,
  opponentTeam,
  myPlayers,
  opponentPlayers,
  myTeamId,
  opponentTeamId,
  memberTab,
  setMemberTab,
  onAddPlayer,
  onClose,
}: {
  myTeam: Team | null;
  opponentTeam: Team | null;
  myPlayers: Player[];
  opponentPlayers: Player[];
  myTeamId: number;
  opponentTeamId: number;
  memberTab: 'my' | 'opp';
  setMemberTab: (tab: 'my' | 'opp') => void;
  onAddPlayer: (teamId: number, number: number, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [newNumber, setNewNumber] = useState('');
  const [newName, setNewName] = useState('');
  const [addMessage, setAddMessage] = useState('');

  const teamId = memberTab === 'my' ? myTeamId : opponentTeamId;
  const players = memberTab === 'my' ? myPlayers : opponentPlayers;

  async function handleAdd() {
    const num = parseInt(newNumber);
    if (isNaN(num)) {
      setAddMessage('背番号を入力してください');
      setTimeout(() => setAddMessage(''), 2000);
      return;
    }

    // 同じ背番号が既に登録済みかチェック
    const exists = players.some((p) => p.number === num);
    if (exists) {
      setAddMessage(`#${num} は既に登録されています`);
      setTimeout(() => setAddMessage(''), 2000);
      return;
    }

    const name = newName.trim() || `選手${num}`;
    await onAddPlayer(teamId, num, name);
    setNewNumber('');
    setNewName('');
    setAddMessage(`#${num} ${name} を追加しました`);
    setTimeout(() => setAddMessage(''), 2000);
  }

  // タブ切替時にフォームをリセット
  function switchTab(tab: 'my' | 'opp') {
    setMemberTab(tab);
    setNewNumber('');
    setNewName('');
    setAddMessage('');
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <h2 className="text-base font-bold text-white">メンバーチェンジ</h2>
        <button
          onClick={onClose}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded transition-colors"
        >
          閉じる
        </button>
      </div>

      {/* タブ */}
      <div className="flex bg-gray-800 border-b border-gray-700">
        <button
          onClick={() => switchTab('my')}
          className={`flex-1 py-2 text-sm font-bold text-center transition-colors ${
            memberTab === 'my'
              ? 'text-orange-400 border-b-2 border-orange-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {myTeam?.name || '自チーム'}
        </button>
        <button
          onClick={() => switchTab('opp')}
          className={`flex-1 py-2 text-sm font-bold text-center transition-colors ${
            memberTab === 'opp'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {opponentTeam?.name || '相手チーム'}
        </button>
      </div>

      {/* 選手追加フォーム */}
      <div className="bg-gray-800 px-4 py-3 border-b border-gray-700">
        <p className="text-xs text-gray-400 mb-2">新しい選手を追加（名前は省略可）</p>
        <div className="flex gap-2">
          <input
            type="number"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            placeholder="背番号"
            className="w-20 bg-gray-700 text-white rounded-lg px-3 py-2 text-center text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            inputMode="numeric"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="名前（任意）"
            className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-lg transition-colors whitespace-nowrap"
          >
            追加
          </button>
        </div>
        {addMessage && (
          <p className="text-xs text-green-400 mt-1.5 font-bold">{addMessage}</p>
        )}
      </div>

      {/* 登録済みメンバー一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="text-xs text-gray-400 mb-2">
          登録済みメンバー（{players.length}人）
        </p>
        <div className="space-y-1">
          {players.map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2"
            >
              <span className="text-sm text-white">
                <span className="font-mono font-bold text-gray-400 mr-2">
                  #{player.number}
                </span>
                {player.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// StatsPanel
// ============================================================
function StatsPanel({
  myTeam,
  opponentTeam,
  myPlayerStats,
  oppPlayerStats,
  statsTab,
  setStatsTab,
  onClose,
}: {
  myTeam: Team | null;
  opponentTeam: Team | null;
  myPlayerStats: { player: Player; stats: ReturnType<typeof calcPlayerStats> }[];
  oppPlayerStats: { player: Player; stats: ReturnType<typeof calcPlayerStats> }[];
  statsTab: 'my' | 'opp';
  setStatsTab: (tab: 'my' | 'opp') => void;
  onClose: () => void;
}) {
  const data = statsTab === 'my' ? myPlayerStats : oppPlayerStats;

  const totals = data.reduce(
    (acc, { stats }) => {
      acc.pts += stats.pts; acc.fg += stats.fg; acc.fga += stats.fga;
      acc.tp += stats.tp; acc.tpa += stats.tpa; acc.ft += stats.ft; acc.fta += stats.fta;
      acc.reb += stats.reb; acc.ast += stats.ast; acc.stl += stats.stl;
      acc.blk += stats.blk; acc.to += stats.to; acc.foul += stats.foul;
      return acc;
    },
    { pts: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, foul: 0 }
  );

  function fgStr(made: number, att: number) {
    if (att === 0) return '-';
    return `${made}/${att}`;
  }

  const maxPts = Math.max(...data.map((d) => d.stats.pts), 0);
  const maxReb = Math.max(...data.map((d) => d.stats.reb), 0);
  const maxAst = Math.max(...data.map((d) => d.stats.ast), 0);

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex flex-col">
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <h2 className="text-base font-bold text-white">試合中スタッツ</h2>
        <button onClick={onClose} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded transition-colors">
          閉じる
        </button>
      </div>
      <div className="flex bg-gray-800 border-b border-gray-700">
        <button
          onClick={() => setStatsTab('my')}
          className={`flex-1 py-2 text-sm font-bold text-center transition-colors ${
            statsTab === 'my' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {myTeam?.name || '自チーム'}
        </button>
        <button
          onClick={() => setStatsTab('opp')}
          className={`flex-1 py-2 text-sm font-bold text-center transition-colors ${
            statsTab === 'opp' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {opponentTeam?.name || '相手チーム'}
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs text-white">
          <thead className="sticky top-0 bg-gray-800 z-10">
            <tr className="border-b border-gray-700">
              <th className="text-left px-2 py-2 font-bold text-gray-300 sticky left-0 bg-gray-800 z-20 min-w-[80px]">選手</th>
              {STAT_COLUMNS.map((col) => (
                <th key={col.key} className="px-1.5 py-2 font-bold text-gray-300 text-center min-w-[36px]">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(({ player, stats }) => (
              <tr key={player.id} className="border-b border-gray-800 hover:bg-gray-800/60">
                <td className="px-2 py-1.5 font-medium sticky left-0 bg-gray-900 z-10 whitespace-nowrap">
                  <span className="font-mono text-gray-400 mr-1">#{player.number}</span>
                  {player.name}
                </td>
                <td className={`px-1.5 py-1.5 text-center font-bold ${stats.pts > 0 && stats.pts === maxPts ? 'text-yellow-400' : ''}`}>{stats.pts}</td>
                <td className="px-1.5 py-1.5 text-center tabular-nums">{fgStr(stats.fg, stats.fga)}</td>
                <td className="px-1.5 py-1.5 text-center tabular-nums">{fgStr(stats.tp, stats.tpa)}</td>
                <td className="px-1.5 py-1.5 text-center tabular-nums">{fgStr(stats.ft, stats.fta)}</td>
                <td className={`px-1.5 py-1.5 text-center ${stats.reb > 0 && stats.reb === maxReb ? 'text-yellow-400 font-bold' : ''}`}>{stats.reb}</td>
                <td className={`px-1.5 py-1.5 text-center ${stats.ast > 0 && stats.ast === maxAst ? 'text-yellow-400 font-bold' : ''}`}>{stats.ast}</td>
                <td className="px-1.5 py-1.5 text-center">{stats.stl}</td>
                <td className="px-1.5 py-1.5 text-center">{stats.blk}</td>
                <td className="px-1.5 py-1.5 text-center">{stats.to}</td>
                <td className="px-1.5 py-1.5 text-center">{stats.foul}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-600 bg-gray-800 font-bold">
              <td className="px-2 py-1.5 sticky left-0 bg-gray-800 z-10">TOTAL</td>
              <td className="px-1.5 py-1.5 text-center">{totals.pts}</td>
              <td className="px-1.5 py-1.5 text-center tabular-nums">{fgStr(totals.fg, totals.fga)}</td>
              <td className="px-1.5 py-1.5 text-center tabular-nums">{fgStr(totals.tp, totals.tpa)}</td>
              <td className="px-1.5 py-1.5 text-center tabular-nums">{fgStr(totals.ft, totals.fta)}</td>
              <td className="px-1.5 py-1.5 text-center">{totals.reb}</td>
              <td className="px-1.5 py-1.5 text-center">{totals.ast}</td>
              <td className="px-1.5 py-1.5 text-center">{totals.stl}</td>
              <td className="px-1.5 py-1.5 text-center">{totals.blk}</td>
              <td className="px-1.5 py-1.5 text-center">{totals.to}</td>
              <td className="px-1.5 py-1.5 text-center">{totals.foul}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// TimelinePanel（タイムライン表示 + 修正・削除）
// ============================================================
const ACTION_LABEL_MAP: Record<StatAction, string> = {
  pts2: '2P', pts3: '3P', ft: 'FT',
  miss2: 'ミス2P', miss3: 'ミス3P', missFt: 'ミスFT',
  reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK',
  to: 'TO', foul: 'FOUL', subIn: 'IN', subOut: 'OUT',
  timeout: 'TO(タイムアウト)',
};

// 修正時に選べるアクション（subIn/subOut は除外）
const EDITABLE_ACTIONS: StatAction[] = [
  'pts2', 'pts3', 'ft', 'miss2', 'miss3', 'missFt',
  'reb', 'ast', 'stl', 'blk', 'to', 'foul',
];

function TimelinePanel({
  events,
  myPlayers,
  opponentPlayers,
  myTeamId,
  myTeamName,
  oppTeamName,
  onUpdate,
  onDelete,
  onClose,
}: {
  events: StatEvent[];
  myPlayers: Player[];
  opponentPlayers: Player[];
  myTeamId: number;
  myTeamName: string;
  oppTeamName: string;
  onUpdate: (eventId: number, newAction: StatAction) => Promise<void>;
  onDelete: (eventId: number) => Promise<void>;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);

  const allPlayers = [...myPlayers, ...opponentPlayers];
  function findPlayer(playerId: number) {
    return allPlayers.find((p) => p.id === playerId);
  }

  // subIn/subOut を除外し、新しい順に並べる
  const filtered = events
    .filter((e) => e.action !== 'subIn' && e.action !== 'subOut')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  function getActionColor(action: StatAction): string {
    if (['pts2', 'pts3', 'ft'].includes(action)) return 'text-green-400';
    if (['miss2', 'miss3', 'missFt'].includes(action)) return 'text-gray-400';
    if (action === 'timeout') return 'text-yellow-400';
    return 'text-sky-400';
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <h2 className="text-base font-bold text-white">タイムライン</h2>
        <button
          onClick={onClose}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded transition-colors"
        >
          閉じる
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">記録がありません</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((ev) => {
            const player = findPlayer(ev.playerId);
            const isMyTeam = ev.teamId === myTeamId;
            const isEditing = editingId === ev.id;

            return (
              <div key={ev.id}>
                <button
                  onClick={() => setEditingId(isEditing ? null : ev.id!)}
                  className={`w-full text-left px-4 py-2.5 border-b border-gray-800 transition-colors ${
                    isEditing ? 'bg-gray-700' : 'bg-gray-900 active:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* クォーター */}
                    <span className="text-[10px] font-bold text-gray-500 w-6 text-center">
                      Q{ev.quarter}
                    </span>
                    {/* ゲームタイム */}
                    <span className="text-xs font-mono text-gray-500 w-12 text-center">
                      {ev.gameTime != null ? formatTime(ev.gameTime) : '--:--'}
                    </span>
                    {/* チーム色 */}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isMyTeam ? 'bg-orange-600/30 text-orange-400' : 'bg-blue-600/30 text-blue-400'
                    }`}>
                      {isMyTeam ? myTeamName : oppTeamName}
                    </span>
                    {/* 選手 */}
                    <span className="text-sm text-white truncate flex-1">
                      {ev.action === 'timeout' ? (
                        <span className="text-yellow-400">タイムアウト</span>
                      ) : (
                        <>
                          <span className="font-mono text-gray-400 mr-1">#{player?.number}</span>
                          {player?.name}
                        </>
                      )}
                    </span>
                    {/* アクション + ゾーン */}
                    <span className="flex items-center gap-1">
                      {ev.zone && (
                        <span className="text-[9px] text-gray-500">
                          {SHOT_ZONE_INFO[ev.zone as ShotZone]?.label || ev.zone}
                        </span>
                      )}
                      <span className={`text-sm font-bold ${getActionColor(ev.action)}`}>
                        {ACTION_LABEL_MAP[ev.action] || ev.action}
                      </span>
                    </span>
                  </div>
                </button>

                {/* 編集パネル */}
                {isEditing && (
                  <div className="bg-gray-800 px-4 py-3 border-b border-gray-700">
                    {ev.action !== 'timeout' && (
                      <>
                        <p className="text-xs text-gray-400 mb-2">変更先のアクションを選択：</p>
                        <div className="grid grid-cols-6 gap-1.5 mb-3">
                          {EDITABLE_ACTIONS.map((act) => (
                            <button
                              key={act}
                              onClick={async () => {
                                if (act !== ev.action) {
                                  await onUpdate(ev.id!, act);
                                }
                                setEditingId(null);
                              }}
                              className={`py-2 text-xs font-bold rounded transition-colors ${
                                act === ev.action
                                  ? 'bg-white text-gray-900 ring-2 ring-white'
                                  : ['pts2', 'pts3', 'ft'].includes(act)
                                    ? 'bg-green-700 text-white'
                                    : ['miss2', 'miss3', 'missFt'].includes(act)
                                      ? 'bg-gray-600 text-gray-200'
                                      : 'bg-sky-700 text-white'
                              }`}
                            >
                              {ACTION_LABEL_MAP[act]}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <button
                      onClick={async () => {
                        if (confirm('この記録を削除しますか？')) {
                          await onDelete(ev.id!);
                          setEditingId(null);
                        }
                      }}
                      className="w-full py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-bold rounded transition-colors"
                    >
                      この記録を削除
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
