'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db, type Game, type Team, type Player, type StatEvent, type StatAction } from '@/lib/db';
import { calcTeamScore } from '@/lib/stats';
import { useGameStore } from '@/lib/store';

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4', 'OT'];

interface ActionButton {
  action: StatAction;
  label: string;
  group: 'score' | 'stat' | 'miss';
}

const ACTION_BUTTONS: ActionButton[] = [
  // 得点系（大きく表示）
  { action: 'pts2', label: '2P', group: 'score' },
  { action: 'pts3', label: '3P', group: 'score' },
  { action: 'ft', label: 'FT', group: 'score' },
  // スタッツ系
  { action: 'reb', label: 'REB', group: 'stat' },
  { action: 'ast', label: 'AST', group: 'stat' },
  { action: 'stl', label: 'STL', group: 'stat' },
  { action: 'blk', label: 'BLK', group: 'stat' },
  { action: 'to', label: 'TO', group: 'stat' },
  { action: 'foul', label: 'FOUL', group: 'stat' },
  // ミス系
  { action: 'miss2', label: 'ミス(2P)', group: 'miss' },
  { action: 'miss3', label: 'ミス(3P)', group: 'miss' },
  { action: 'missFt', label: 'ミス(FT)', group: 'miss' },
];

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

  const {
    selectedPlayerId,
    selectedTeamId,
    selectPlayer,
    clearSelection,
    recordStat,
    undoLast,
    lastEvent,
  } = useGameStore();

  const loadGame = useCallback(async () => {
    try {
      const g = await db.games.get(gameId);
      if (!g) return;
      setGame(g);
      setQuarter(g.currentQuarter);

      const mt = await db.teams.get(g.myTeamId);
      const ot = await db.teams.get(g.opponentTeamId);
      setMyTeam(mt || null);
      setOpponentTeam(ot || null);

      const mp = await db.players
        .where('teamId')
        .equals(g.myTeamId)
        .toArray();
      const op = await db.players
        .where('teamId')
        .equals(g.opponentTeamId)
        .toArray();
      setMyPlayers(mp.sort((a, b) => a.number - b.number));
      setOpponentPlayers(op.sort((a, b) => a.number - b.number));

      const ev = await db.statEvents
        .where('gameId')
        .equals(gameId)
        .toArray();
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
  const isMyTeamSelected = selectedTeamId !== null && game !== null && selectedTeamId === game.myTeamId;

  async function handleAction(action: StatAction) {
    if (!selectedPlayerId || !selectedTeamId) {
      showFeedback('⚠ 選手を選択してください');
      return;
    }

    await recordStat(gameId, quarter, action);

    const ev = await db.statEvents
      .where('gameId')
      .equals(gameId)
      .toArray();
    setEvents(ev);

    const btn = ACTION_BUTTONS.find((b) => b.action === action);
    showFeedback(`#${selectedPlayer?.number} ${selectedPlayer?.name} → ${btn?.label}`);
  }

  async function handleUndo() {
    if (!lastEvent) {
      showFeedback('取り消す記録がありません');
      return;
    }
    const undonePlayer = [...myPlayers, ...opponentPlayers].find(
      (p) => p.id === lastEvent.playerId
    );
    const undoneAction = ACTION_BUTTONS.find((b) => b.action === lastEvent.action);
    await undoLast();
    const ev = await db.statEvents
      .where('gameId')
      .equals(gameId)
      .toArray();
    setEvents(ev);
    showFeedback(`↩ #${undonePlayer?.number} ${undonePlayer?.name} ${undoneAction?.label} を取消`);
  }

  async function changeQuarter(q: number) {
    setQuarter(q);
    if (game?.id) {
      await db.games.update(game.id, { currentQuarter: q });
    }
  }

  async function finishGame() {
    if (!confirm('試合を終了しますか？')) return;
    if (game?.id) {
      await db.games.update(game.id, { status: 'finished' as const });
      router.push(`/games/${game.id}/summary`);
    }
  }

  function showFeedback(msg: string) {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(''), 2000);
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

  return (
    <div className="h-screen flex flex-col bg-gray-900 overflow-hidden select-none">
      {/* スコアボード */}
      <div className="bg-gray-800 border-b border-gray-700 px-3 py-2">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          {/* 自チーム名 */}
          <div className="flex-1 text-right pr-3">
            <span className="text-sm font-bold text-orange-400 truncate block">
              {myTeam?.name || '自チーム'}
            </span>
          </div>

          {/* スコア */}
          <div className="text-center flex items-center gap-3">
            <span className="text-3xl font-bold tabular-nums text-white">
              {myScore}
            </span>
            <span className="text-xl text-gray-500">-</span>
            <span className="text-3xl font-bold tabular-nums text-white">
              {opponentScore}
            </span>
          </div>

          {/* 相手チーム名 */}
          <div className="flex-1 text-left pl-3">
            <span className="text-sm font-bold text-blue-400 truncate block">
              {opponentTeam?.name || '相手'}
            </span>
          </div>

          {/* クォーター表示 */}
          <div className="ml-2 text-center">
            <span className="bg-orange-500 text-white text-sm font-bold px-2 py-1 rounded">
              {QUARTER_LABELS[quarter - 1]}
            </span>
          </div>
        </div>

        {/* クォーター切替 & 終了ボタン（コンパクト） */}
        <div className="flex items-center justify-center gap-1 mt-2">
          {QUARTER_LABELS.map((label, i) => (
            <button
              key={label}
              onClick={() => changeQuarter(i + 1)}
              className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                quarter === i + 1
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={finishGame}
            className="ml-3 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition-colors"
          >
            試合終了
          </button>
        </div>
      </div>

      {/* 選択中の選手インジケーター */}
      <div
        className={`px-3 py-2 text-center text-sm font-bold transition-colors ${
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

      {/* フィードバックメッセージ */}
      {feedbackMessage && (
        <div className="bg-green-700 text-white text-center py-1.5 text-sm font-bold animate-pulse">
          {feedbackMessage}
        </div>
      )}

      {/* 選手リスト（左右分割） */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* 自チーム */}
        <div className="flex-1 border-r border-gray-700 overflow-y-auto">
          <div className="p-1.5">
            <h3 className="text-center text-xs text-orange-400 font-bold mb-1 sticky top-0 bg-gray-900 py-1 z-10">
              {myTeam?.name}
            </h3>
            <div className="space-y-0.5">
              {myPlayers.map((player) => {
                const isSelected =
                  selectedPlayerId === player.id &&
                  selectedTeamId === game.myTeamId;
                const playerEvents = events.filter(
                  (e) => e.playerId === player.id
                );
                const pts = calcTeamScore(playerEvents);
                return (
                  <button
                    key={player.id}
                    onClick={() =>
                      isSelected
                        ? clearSelection()
                        : selectPlayer(player.id!, game.myTeamId)
                    }
                    className={`w-full text-left px-2 py-2.5 rounded-lg text-base font-medium transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-orange-500 text-white ring-2 ring-orange-300'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700 active:bg-gray-600'
                    }`}
                  >
                    <span className="truncate">
                      <span className="font-mono font-bold mr-1.5 text-sm">
                        #{player.number}
                      </span>
                      {player.name}
                    </span>
                    {pts > 0 && (
                      <span
                        className={`text-xs ml-1 flex-shrink-0 ${
                          isSelected ? 'text-orange-100' : 'text-gray-500'
                        }`}
                      >
                        {pts}pts
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 相手チーム */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-1.5">
            <h3 className="text-center text-xs text-blue-400 font-bold mb-1 sticky top-0 bg-gray-900 py-1 z-10">
              {opponentTeam?.name}
            </h3>
            <div className="space-y-0.5">
              {opponentPlayers.map((player) => {
                const isSelected =
                  selectedPlayerId === player.id &&
                  selectedTeamId === game.opponentTeamId;
                const playerEvents = events.filter(
                  (e) => e.playerId === player.id
                );
                const pts = calcTeamScore(playerEvents);
                return (
                  <button
                    key={player.id}
                    onClick={() =>
                      isSelected
                        ? clearSelection()
                        : selectPlayer(player.id!, game.opponentTeamId)
                    }
                    className={`w-full text-left px-2 py-2.5 rounded-lg text-base font-medium transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700 active:bg-gray-600'
                    }`}
                  >
                    <span className="truncate">
                      <span className="font-mono font-bold mr-1.5 text-sm">
                        #{player.number}
                      </span>
                      {player.name}
                    </span>
                    {pts > 0 && (
                      <span
                        className={`text-xs ml-1 flex-shrink-0 ${
                          isSelected ? 'text-blue-100' : 'text-gray-500'
                        }`}
                      >
                        {pts}pts
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="bg-gray-800 border-t border-gray-700 px-2 py-2">
        <div className="max-w-5xl mx-auto space-y-1.5">
          {/* 得点ボタン（大きく目立つ） */}
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
                className={`px-3 py-2 text-xs font-bold rounded-lg transition-colors active:scale-95 min-w-[48px] ${
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
                className={`px-2.5 py-2 text-xs font-bold rounded-lg transition-colors active:scale-95 ${
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
              className="px-4 py-2 text-xs bg-yellow-700 hover:bg-yellow-600 text-white font-bold rounded-lg transition-colors active:scale-95"
            >
              戻す
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
