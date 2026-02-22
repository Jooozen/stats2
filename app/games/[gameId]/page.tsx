'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db, type Game, type Team, type Player, type StatEvent, type StatAction } from '@/lib/db';
import { calcTeamScore, calcPlayerStats } from '@/lib/stats';
import { useGameStore } from '@/lib/store';

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4', 'OT'];

interface ActionButton {
  action: StatAction;
  label: string;
  group: 'score' | 'stat' | 'miss';
}

const ACTION_BUTTONS: ActionButton[] = [
  { action: 'pts2', label: '2P', group: 'score' },
  { action: 'pts3', label: '3P', group: 'score' },
  { action: 'ft', label: 'FT', group: 'score' },
  { action: 'reb', label: 'REB', group: 'stat' },
  { action: 'ast', label: 'AST', group: 'stat' },
  { action: 'stl', label: 'STL', group: 'stat' },
  { action: 'blk', label: 'BLK', group: 'stat' },
  { action: 'to', label: 'TO', group: 'stat' },
  { action: 'foul', label: 'FOUL', group: 'stat' },
  { action: 'miss2', label: 'ミス(2P)', group: 'miss' },
  { action: 'miss3', label: 'ミス(3P)', group: 'miss' },
  { action: 'missFt', label: 'ミス(FT)', group: 'miss' },
];

