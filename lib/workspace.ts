// ワークスペース（簡易アカウント）管理

export interface Workspace {
  id: string;
  name: string;
  passcodeHash: string;
  createdAt: string;
}

const STORAGE_KEY = 'bbs_workspaces';
const SESSION_KEY = 'bbs_current_workspace';

// 簡易ハッシュ（SHA-256）
async function hashPasscode(passcode: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(passcode);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getWorkspaces(): Workspace[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveWorkspaces(workspaces: Workspace[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
}

// ワークスペース一覧取得
export function listWorkspaces(): Workspace[] {
  return getWorkspaces();
}

// 新規ワークスペース作成
export async function createWorkspace(name: string, passcode: string): Promise<Workspace> {
  const workspaces = getWorkspaces();
  if (workspaces.some(w => w.name === name)) {
    throw new Error('同じ名前のワークスペースが既に存在します');
  }
  const id = crypto.randomUUID();
  const ws: Workspace = {
    id,
    name,
    passcodeHash: await hashPasscode(passcode),
    createdAt: new Date().toISOString(),
  };
  workspaces.push(ws);
  saveWorkspaces(workspaces);
  return ws;
}

// ログイン検証
export async function verifyWorkspace(name: string, passcode: string): Promise<Workspace | null> {
  const workspaces = getWorkspaces();
  const ws = workspaces.find(w => w.name === name);
  if (!ws) return null;
  const hash = await hashPasscode(passcode);
  if (ws.passcodeHash !== hash) return null;
  return ws;
}

// セッション管理
export function getCurrentWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_KEY);
}

export function setCurrentWorkspaceId(id: string) {
  localStorage.setItem(SESSION_KEY, id);
}

export function getCurrentWorkspace(): Workspace | null {
  const id = getCurrentWorkspaceId();
  if (!id) return null;
  return getWorkspaces().find(w => w.id === id) || null;
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}
