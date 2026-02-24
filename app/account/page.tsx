'use client';

import { useState } from 'react';
import { useAuth } from '../AuthProvider';
import { changePasscode } from '@/lib/workspace';

export default function AccountPage() {
  const { workspace, logout } = useAuth();
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('error');
  const [loading, setLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');

    if (!currentPass) {
      setMessage('現在のパスワードを入力してください');
      setMessageType('error');
      return;
    }
    if (newPass.length < 4) {
      setMessage('新しいパスワードは4文字以上で設定してください');
      setMessageType('error');
      return;
    }
    if (newPass !== confirmPass) {
      setMessage('新しいパスワードが一致しません');
      setMessageType('error');
      return;
    }

    setLoading(true);
    try {
      const success = await changePasscode(workspace!.id, currentPass, newPass);
      if (success) {
        setMessage('パスワードを変更しました');
        setMessageType('success');
        setCurrentPass('');
        setNewPass('');
        setConfirmPass('');
      } else {
        setMessage('現在のパスワードが正しくありません');
        setMessageType('error');
      }
    } catch {
      setMessage('エラーが発生しました');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }

  if (!workspace) return null;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">アカウント設定</h1>

      {/* アカウント情報 */}
      <div className="bg-gray-800 rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">アカウント情報</h2>
        <div className="space-y-3">
          <div className="flex items-center">
            <span className="text-gray-400 w-32 text-sm">アカウント名</span>
            <span className="text-white font-bold text-lg">{workspace.name}</span>
          </div>
          <div className="flex items-center">
            <span className="text-gray-400 w-32 text-sm">パスワード</span>
            <span className="text-gray-400 tracking-widest">********</span>
          </div>
        </div>
      </div>

      {/* パスワード変更 */}
      <div className="bg-gray-800 rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">パスワードを変更</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">現在のパスワード</label>
            <input
              type="password"
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">新しいパスワード</label>
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="4文字以上"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">新しいパスワード（確認）</label>
            <input
              type="password"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoComplete="off"
            />
          </div>

          {message && (
            <p className={`text-sm text-center ${messageType === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg transition-colors"
          >
            {loading ? '処理中...' : 'パスワードを変更する'}
          </button>
        </form>
      </div>

      {/* ログアウト */}
      <div className="bg-gray-800 rounded-xl p-5">
        <button
          onClick={logout}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