// ---------- タイマー用ユーティリティ ----------
function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ---------- スタッツテーブルの列定義 ----------
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

  // --- 基本データ ---
  const [game, setGame] = useState<Game | null>(null);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [opponentTeam, setOpponentTeam] = useState<Team | null>(null);
  const [myPlayers, setMyPlayers] = useState<Player[]>([]);
  const [opponentPlayers, setOpponentPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<StatEvent[]>([]);
  const [quarter, setQuarter] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  // --- タイマー ---
  const [timerDisplay, setTimerDisplay] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const accumulatedRef = useRef(0);
  const startTimeRef = useRef(0);

  // --- 出場管理 ---
  const [onCourtIds, setOnCourtIds] = useState<Set<number>>(new Set());

  // --- スタッツパネル ---
  const [showStats, setShowStats] = useState(false);
  const [statsTab, setStatsTab] = useState<'my' | 'opp'>('my');

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

      // タイマー復元
      const saved = g.timerSeconds || 0;
      if (g.timerRunning && g.timerStartedAt) {
        const elapsed = (Date.now() - g.timerStartedAt) / 1000;
        accumulatedRef.current = saved + elapsed;
        startTimeRef.current = Date.now();
        setTimerRunning(true);
        setTimerDisplay(accumulatedRef.current);
      } else {
        accumulatedRef.current = saved;
        setTimerDisplay(saved);
      }

      // 出場選手復元
      if (g.onCourtPlayerIds) {
        setOnCourtIds(new Set(g.onCourtPlayerIds));
      }

      const mt = await db.teams.get(g.myTeamId);
      const ot = await db.teams.get(g.opponentTeamId);
      setMyTeam(mt || null);
      setOpponentTeam(ot || null);

      const mp = await db.players.where('teamId').equals(g.myTeamId).toArray();
      const op = await db.players.where('teamId').equals(g.opponentTeamId).toArray();
      setMyPlayers(mp.sort((a, b) => a.number - b.number));
      setOpponentPlayers(op.sort((a, b) => a.number - b.number));

      const ev = await db.statEvents.where('gameId').equals(gameId).toArray();
      setEvents(ev);
    } catch {
      // DB not ready
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  // ---------- タイマー更新ループ ----------
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setTimerDisplay(
        accumulatedRef.current + (Date.now() - startTimeRef.current) / 1000
      );
    }, 200);
    return () => clearInterval(interval);
  }, [timerRunning]);

  // ---------- タイマー操作 ----------
  function getGameTime(): number {
    if (timerRunning) {
      return Math.floor(
        accumulatedRef.current + (Date.now() - startTimeRef.current) / 1000
      );
    }
    return Math.floor(accumulatedRef.current);
  }

  async function toggleTimer() {
    if (timerRunning) {
      // 一時停止
      accumulatedRef.current += (Date.now() - startTimeRef.current) / 1000;
      setTimerDisplay(accumulatedRef.current);
      setTimerRunning(false);
      if (game?.id) {
        await db.games.update(game.id, {
          timerSeconds: accumulatedRef.current,
          timerRunning: false,
          timerStartedAt: undefined,
        });
      }
    } else {
      // 開始
      startTimeRef.current = Date.now();
      setTimerRunning(true);
      if (game?.id) {
        await db.games.update(game.id, {
          timerRunning: true,
          timerStartedAt: Date.now(),
          timerSeconds: accumulatedRef.current,
        });
      }
    }
  }

  async function resetTimer() {
    accumulatedRef.current = 0;
    setTimerDisplay(0);
    setTimerRunning(false);
    if (game?.id) {
      await db.games.update(game.id, {
        timerSeconds: 0,
        timerRunning: false,
        timerStartedAt: undefined,
      });
    }
  }

  // ---------- スコア算出 ----------
  const myScore = calcTeamScore(
    events.filter((e) => game && e.teamId === game.myTeamId)
  );
  const opponentScore = calcTeamScore(
    events.filter((e) => game && e.teamId === game.opponentTeamId)
  );

  // 選択中の選手情報
  const selectedPlayer = selectedPlayerId
    ? [...myPlayers, ...opponentPlayers].find((p) => p.id === selectedPlayerId)
    : null;
  const isMyTeamSelected =
    selectedTeamId !== null && game !== null && selectedTeamId === game.myTeamId;

  // ---------- イベント再読み込み ----------
  async function reloadEvents() {
    const ev = await db.statEvents.where('gameId').equals(gameId).toArray();
    setEvents(ev);
  }

  // ---------- アクション記録 ----------
  async function handleAction(action: StatAction) {
    if (!selectedPlayerId || !selectedTeamId) {
      showFeedback('選手を選択してください');
      return;
    }
    const gt = getGameTime();
    await recordStat(gameId, quarter, action, gt);
    await reloadEvents();

    const btn = ACTION_BUTTONS.find((b) => b.action === action);
    showFeedback(
      `#${selectedPlayer?.number} ${selectedPlayer?.name} → ${btn?.label}  [${formatTime(gt)}]`
    );
  }

  // ---------- 取り消し ----------
  async function handleUndo() {
    if (!lastEvent) {
      showFeedback('取り消す記録がありません');
      return;
    }
    const p = [...myPlayers, ...opponentPlayers].find(
      (pl) => pl.id === lastEvent.playerId
    );
    const btn = ACTION_BUTTONS.find((b) => b.action === lastEvent.action);
    await undoLast();
    await reloadEvents();
    showFeedback(`↩ #${p?.number} ${p?.name} ${btn?.label || lastEvent.action} を取消`);
  }

  // ---------- クォーター変更 ----------
  async function changeQuarter(q: number) {
    setQuarter(q);
    if (game?.id) {
      await db.games.update(game.id, { currentQuarter: q });
    }
  }

  // ---------- 試合終了 ----------
  async function finishGame() {
    if (!confirm('試合を終了しますか？')) return;
    if (game?.id) {
      // タイマー停止
      if (timerRunning) {
        accumulatedRef.current += (Date.now() - startTimeRef.current) / 1000;
        setTimerRunning(false);
      }
      await db.games.update(game.id, {
        status: 'finished' as const,
        timerRunning: false,
        timerSeconds: accumulatedRef.current,
      });
      router.push(`/games/${game.id}/summary`);
    }
  }

  // ---------- 出場管理（ON/OFF切替） ----------
  async function toggleOnCourt(playerId: number, teamId: number) {
    const gt = getGameTime();
    const next = new Set(onCourtIds);
    if (next.has(playerId)) {
      next.delete(playerId);
      // subOut イベント記録
      await db.statEvents.add({
        gameId,
        playerId,
        teamId,
        quarter,
        action: 'subOut',
        timestamp: new Date(),
        gameTime: gt,
      });
    } else {
      next.add(playerId);
      // subIn イベント記録
      await db.statEvents.add({
        gameId,
        playerId,
        teamId,
        quarter,
        action: 'subIn',
        timestamp: new Date(),
        gameTime: gt,
      });
    }
    setOnCourtIds(next);
    // DB に永続化
    if (game?.id) {
      await db.games.update(game.id, {
        onCourtPlayerIds: Array.from(next),
      });
    }
    await reloadEvents();
  }

  // ---------- フィードバック ----------
  function showFeedback(msg: string) {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(''), 2000);
  }

  // ---------- スタッツ計算（パネル用） ----------
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

  // ---------- ローディング / エラー ----------
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

  return (
    <div className="h-screen flex flex-col bg-gray-900 overflow-hidden select-none">
      {/* ======== スコアボード ======== */}
      <div className="bg-gray-800 border-b border-gray-700 px-3 py-2">
        {/* スコア行 */}
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex-1 text-right pr-2">
            <span className="text-sm font-bold text-orange-400 truncate block">
              {myTeam?.name || '自チーム'}
            </span>
          </div>
          <div className="text-center flex items-center gap-2">
            <span className="text-3xl font-bold tabular-nums text-white">
              {myScore}
            </span>
            <span className="text-lg text-gray-500">-</span>
            <span className="text-3xl font-bold tabular-nums text-white">
              {opponentScore}
            </span>
          </div>
          <div className="flex-1 text-left pl-2">
            <span className="text-sm font-bold text-blue-400 truncate block">
              {opponentTeam?.name || '相手'}
            </span>
          </div>
          {/* クォーター & タイマー */}
          <div className="flex items-center gap-1.5 ml-2">
            <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded">
              {QUARTER_LABELS[quarter - 1]}
            </span>
            <button
              onClick={toggleTimer}
              className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-mono font-bold px-2 py-0.5 rounded transition-colors"
            >
              <span className="tabular-nums">{formatTime(timerDisplay)}</span>
              <span className="text-xs">{timerRunning ? '⏸' : '▶'}</span>
            </button>
          </div>
        </div>

        {/* クォーター切替 & ユーティリティ */}
        <div className="flex items-center justify-center gap-1 mt-1.5">
          {QUARTER_LABELS.map((label, i) => (
            <button
              key={label}
              onClick={() => changeQuarter(i + 1)}
              className={`px-2.5 py-0.5 rounded text-xs font-bold transition-colors ${
                quarter === i + 1
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={resetTimer}
            className="ml-1 px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs font-bold transition-colors"
            title="タイマーリセット"
          >
            リセット
          </button>
          <button
            onClick={() => setShowStats(true)}
            className="ml-1 px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition-colors"
          >
            スタッツ
          </button>
          <button
            onClick={finishGame}
            className="ml-1 px-2.5 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition-colors"
          >
            試合終了
          </button>
        </div>
      </div>

      {/* ======== 選択中の選手インジケーター ======== */}
      <div
        className={`px-3 py-1.5 text-center text-sm font-bold transition-colors ${
          hasSelection
            ? isMyTeamSelected
              ? 'bg-orange-600 text-white'
              : 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-500'
        }`}
      >
        {hasSelection
          ? `選択中: #${selectedPlayer?.number} ${selectedPlayer?.name}`
          : '↓ 選手をタップして選択'}
      </div>

      {/* ======== フィードバック ======== */}
      {feedbackMessage && (
        <div className="bg-green-700 text-white text-center py-1 text-sm font-bold animate-pulse">
          {feedbackMessage}
        </div>
      )}

      {/* ======== 選手リスト（左右分割） ======== */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* 自チーム */}
        <div className="flex-1 border-r border-gray-700 overflow-y-auto">
          <div className="p-1">
            <h3 className="text-center text-xs text-orange-400 font-bold mb-1 sticky top-0 bg-gray-900 py-0.5 z-10">
              {myTeam?.name}
            </h3>
            <div className="space-y-0.5">
              {myPlayers.map((player) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  teamId={game.myTeamId}
                  isSelected={
                    selectedPlayerId === player.id &&
                    selectedTeamId === game.myTeamId
                  }
                  isOnCourt={onCourtIds.has(player.id!)}
                  pts={calcTeamScore(
                    events.filter((e) => e.playerId === player.id)
                  )}
                  teamColor="orange"
                  onSelect={() =>
                    selectedPlayerId === player.id &&
                    selectedTeamId === game.myTeamId
                      ? clearSelection()
                      : selectPlayer(player.id!, game.myTeamId)
                  }
                  onToggleCourt={() =>
                    toggleOnCourt(player.id!, game.myTeamId)
                  }
                />
              ))}
            </div>
          </div>
        </div>

        {/* 相手チーム */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-1">
            <h3 className="text-center text-xs text-blue-400 font-bold mb-1 sticky top-0 bg-gray-900 py-0.5 z-10">
              {opponentTeam?.name}
            </h3>
            <div className="space-y-0.5">
              {opponentPlayers.map((player) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  teamId={game.opponentTeamId}
                  isSelected={
                    selectedPlayerId === player.id &&
                    selectedTeamId === game.opponentTeamId
                  }
                  isOnCourt={onCourtIds.has(player.id!)}
                  pts={calcTeamScore(
                    events.filter((e) => e.playerId === player.id)
                  )}
                  teamColor="blue"
                  onSelect={() =>
                    selectedPlayerId === player.id &&
                    selectedTeamId === game.opponentTeamId
                      ? clearSelection()
                      : selectPlayer(player.id!, game.opponentTeamId)
                  }
                  onToggleCourt={() =>
                    toggleOnCourt(player.id!, game.opponentTeamId)
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ======== アクションボタン ======== */}
      <div className="bg-gray-800 border-t border-gray-700 px-2 py-1.5">
        <div className="max-w-5xl mx-auto space-y-1">
          {/* 得点ボタン */}
          <div className="flex gap-1.5 justify-center">
            {ACTION_BUTTONS.filter((b) => b.group === 'score').map((btn) => (
              <button
                key={btn.action}
                onClick={() => handleAction(btn.action)}
                disabled={!hasSelection}
                className={`flex-1 max-w-[120px] py-3 text-lg font-bold rounded-lg transition-colors active:scale-95 ${
                  hasSelection
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-green-900 text-green-700 cursor-not-allowed'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* スタッツボタン */}
          <div className="flex gap-1 justify-center flex-wrap">
            {ACTION_BUTTONS.filter((b) => b.group === 'stat').map((btn) => (
              <button
                key={btn.action}
                onClick={() => handleAction(btn.action)}
                disabled={!hasSelection}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors active:scale-95 min-w-[44px] ${
                  hasSelection
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* ミスボタン + 戻す */}
          <div className="flex gap-1 justify-center items-center">
            {ACTION_BUTTONS.filter((b) => b.group === 'miss').map((btn) => (
              <button
                key={btn.action}
                onClick={() => handleAction(btn.action)}
                disabled={!hasSelection}
                className={`px-2 py-1.5 text-xs font-bold rounded-lg transition-colors active:scale-95 ${
                  hasSelection
                    ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                }`}
              >
                {btn.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={handleUndo}
              className="px-3 py-1.5 text-xs bg-yellow-700 hover:bg-yellow-600 text-white font-bold rounded-lg transition-colors active:scale-95"
            >
              戻す
            </button>
          </div>
        </div>
      </div>

      {/* ======== スタッツ確認パネル（モーダル） ======== */}
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
    </div>
  );
}

// ============================================================
// PlayerRow コンポーネント
// ============================================================
function PlayerRow({
  player,
  isSelected,
  isOnCourt,
  pts,
  teamColor,
  onSelect,
  onToggleCourt,
}: {
  player: Player;
  teamId: number;
  isSelected: boolean;
  isOnCourt: boolean;
  pts: number;
  teamColor: 'orange' | 'blue';
  onSelect: () => void;
  onToggleCourt: () => void;
}) {
  const selectedBg = teamColor === 'orange' ? 'bg-orange-500 ring-orange-300' : 'bg-blue-500 ring-blue-300';
  const selectedText = teamColor === 'orange' ? 'text-orange-100' : 'text-blue-100';

  return (
    <div className="flex items-center gap-0.5">
      {/* 出場トグル（丸いインジケーター） */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleCourt();
        }}
        className={`w-5 h-5 rounded-full flex-shrink-0 border-2 transition-colors ${
          isOnCourt
            ? 'bg-green-500 border-green-400'
            : 'bg-gray-700 border-gray-600'
        }`}
        title={isOnCourt ? 'ベンチへ' : 'コートイン'}
      />

      {/* 選手ボタン */}
      <button
        onClick={onSelect}
        className={`flex-1 text-left px-2 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
          isSelected
            ? `${selectedBg} text-white ring-2`
            : 'bg-gray-800 text-gray-200 hover:bg-gray-700 active:bg-gray-600'
        }`}
      >
        <span className="truncate">
          <span className="font-mono font-bold mr-1 text-xs">
            #{player.number}
          </span>
          {player.name}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {pts > 0 && (
            <span
              className={`text-xs ${isSelected ? selectedText : 'text-gray-500'}`}
            >
              {pts}pts
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

// ============================================================
// StatsPanel コンポーネント（試合中スタッツ確認モーダル）
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

  // チーム合計
  const totals = data.reduce(
    (acc, { stats }) => {
      acc.pts += stats.pts;
      acc.fg += stats.fg;
      acc.fga += stats.fga;
      acc.tp += stats.tp;
      acc.tpa += stats.tpa;
      acc.ft += stats.ft;
      acc.fta += stats.fta;
      acc.reb += stats.reb;
      acc.ast += stats.ast;
      acc.stl += stats.stl;
      acc.blk += stats.blk;
      acc.to += stats.to;
      acc.foul += stats.foul;
      return acc;
    },
    { pts: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, foul: 0 }
  );

  function fgStr(made: number, att: number) {
    if (att === 0) return '-';
    return `${made}/${att}`;
  }

  // チーム内最高値を計算（ハイライト用）
  const maxPts = Math.max(...data.map((d) => d.stats.pts), 0);
  const maxReb = Math.max(...data.map((d) => d.stats.reb), 0);
  const maxAst = Math.max(...data.map((d) => d.stats.ast), 0);

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <h2 className="text-base font-bold text-white">試合中スタッツ</h2>
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
          onClick={() => setStatsTab('my')}
          className={`flex-1 py-2 text-sm font-bold text-center transition-colors ${
            statsTab === 'my'
              ? 'text-orange-400 border-b-2 border-orange-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {myTeam?.name || '自チーム'}
        </button>
        <button
          onClick={() => setStatsTab('opp')}
          className={`flex-1 py-2 text-sm font-bold text-center transition-colors ${
            statsTab === 'opp'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {opponentTeam?.name || '相手チーム'}
        </button>
      </div>

      {/* テーブル */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs text-white">
          <thead className="sticky top-0 bg-gray-800 z-10">
            <tr className="border-b border-gray-700">
              <th className="text-left px-2 py-2 font-bold text-gray-300 sticky left-0 bg-gray-800 z-20 min-w-[80px]">
                選手
              </th>
              {STAT_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-1.5 py-2 font-bold text-gray-300 text-center min-w-[36px]"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(({ player, stats }) => (
              <tr
                key={player.id}
                className="border-b border-gray-800 hover:bg-gray-800/60"
              >
                <td className="px-2 py-1.5 font-medium sticky left-0 bg-gray-900 z-10 whitespace-nowrap">
                  <span className="font-mono text-gray-400 mr-1">
                    #{player.number}
                  </span>
                  {player.name}
                </td>
                <td
                  className={`px-1.5 py-1.5 text-center font-bold ${
                    stats.pts > 0 && stats.pts === maxPts
                      ? 'text-yellow-400'
                      : ''
                  }`}
                >
                  {stats.pts}
                </td>
                <td className="px-1.5 py-1.5 text-center tabular-nums">
                  {fgStr(stats.fg, stats.fga)}
                </td>
                <td className="px-1.5 py-1.5 text-center tabular-nums">
                  {fgStr(stats.tp, stats.tpa)}
                </td>
                <td className="px-1.5 py-1.5 text-center tabular-nums">
                  {fgStr(stats.ft, stats.fta)}
                </td>
                <td
                  className={`px-1.5 py-1.5 text-center ${
                    stats.reb > 0 && stats.reb === maxReb
                      ? 'text-yellow-400 font-bold'
                      : ''
                  }`}
                >
                  {stats.reb}
                </td>
                <td
                  className={`px-1.5 py-1.5 text-center ${
                    stats.ast > 0 && stats.ast === maxAst
                      ? 'text-yellow-400 font-bold'
                      : ''
                  }`}
                >
                  {stats.ast}
                </td>
                <td className="px-1.5 py-1.5 text-center">{stats.stl}</td>
                <td className="px-1.5 py-1.5 text-center">{stats.blk}</td>
                <td className="px-1.5 py-1.5 text-center">{stats.to}</td>
                <td className="px-1.5 py-1.5 text-center">{stats.foul}</td>
              </tr>
            ))}
            {/* チーム合計 */}
            <tr className="border-t-2 border-gray-600 bg-gray-800 font-bold">
              <td className="px-2 py-1.5 sticky left-0 bg-gray-800 z-10">
                TOTAL
              </td>
              <td className="px-1.5 py-1.5 text-center">{totals.pts}</td>
              <td className="px-1.5 py-1.5 text-center tabular-nums">
                {fgStr(totals.fg, totals.fga)}
              </td>
              <td className="px-1.5 py-1.5 text-center tabular-nums">
                {fgStr(totals.tp, totals.tpa)}
              </td>
              <td className="px-1.5 py-1.5 text-center tabular-nums">
                {fgStr(totals.ft, totals.fta)}
              </td>
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
