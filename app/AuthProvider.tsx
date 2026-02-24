'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { switchDatabase } from '@/lib/db';
import {
  type Workspace,
  getCurrentWorkspace,
  createWorkspace,
  verifyWorkspace,
  setCurrentWorkspaceId,
  logout as logoutFn,
} from '@/lib/workspace';

interface AuthContextType {
  workspace: Workspace | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  workspace: null,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [ready, setReady] = useState(false);

  // 初期化: 既存セッションがあればDBを切り替え
  useEffect(() => {
    const ws = getCurrentWorkspace();
    if (ws) {
      switchDatabase(ws.id);
      setWorkspace(ws);
    }
    setReady(true);
  }, []);

  const handleLogin = useCallback((ws: Workspace) => {
    switchDatabase(ws.id);
    setCurrentWorkspaceId(ws.id);
    setWorkspace(ws);
  }, []);

  const handleLogout = useCallback(() => {
    logoutFn();
    switchDatabase('');
    setWorkspace(null);
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <p className="text-gray-400 text-lg">読み込み中...</p>
      </div>
    );
  }

  if (!workspace) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <AuthContext.Provider value={{ workspace, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// ログイン画面
// ============================================================
function LoginScreen({ onLogin }: { onLogin: (ws: Workspace) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !passcode.trim()) {
      setError('ワークスペース名とパスコードを入力してください');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'register') {
        if (passcode.length < 4) {
          setError('パスコードは4文字以上で設定してください');
          setLoading(false);
          return;
        }
        const ws = await createWorkspace(name.trim(), passcode);
        onLogin(ws);
      } else {
        const ws = await verifyWorkspace(name.trim(), passcode);
        if (!ws) {
          setError('ワークスペース名またはパスコードが正しくありません');
          setLoading(false);
          return;
        }
        onLogin(ws);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-2 text-white">バスケスタッツ</h1>
        <p className="text-gray-400 text-center text-sm mb-8">
          ワークスペースでデータを管理
        </p>

        {/* タブ切替 */}
        <div className="flex mb-6 bg-gray-800 rounded-lg overflow-hidden">
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              mode === 'login' ? 'bg-orange-500 text-white' : 'text-gray-400'
            }`}
          >
            ログイン
          </button>
          <button
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              mode === 'register' ? 'bg-orange-500 text-white' : 'text-gray-400'
            }`}
          >
            新規作成
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">ワークスペース名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: チーム名、個人名など"
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">パスコード</label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder={mode === 'register' ? '4文字以上' : 'パスコードを入力'}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg transition-colors text-lg"
          >
            {loading ? '処理中...' : mode === 'register' ? '作成してはじめる' : 'ログイン'}
          </button>
        </form>

        {mode === 'register' && (
          <p className="text-gray-500 text-xs text-center mt-4">
            ワークスペースごとにデータが分離されます。同じ名前とパスコードでログインできます。
          </p>
        )}
      </div>
    </div>
  );
}
