'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db, type Team, type Player, type Game, type StatEvent, type GameCategory, GAME_CATEGORY_CONFIG } from '@/lib/db';
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

interface TeamWithPlayerCount {
  team: Team;
  playerCount: number;
}

export default function GamesPage() {
  const router = useRouter();
  const [games, setGames] = useState<GameWithDetails[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [allTeams, setAllTeams] = useState<TeamWithPlayerCount[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  // 新規試合作成フォーム
  const [selectedMyTeamId, setSelectedMyTeamId] = useState<number | null>(null);
  const [gameTitle, setGameTitle] = useState('');
  const [gameDate, setGameDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  // カテゴリ
  const [category, setCategory] = useState<GameCategory>('high_school');

  // クォーター時間（分）
  const [quarterMinutes, setQuarterMinutes] = useState(10);

  // 対戦相手モード: 'existing'=登録済みから選択, 'new'=新規入力
  const [opponentMode, setOpponentMode] = useState<'existing' | 'new'>('existing');
  const [selectedOpponentTeamId, setSelectedOpponentTeamId] = useState<number | null>(null);
  const [opponentName, setOpponentName] = useState('');
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

      // 自チーム一覧
      const teams = await db.teams
        .filter((t) => t.isMyTeam === true)
        .toArray();
      setMyTeams(teams);
      if (teams.length > 0 && !selectedMyTeamId) {
        setSelectedMyTeamId(teams[0].id!);
      }

      // 全チーム一覧（選手数付き）
      const all = await db.teams.toArray();
      const withCounts: TeamWithPlayerCount[] = [];
      for (const t of all) {
        const count = await db.players.where('teamId').equals(t.id!).count();
        withCounts.push({ team: t, playerCount: count });
      }
      setAllTeams(withCounts);
      if (withCounts.length > 0 && !selectedOpponentTeamId) {
        setSelectedOpponentTeamId(withCounts[0].team.id!);
      }
    } catch {
      // DB not ready
    } finally {
      setLoading(false);
    }
  }, [selectedMyTeamId, selectedOpponentTeamId]);

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
    if (!selectedMyTeamId) return;

    let opponentTeamId: number;

    if (opponentMode === 'existing') {
      // 登録済みチームから選択
      if (!selectedOpponentTeamId) {
        alert('対戦相手チームを選択してください');
        return;
      }
      opponentTeamId = selectedOpponentTeamId;
    } else {
      // 新規チーム作成
      if (!opponentName.trim()) {
        alert('対戦相手チーム名を入力してください');
        return;
      }
      const validPlayers = opponentPlayers.filter(
        (p) => p.name.trim() && p.number.trim()
      );
      if (validPlayers.length < 5) {
        alert('対戦相手の選手を最低5人登録してください');
        return;
      }

      opponentTeamId = (await db.teams.add({
        name: opponentName.trim(),
        isMyTeam: false,
        createdAt: new Date(),
      })) as number;

      for (const p of validPlayers) {
        await db.players.add({
          teamId: opponentTeamId,
          number: parseInt(p.number),
          name: p.name.trim(),
        });
      }
    }

    const config = GAME_CATEGORY_CONFIG[category];
    const gameId = await db.games.add({
      myTeamId: selectedMyTeamId,
      opponentTeamId,
      title: gameTitle.trim() || undefined,
      date: new Date(gameDate),
      status: 'live',
      currentQuarter: 1,
      createdAt: new Date(),
      category,
      quarterMinutes,
      overtimeMinutes: config.overtimeMinutes,
      timerSeconds: quarterMinutes * 60,
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
      <h1 className="text-2xl font-bold mb-6">試合</h1>

      {myTeams.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-8 text-center mb-6">
          <p className="text-gray-300 mb-4">
            試合を作成するにはまずチームを登録してください
          </p>
          <Link
            href="/teams"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors active:scale-95"
          >
            チーム登録
          </Link>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(!showCreate)}
          className={`w-full font-bold py-4 rounded-xl text-center text-lg mb-6 transition-colors active:scale-[0.98] ${
            showCreate
              ? 'bg-gray-600 hover:bg-gray-500 text-white'
              : 'bg-orange-500 hover:bg-orange-600 text-white'
          }`}
        >
          {showCreate ? '閉じる' : '＋ 新規試合'}
        </button>
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

            {/* 試合タイトル */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">試合タイトル</label>
              <input
                type="text"
                value={gameTitle}
                onChange={(e) => setGameTitle(e.target.value)}
                placeholder="例: 練習試合、インターハイ予選 など"
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* 試合日 */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">試合日</label>
              <input
                type="date"
                value={gameDate}
                onChange={(e) => setGameDate(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 appearance-none [&::-webkit-date-and-time-value]:text-left"
              />
            </div>

            {/* カテゴリ選択 */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                カテゴリ
              </label>
              <div className="flex gap-2">
                {(Object.entries(GAME_CATEGORY_CONFIG) as [GameCategory, typeof GAME_CATEGORY_CONFIG[GameCategory]][]).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setCategory(key);
                      setQuarterMinutes(config.quarterMinutes);
                    }}
                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition-colors ${
                      category === key
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <div>{config.label}</div>
                    <div className="text-[10px] font-normal mt-0.5 opacity-75">
                      Q{config.quarterMinutes}分 / OT{config.overtimeMinutes}分
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* クォーター時間（カスタム） */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                1クォーターの時間
              </label>
              <div className="flex gap-2 flex-wrap">
                {[5, 6, 7, 8, 10, 12].map((min) => (
                  <button
                    key={min}
                    onClick={() => setQuarterMinutes(min)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                      quarterMinutes === min
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {min}分
                  </button>
                ))}
              </div>
            </div>

            {/* 対戦相手選択モード */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                対戦相手
              </label>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setOpponentMode('existing')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                    opponentMode === 'existing'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  登録済みチームから選ぶ
                </button>
                <button
                  onClick={() => setOpponentMode('new')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                    opponentMode === 'new'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  新しく入力する
                </button>
              </div>

              {opponentMode === 'existing' ? (
                /* 登録済みチームから選択 */
                <div>
                  <select
                    value={selectedOpponentTeamId || ''}
                    onChange={(e) =>
                      setSelectedOpponentTeamId(Number(e.target.value))
                    }
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {allTeams.map(({ team, playerCount }) => (
                      <option key={team.id} value={team.id}>
                        {team.name}（{playerCount}人）
                        {team.isMyTeam ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                  {allTeams.length === 0 && (
                    <p className="text-sm text-gray-400 mt-2">
                      登録済みのチームがありません。「新しく入力する」から作成してください。
                    </p>
                  )}
                </div>
              ) : (
                /* 新規チーム入力 */
                <div className="space-y-3">
                  <input
                    type="text"
                    value={opponentName}
                    onChange={(e) => setOpponentName(e.target.value)}
                    placeholder="相手チーム名を入力"
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />

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
                              updateOpponentPlayer(
                                index,
                                'number',
                                e.target.value
                              )
                            }
                            placeholder="番号"
                            className="w-24 bg-gray-700 text-white rounded-lg px-3 py-2 text-center placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                          <input
                            type="text"
                            value={player.name}
                            onChange={(e) =>
                              updateOpponentPlayer(
                                index,
                                'name',
                                e.target.value
                              )
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
                </div>
              )}
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
        <div className="space-y-3 pb-20">
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
                  {detail.game.title && (
                    <span className="text-gray-300 mr-2">{detail.game.title}</span>
                  )}
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
