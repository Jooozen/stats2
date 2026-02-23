'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { db, type Game, type Team, ensureExampleData } from '@/lib/db';
import { calcTeamScore } from '@/lib/stats';
import type { StatEvent } from '@/lib/db';

interface GameWithDetails {
  game: Game;
  myTeam: Team | undefined;
  opponentTeam: Team | undefined;
  myScore: number;
  opponentScore: number;
}

export default function HomePage() {
  const [recentGames, setRecentGames] = useState<GameWithDetails[]>([]);
  const [hasTeams, setHasTeams] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      await ensureExampleData();
      const myTeams = await db.teams.where('isMyTeam').equals(1).toArray();
      setHasTeams(myTeams.length > 0);

      const games = await db.games.orderBy('createdAt').reverse().limit(3).toArray();
      const details: GameWithDetails[] = [];

      for (const game of games) {
        const myTeam = await db.teams.get(game.myTeamId);
        const opponentTeam = await db.teams.get(game.opponentTeamId);
        const events = await db.statEvents.where('gameId').equals(game.id!).toArray();
        const myEvents = events.filter((e: StatEvent) => e.teamId === game.myTeamId);
        const opponentEvents = events.filter((e: StatEvent) => e.teamId === game.opponentTeamId);

        details.push({
          game,
          myTeam,
          opponentTeam,
          myScore: calcTeamScore(myEvents),
          opponentScore: calcTeamScore(opponentEvents),
        });
      }

      setRecentGames(details);
    } catch {
      // DB not ready yet
    } finally {
      setLoading(false);
    }
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
      <h1 className="text-3xl font-bold mb-8 text-center">バスケスタッツ</h1>

      {recentGames.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-300">
            最近の試合
          </h2>
          <div className="space-y-3">
            {recentGames.map((detail) => (
              <Link
                key={detail.game.id}
                href={`/games/${detail.game.id}/summary`}
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
        </div>
      )}

      {/* 右下FAB */}
      <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-3 items-end">
        {!hasTeams ? (
          <Link
            href="/teams"
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-full text-lg shadow-lg shadow-orange-500/30 transition-colors"
          >
            チーム登録
          </Link>
        ) : (
          <Link
            href="/games"
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-full text-lg shadow-lg shadow-orange-500/30 transition-colors"
          >
            ＋ 新規試合
          </Link>
        )}
      </div>
    </div>
  );
}
