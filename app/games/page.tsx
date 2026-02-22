'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db, type Team, type Player, type Game, type StatEvent } from '@/lib/db';
import { calcTeamScore } from '@/lib/stats';

interface GameWithDetails {
  game: Game;
  myTeam: Team | undefined;
  opponentTeam: Team | undefined;
  myScore: number;
  opponentScore: number;
}

interface OpponentPlayer {
  number: string;
  name: string;
}

export default function GamesPage() {
  const router = useRouter();
  const [games, setGames] = useState<GameWithDetails[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  // 新規試合作成フォーム
  const [selectedMyTeamId, setSelectedMyTeamId] = useState<number | null>(null);
  const [opponentName, setOpponentName] = useState('');
  const [gameDate, setGameDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [opponentPlayers, setOpponentPlayers] = useState<OpponentPlayer[]>([
    { number: '', name: '' },
    { number: '', name: '' },
    { number: '', name: '' },
    { number: '', name: '' },
    { number: '', name: '' },
  ]);

  const loadGames = useCallback(async () => {
    try {
      const allGames = await db.games
        .orderBy('createdAt')
        .reverse()
        .toArray();
      const details: GameWithDetails[] = [];

      for (const game of allGames) {
        const myTeam = await db.teams.get(game.myTeamId);
        const opponentTeam = await db.teams.get(game.opponentTeamId);
        const events = await db.statEvents
          .where('gameId')
          .equals(game.id!)
          .toArray();
        const myEvents = events.filter(
          (e: StatEvent) => e.teamId === game.myTeamId
        );
        const opponentEvents = events.filter(
          (e: StatEvent) => e.teamId === game.opponentTeamId
        );

        details.push({
          game,
          myTeam,
          opponentTeam,
          myScore: calcTeamScore(myEvents),
          opponentScore: calcTeamScore(opponentEvents),
        });
      }

      setGames(details);

      const teams = await db.teams
        .filter((t) => t.isMyTeam === true)
        .toArray();
      setMyTeams(teams);
      if (teams.length > 0 && !selectedMyTeamId) {
        setSelectedMyTeamId(teams[0].id!);
      }
    } catch {
      // DB not ready
    } finally {
      setLoading(false);
    }
  }, [selectedMyTeamId]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  function updateOpponentPlayer(
    index: number,
    field: 'number' | 'name',
    value: string
  ) {
    const updated = [...opponentPlayers];
    updated[index] = { ...updated[index], [field]: value };
    setOpponentPlayers(updated);
  }

  function addOpponentPlayerRow() {
    setOpponentPlayers([...opponentPlayers, { number: '', name: '' }]);
  }

  async function createGame() {
    if (!selectedMyTeamId || !opponentName.trim()) return;

    // 相手チームが最低5人いるか確認
    const validPlayers = opponentPlayers.filter(
      (p) => p.name.trim() && p.number.trim()
    );
    if (validPlayers.length < 5) {
      alert('対戦相手の選手を最低5人登録してください');
      return;
    }

    // 対戦相手チーム作成
    const opponentTeamId = await db.teams.add({
      name: opponentName.trim(),
      isMyTeam: false,
      createdAt: new Date(),
    });

    // 対戦相手選手登録
    for (const p of validPlayers) {
      await db.players.add({
        teamId: opponentTeamId,
        number: parseInt(p.number),
        name: p.name.trim(),
      });
    }

    // 試合作成
    const gameId = await db.games.add({
      myTeamId: selectedMyTeamId,
      opponentTeamId,
      date: new Date(gameDate),
      status: 'live',
      currentQuarter: 1,
      createdAt: new Date(),
    });

    router.push(`/games/${gameId}`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-lg">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">試合</h1>
        {myTeams.length > 0 && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-3 rounded-lg text-lg transition-colors"
          >
            {showCreate ? '閉じる' : '＋ 新規試合'}
          </button>
        )}
      </div>

      {myTeams.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 text-center mb-6">
          <p className="text-gray-300 mb-4">
            試合を作成するにはまずチームを登録してください
          </p>
          <Link
            href="/teams"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            チーム登録へ
          </Link>
        </div>
      )}

      {/* 新規試合作成フォーム */}
      {showCreate && (
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">新しい試合を作成</h2>

          <div className="space-y-4">
            {/* 自チーム選択 */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                自チーム
              </label>
              <select
                value={selectedMyTeamId || ''}
                onChange={(e) => setSelectedMyTeamId(Number(e.target.value))}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {myTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 試合日 */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">試合日</label>
              <input
                type="date"
                value={gameDate}
                onChange={(e) => setGameDate(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* 対戦相手名 */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                対戦相手チーム名
              </label>
              <input
                type="text"
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
                placeholder="相手チーム名を入力"
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* 対戦相手の選手登録 */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                対戦相手の選手（最低5人）
              </label>
              <div className="space-y-2">
                {opponentPlayers.map((player, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="number"
                      value={player.number}
                      onChange={(e) =>
                        updateOpponentPlayer(index, 'number', e.target.value)
                      }
                      placeholder="番号"
                      className="w-24 bg-gray-700 text-white rounded-lg px-3 py-2 text-center placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <input
                      type="text"
                      value={player.name}
                      onChange={(e) =>
                        updateOpponentPlayer(index, 'name', e.target.value)
                      }
                      placeholder="選手名"
                      className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={addOpponentPlayerRow}
                className="mt-2 text-sm text-orange-400 hover:text-orange-300"
              >
                ＋ 選手を追加
              </button>
            </div>

            <button
              onClick={createGame}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg text-xl transition-colors"
            >
              試合を開始する
            </button>
          </div>
        </div>
      )}

      {/* 試合一覧 */}
      {games.length === 0 ? (
        <p className="text-gray-400 text-center py-8">
          試合がまだありません
        </p>
      ) : (
        <div className="space-y-3">
          {games.map((detail) => (
            <Link
              key={detail.game.id}
              href={
                detail.game.status === 'live'
                  ? `/games/${detail.game.id}`
                  : `/games/${detail.game.id}/summary`
              }
              className="block bg-gray-800 hover:bg-gray-750 rounded-xl p-5 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  {new Date(detail.game.date).toLocaleDateString('ja-JP')}
                </div>
                <div
                  className={`text-xs px-2 py-1 rounded ${
                    detail.game.status === 'live'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-600 text-gray-200'
                  }`}
                >
                  {detail.game.status === 'live' ? 'LIVE' : '終了'}
                </div>
              </div>
              <div className="flex items-center justify-center mt-3 text-2xl font-bold">
                <span className="text-right flex-1 truncate">
                  {detail.myTeam?.name || '自チーム'}
                </span>
                <span className="mx-4 tabular-nums">
                  {detail.myScore} - {detail.opponentScore}
                </span>
                <span className="text-left flex-1 truncate text-gray-400">
                  {detail.opponentTeam?.name || '相手'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
