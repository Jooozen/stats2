'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, type Team, type Player } from '@/lib/db';

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
    </div>
  );
}
