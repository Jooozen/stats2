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
  large?: boolean;
}

const ACTION_BUTTONS: ActionButton[] = [
  { action: 'pts2', label: '2P', large: true },
  { action: 'pts3', label: '3P', large: true },
  { action: 'ft', label: 'FT', large: true },
  { action: 'reb', label: 'REB' },
  { action: 'ast', label: 'AST' },
  { action: 'stl', label: 'STL' },
  { action: 'blk', label: 'BLK' },
  { action: 'to', label: 'TO' },
  { action: 'foul', label: 'FOUL' },
  { action: 'miss2', label: 'ミス(2P)' },
  { action: 'miss3', label: 'ミス(3P)' },
  { action: 'missFt', label: 'ミス(FT)' },
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

  async function handleAction(action: StatAction) {
    if (!selectedPlayerId || !selectedTeamId) {
      showFeedback('選手を選択してください');
      return;
    }

    await recordStat(gameId, quarter, action);

    // イベントを再読み込み
    const ev = await db.statEvents
      .where('gameId')
      .equals(gameId)
      .toArray();
    setEvents(ev);

    // フィードバック表示
    const player = [...myPlayers, ...opponentPlayers].find(
      (p) => p.id === selectedPlayerId
    );
    const btn = ACTION_BUTTONS.find((b) => b.action === action);
    showFeedback(`#${player?.number} ${player?.name} → ${btn?.label}`);
  }

  async function handleUndo() {
    if (!lastEvent) {
      showFeedback('取り消す記録がありません');
      return;
    }
    await undoLast();
    const ev = await db.statEvents
      .where('gameId')
      .equals(gameId)
      .toArray();
    setEvents(ev);
    showFeedback('直前の記録を取り消しました');
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

  return (
    <div className="h-screen flex flex-col bg-gray-900 overflow-hidden select-none">
      {/* スコアボード */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex-1 text-right">
            <span className="text-lg font-bold truncate">
              {myTeam?.name || '自チーム'}
            </span>
          </div>
          <div className="mx-6 text-center">
            <div className="text-4xl font-bold tabular-nums text-white">
              {myScore} - {opponentScore}
            </div>
          </div>
          <div className="flex-1 text-left">
            <span className="text-lg font-bold text-gray-400 truncate">
              {opponentTeam?.name || '相手'}
            </span>
          </div>
        </div>

        {/* クォーター & 終了ボタン */}
        <div className="flex items-center justify-center gap-2 mt-2">
          {QUARTER_LABELS.map((label, i) => (
            <button
              key={label}
              onClick={() => changeQuarter(i + 1)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                quarter === i + 1
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={finishGame}
            className="ml-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors"
          >
            試合終了
          </button>
        </div>
      </div>

      {/* フィードバックメッセージ */}
      {feedbackMessage && (
        <div className="bg-green-700 text-white text-center py-2 text-lg font-bold animate-pulse">
          {feedbackMessage}
        </div>
      )}

      {/* 選手リスト（左右分割） */}
      <div className="flex-1 flex overflow-hidden">
        {/* 自チーム */}
        <div className="flex-1 border-r border-gray-700 overflow-y-auto">
          <div className="p-2">
            <h3 className="text-center text-sm text-gray-400 font-bold mb-2 sticky top-0 bg-gray-900 py-1">
              {myTeam?.name}
            </h3>
            <div className="space-y-1">
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
                    className={`w-full text-left px-3 py-3 rounded-lg text-lg font-medium transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700 active:bg-gray-600'
                    }`}
                  >
                    <span>
                      <span className="font-mono font-bold mr-2">
                        #{player.number}
                      </span>
                      {player.name}
                    </span>
                    <span className={`text-sm ${isSelected ? 'text-orange-100' : 'text-gray-400'}`}>
                      {pts}pts
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 相手チーム */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            <h3 className="text-center text-sm text-gray-400 font-bold mb-2 sticky top-0 bg-gray-900 py-1">
              {opponentTeam?.name}
            </h3>
            <div className="space-y-1">
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
                    className={`w-full text-left px-3 py-3 rounded-lg text-lg font-medium transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700 active:bg-gray-600'
                    }`}
                  >
                    <span>
                      <span className="font-mono font-bold mr-2">
                        #{player.number}
                      </span>
                      {player.name}
                    </span>
                    <span className={`text-sm ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                      {pts}pts
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="bg-gray-800 border-t border-gray-700 px-3 py-3">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap gap-2 justify-center">
            {ACTION_BUTTONS.map((btn) => (
              <button
                key={btn.action}
                onClick={() => handleAction(btn.action)}
                className={`font-bold rounded-lg transition-colors active:scale-95 ${
                  btn.large
                    ? 'px-6 py-4 text-lg bg-green-600 hover:bg-green-700 text-white min-w-[80px]'
                    : btn.action.startsWith('miss')
                    ? 'px-4 py-3 text-sm bg-gray-600 hover:bg-gray-500 text-gray-200 min-w-[80px]'
                    : 'px-4 py-3 text-sm bg-gray-700 hover:bg-gray-600 text-white min-w-[64px]'
                }`}
              >
                {btn.label}
              </button>
            ))}
            <button
              onClick={handleUndo}
              className="px-4 py-3 text-sm bg-yellow-700 hover:bg-yellow-600 text-white font-bold rounded-lg transition-colors min-w-[64px]"
            >
              戻す
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
