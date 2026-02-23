'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, type Team, type Player, type StatEvent, type ShotZone, SHOT_ZONE_INFO } from '@/lib/db';

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Record<number, Player[]>>({});
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editPlayerName, setEditPlayerName] = useState('');
  const [editPlayerNumber, setEditPlayerNumber] = useState('');

  // エリア別シュート率モーダル
  const [shotChartPlayer, setShotChartPlayer] = useState<Player | null>(null);
  const [shotChartData, setShotChartData] = useState<Record<string, { makes: number; attempts: number }>>({});

  async function openShotChart(player: Player) {
    const events: StatEvent[] = await db.statEvents
      .where('playerId')
      .equals(player.id!)
      .toArray();

    const zoneStats: Record<string, { makes: number; attempts: number }> = {};
    for (const e of events) {
      if (!e.zone) continue;
      if (!['pts2', 'pts3', 'miss2', 'miss3'].includes(e.action)) continue;
      if (!zoneStats[e.zone]) zoneStats[e.zone] = { makes: 0, attempts: 0 };
      zoneStats[e.zone].attempts++;
      if (e.action === 'pts2' || e.action === 'pts3') zoneStats[e.zone].makes++;
    }
    setShotChartData(zoneStats);
    setShotChartPlayer(player);
  }

  const loadTeams = useCallback(async () => {
    try {
      const myTeams = await db.teams
        .filter((t) => t.isMyTeam === true)
        .toArray();
      setTeams(myTeams);

      const playerMap: Record<number, Player[]> = {};
      for (const team of myTeams) {
        if (team.id !== undefined) {
          const teamPlayers = await db.players
            .where('teamId')
            .equals(team.id)
            .toArray();
          playerMap[team.id] = teamPlayers.sort((a, b) => a.number - b.number);
        }
      }
      setPlayers(playerMap);
    } catch {
      // DB not ready
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  async function addTeam() {
    if (!newTeamName.trim()) return;
    await db.teams.add({
      name: newTeamName.trim(),
      isMyTeam: true,
      createdAt: new Date(),
    });
    setNewTeamName('');
    loadTeams();
  }

  async function deleteTeam(teamId: number) {
    if (!confirm('このチームと所属選手を削除しますか？')) return;
    await db.players.where('teamId').equals(teamId).delete();
    await db.teams.delete(teamId);
    loadTeams();
  }

  async function addPlayer(teamId: number) {
    const num = parseInt(newPlayerNumber);
    if (!newPlayerName.trim() || isNaN(num)) return;
    await db.players.add({
      teamId,
      number: num,
      name: newPlayerName.trim(),
    });
    setNewPlayerName('');
    setNewPlayerNumber('');
    loadTeams();
  }

  async function deletePlayer(playerId: number) {
    if (!confirm('この選手を削除しますか？')) return;
    await db.players.delete(playerId);
    loadTeams();
  }

  function startEditPlayer(player: Player) {
    setEditingPlayer(player);
    setEditPlayerName(player.name);
    setEditPlayerNumber(String(player.number));
  }

  async function saveEditPlayer() {
    if (!editingPlayer?.id) return;
    const num = parseInt(editPlayerNumber);
    if (!editPlayerName.trim() || isNaN(num)) return;
    await db.players.update(editingPlayer.id, {
      name: editPlayerName.trim(),
      number: num,
    });
    setEditingPlayer(null);
    loadTeams();
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">チーム・選手管理</h1>

      {/* チーム追加 */}
      <div className="bg-gray-800 rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3">新しいチームを作成</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTeam()}
            placeholder="チーム名を入力"
            className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-3 text-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={addTeam}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-lg text-lg transition-colors whitespace-nowrap"
          >
            ＋ 追加
          </button>
        </div>
      </div>

      {/* チーム一覧 */}
      {teams.length === 0 ? (
        <p className="text-gray-400 text-center py-8">
          チームがまだ登録されていません
        </p>
      ) : (
        <div className="space-y-6">
          {teams.map((team) => (
            <div key={team.id} className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{team.name}</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setEditingTeamId(
                        editingTeamId === team.id! ? null : team.id!
                      )
                    }
                    className="text-sm bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg transition-colors"
                  >
                    {editingTeamId === team.id! ? '閉じる' : '選手管理'}
                  </button>
                  <button
                    onClick={() => deleteTeam(team.id!)}
                    className="text-sm bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors"
                  >
                    削除
                  </button>
                </div>
              </div>

              {/* 選手リスト */}
              <div className="space-y-2">
                {(players[team.id!] || []).map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between bg-gray-700 rounded-lg px-4 py-3"
                  >
                    {editingPlayer?.id === player.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="number"
                          value={editPlayerNumber}
                          onChange={(e) => setEditPlayerNumber(e.target.value)}
                          className="w-20 bg-gray-600 text-white rounded px-3 py-2 text-center"
                        />
                        <input
                          type="text"
                          value={editPlayerName}
                          onChange={(e) => setEditPlayerName(e.target.value)}
                          className="flex-1 bg-gray-600 text-white rounded px-3 py-2"
                        />
                        <button
                          onClick={saveEditPlayer}
                          className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingPlayer(null)}
                          className="bg-gray-500 hover:bg-gray-400 px-3 py-2 rounded text-sm"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-lg">
                          <span className="text-orange-400 font-mono font-bold mr-2">
                            #{player.number}
                          </span>
                          {player.name}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openShotChart(player)}
                            className="text-sm text-sky-400 hover:text-sky-300 px-2 py-1"
                          >
                            詳細
                          </button>
                          <button
                            onClick={() => startEditPlayer(player)}
                            className="text-sm text-gray-300 hover:text-white px-2 py-1"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => deletePlayer(player.id!)}
                            className="text-sm text-red-400 hover:text-red-300 px-2 py-1"
                          >
                            削除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* 選手追加フォーム */}
              {editingTeamId === team.id! && (
                <div className="mt-4 flex gap-2">
                  <input
                    type="number"
                    value={newPlayerNumber}
                    onChange={(e) => setNewPlayerNumber(e.target.value)}
                    placeholder="番号"
                    className="w-24 bg-gray-700 text-white rounded-lg px-3 py-3 text-center placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addPlayer(team.id!)}
                    placeholder="選手名を入力"
                    className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-3 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={() => addPlayer(team.id!)}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-3 rounded-lg transition-colors whitespace-nowrap"
                  >
                    追加
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* エリア別シュート率モーダル */}
      {shotChartPlayer && (
        <div className="fixed inset-0 bg-black/85 z-50 flex flex-col">
          <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
            <div>
              <h2 className="text-base font-bold text-white">エリア別シュート率</h2>
              <p className="text-sm text-gray-400">
                <span className="text-orange-400 font-mono font-bold mr-1">#{shotChartPlayer.number}</span>
                {shotChartPlayer.name}
              </p>
            </div>
            <button
              onClick={() => setShotChartPlayer(null)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded transition-colors"
            >
              閉じる
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* 全体サマリー */}
            {(() => {
              const totalMakes = Object.values(shotChartData).reduce((a, b) => a + b.makes, 0);
              const totalAttempts = Object.values(shotChartData).reduce((a, b) => a + b.attempts, 0);
              const totalPct = totalAttempts > 0 ? Math.round((totalMakes / totalAttempts) * 100) : 0;
              return totalAttempts > 0 ? (
                <div className="bg-gray-800 rounded-xl p-4 mb-4 text-center">
                  <p className="text-xs text-gray-400 mb-1">全エリア合計</p>
                  <p className="text-2xl font-bold text-white">{totalPct}%</p>
                  <p className="text-sm text-gray-400">{totalMakes}/{totalAttempts}（成功/試投）</p>
                </div>
              ) : (
                <div className="bg-gray-800 rounded-xl p-8 mb-4 text-center">
                  <p className="text-gray-400">エリア別のシュートデータがまだありません</p>
                  <p className="text-xs text-gray-500 mt-2">試合中にコート図からシュートを記録するとデータが蓄積されます</p>
                </div>
              );
            })()}

            {/* エリア別リスト */}
            <div className="space-y-2">
              {(Object.keys(SHOT_ZONE_INFO) as ShotZone[]).map((zoneId) => {
                const info = SHOT_ZONE_INFO[zoneId];
                const st = shotChartData[zoneId];
                const makes = st?.makes || 0;
                const attempts = st?.attempts || 0;
                const misses = attempts - makes;
                const pct = attempts > 0 ? Math.round((makes / attempts) * 100) : null;

                return (
                  <div key={zoneId} className="bg-gray-800 rounded-lg px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        info.is3pt ? 'bg-purple-600/30 text-purple-400' : 'bg-sky-600/30 text-sky-400'
                      }`}>
                        {info.is3pt ? '3P' : '2P'}
                      </span>
                      <span className="text-sm text-white font-medium">{info.label}</span>
                    </div>
                    {attempts > 0 ? (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs text-gray-400">
                            成功 <span className="text-green-400 font-bold">{makes}</span>
                            {' / '}失敗 <span className="text-red-400 font-bold">{misses}</span>
                            {' / '}試投 <span className="text-white font-bold">{attempts}</span>
                          </span>
                        </div>
                        <div className={`text-lg font-bold min-w-[48px] text-right ${
                          pct !== null && pct >= 50 ? 'text-green-400' : pct !== null && pct >= 30 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {pct}%
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-600">データなし</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
