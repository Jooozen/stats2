'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { db, type Game, type Team, type Player, type StatEvent } from '@/lib/db';
import { calcPlayerStats, calcTeamScore, emptyStats, mergeStats, type PlayerStats } from '@/lib/stats';

interface PlayerRow {
  player: Player;
  stats: PlayerStats;
}

export default function GameSummaryPage() {
  const params = useParams();
  const gameId = Number(params.gameId);

  const [game, setGame] = useState<Game | null>(null);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [opponentTeam, setOpponentTeam] = useState<Team | null>(null);
  const [myRows, setMyRows] = useState<PlayerRow[]>([]);
  const [opponentRows, setOpponentRows] = useState<PlayerRow[]>([]);
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const g = await db.games.get(gameId);
      if (!g) return;
      setGame(g);

      const mt = await db.teams.get(g.myTeamId);
      const ot = await db.teams.get(g.opponentTeamId);
      setMyTeam(mt || null);
      setOpponentTeam(ot || null);

      const allEvents = await db.statEvents
        .where('gameId')
        .equals(gameId)
        .toArray();

      const myEvents = allEvents.filter(
        (e: StatEvent) => e.teamId === g.myTeamId
      );
      const opEvents = allEvents.filter(
        (e: StatEvent) => e.teamId === g.opponentTeamId
      );

      setMyScore(calcTeamScore(myEvents));
      setOpponentScore(calcTeamScore(opEvents));

      // 自チーム選手別
      const myPlayers = await db.players
        .where('teamId')
        .equals(g.myTeamId)
        .toArray();
      const myPlayerRows: PlayerRow[] = myPlayers
        .sort((a, b) => a.number - b.number)
        .map((player) => ({
          player,
          stats: calcPlayerStats(
            myEvents.filter((e: StatEvent) => e.playerId === player.id)
          ),
        }));
      setMyRows(myPlayerRows);

      // 相手チーム選手別
      const opPlayers = await db.players
        .where('teamId')
        .equals(g.opponentTeamId)
        .toArray();
      const opPlayerRows: PlayerRow[] = opPlayers
        .sort((a, b) => a.number - b.number)
        .map((player) => ({
          player,
          stats: calcPlayerStats(
            opEvents.filter((e: StatEvent) => e.playerId === player.id)
          ),
        }));
      setOpponentRows(opPlayerRows);
    } catch {
      // DB not ready
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function teamTotal(rows: PlayerRow[]): PlayerStats {
    return rows.reduce((acc, r) => mergeStats(acc, r.stats), emptyStats());
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-lg">読み込み中...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-lg">試合が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/games"
          className="text-orange-400 hover:text-orange-300 text-lg"
        >
          ← 試合一覧
        </Link>
        {game.status === 'live' && (
          <Link
            href={`/games/${game.id}`}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-lg transition-colors"
          >
            記録画面に戻る
          </Link>
        )}
      </div>

      {/* スコア */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6 text-center">
        <div className="text-sm text-gray-400 mb-2">
          {new Date(game.date).toLocaleDateString('ja-JP')}
          <span
            className={`ml-3 px-2 py-1 rounded text-xs ${
              game.status === 'live'
                ? 'bg-red-600 text-white'
                : 'bg-gray-600 text-gray-200'
            }`}
          >
            {game.status === 'live' ? 'LIVE' : '終了'}
          </span>
        </div>
        <div className="flex items-center justify-center">
          <span className="text-2xl font-bold flex-1 text-right truncate">
            {myTeam?.name}
          </span>
          <span className="text-5xl font-bold mx-8 tabular-nums text-white">
            {myScore} - {opponentScore}
          </span>
          <span className="text-2xl font-bold flex-1 text-left truncate text-gray-400">
            {opponentTeam?.name}
          </span>
        </div>
      </div>

      {/* 自チームスタッツ */}
      <StatsTable
        title={myTeam?.name || '自チーム'}
        rows={myRows}
        total={teamTotal(myRows)}
      />

      {/* 相手チームスタッツ */}
      <StatsTable
        title={opponentTeam?.name || '相手チーム'}
        rows={opponentRows}
        total={teamTotal(opponentRows)}
        isOpponent
      />
    </div>
  );
}

function StatsTable({
  title,
  rows,
  total,
  isOpponent,
}: {
  title: string;
  rows: PlayerRow[];
  total: PlayerStats;
  isOpponent?: boolean;
}) {
  return (
    <div className="mb-6">
      <h2
        className={`text-xl font-bold mb-3 ${
          isOpponent ? 'text-gray-400' : 'text-white'
        }`}
      >
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800 text-gray-400">
              <th className="px-2 py-2 text-left whitespace-nowrap">#</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">名前</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">PTS</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">FG</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">3P</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">FT</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">REB</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">AST</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">STL</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">BLK</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">TO</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">FOUL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.player.id}
                className="border-b border-gray-700 hover:bg-gray-800"
              >
                <td className="px-2 py-2 font-mono font-bold text-orange-400">
                  {row.player.number}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {row.player.name}
                </td>
                <td className="px-2 py-2 text-center font-bold">
                  {row.stats.pts}
                </td>
                <td className="px-2 py-2 text-center text-gray-300">
                  {row.stats.fg}/{row.stats.fga}
                </td>
                <td className="px-2 py-2 text-center text-gray-300">
                  {row.stats.tp}/{row.stats.tpa}
                </td>
                <td className="px-2 py-2 text-center text-gray-300">
                  {row.stats.ft}/{row.stats.fta}
                </td>
                <td className="px-2 py-2 text-center">{row.stats.reb}</td>
                <td className="px-2 py-2 text-center">{row.stats.ast}</td>
                <td className="px-2 py-2 text-center">{row.stats.stl}</td>
                <td className="px-2 py-2 text-center">{row.stats.blk}</td>
                <td className="px-2 py-2 text-center">{row.stats.to}</td>
                <td className="px-2 py-2 text-center">{row.stats.foul}</td>
              </tr>
            ))}
            {/* チーム合計 */}
            <tr className="bg-gray-800 font-bold border-t-2 border-gray-600">
              <td className="px-2 py-2" colSpan={2}>
                合計
              </td>
              <td className="px-2 py-2 text-center">{total.pts}</td>
              <td className="px-2 py-2 text-center text-gray-300">
                {total.fg}/{total.fga}
              </td>
              <td className="px-2 py-2 text-center text-gray-300">
                {total.tp}/{total.tpa}
              </td>
              <td className="px-2 py-2 text-center text-gray-300">
                {total.ft}/{total.fta}
              </td>
              <td className="px-2 py-2 text-center">{total.reb}</td>
              <td className="px-2 py-2 text-center">{total.ast}</td>
              <td className="px-2 py-2 text-center">{total.stl}</td>
              <td className="px-2 py-2 text-center">{total.blk}</td>
              <td className="px-2 py-2 text-center">{total.to}</td>
              <td className="px-2 py-2 text-center">{total.foul}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
