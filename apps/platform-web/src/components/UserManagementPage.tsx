import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createPlatformUser,
  deletePlatformUser,
  listPlatformUsers,
  resetPlatformUserPassword,
  updatePlatformUser,
  type AuthUser,
  type PlatformUser,
} from '../api/client';
import { EmptyState } from './EmptyState';
import { Badge, ConfirmDialog, Metric, PageHeader, formatDateTime } from './shared';

type UserForm = {
  email: string;
  name: string;
  password: string;
  role: AuthUser['role'];
  disabled: boolean;
};

const emptyForm: UserForm = {
  email: '',
  name: '',
  password: '',
  role: 'user',
  disabled: false,
};

export function UserManagementPage({
  currentUser,
  onCurrentUserChange,
}: {
  currentUser: AuthUser | null;
  onCurrentUserChange: (user: AuthUser) => void;
}) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const isEditing = Boolean(selectedUser);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((user) => user.role === 'admin').length,
    disabled: users.filter((user) => user.disabled).length,
    local: users.filter((user) => user.hasPassword).length,
  }), [users]);

  useEffect(() => {
    void refreshUsers();
  }, []);

  async function refreshUsers() {
    setLoading(true);
    setError('');
    try {
      const result = await listPlatformUsers();
      setUsers(result.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取用户失败');
    } finally {
      setLoading(false);
    }
  }

  function selectUser(user: PlatformUser) {
    setSelectedUserId(user.id);
    setForm({
      email: user.email,
      name: user.name,
      password: '',
      role: user.role,
      disabled: user.disabled,
    });
    setMessage('');
    setError('');
  }

  function startCreate() {
    setSelectedUserId('');
    setForm(emptyForm);
    setMessage('');
    setError('');
  }

  function applyUserUpdate(nextUser: PlatformUser, nextCurrentUser?: AuthUser) {
    setUsers((current) => {
      const exists = current.some((user) => user.id === nextUser.id);
      const next = exists
        ? current.map((user) => user.id === nextUser.id ? nextUser : user)
        : [nextUser, ...current];
      return next.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.email.localeCompare(b.email));
    });
    if (nextCurrentUser) {
      onCurrentUserChange(nextCurrentUser);
    }
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (selectedUser) {
        const result = await updatePlatformUser(selectedUser.id, {
          name: form.name.trim() || form.email.trim(),
          role: form.role,
          disabled: form.disabled,
        });
        applyUserUpdate(result.user, result.currentUser);
        setMessage('用户信息已更新');
      } else {
        const result = await createPlatformUser({
          email: form.email.trim(),
          name: form.name.trim() || form.email.trim(),
          password: form.password,
          role: form.role,
          disabled: form.disabled,
        });
        applyUserUpdate(result.user, result.currentUser);
        setSelectedUserId(result.user.id);
        setForm((current) => ({ ...current, email: result.user.email, name: result.user.name, password: '' }));
        setMessage('用户已创建');
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存用户失败');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDisabled(user: PlatformUser) {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await updatePlatformUser(user.id, { disabled: !user.disabled });
      applyUserUpdate(result.user, result.currentUser);
      if (selectedUserId === user.id) {
        setForm((current) => ({ ...current, disabled: result.user.disabled }));
      }
      setMessage(result.user.disabled ? '用户已禁用' : '用户已启用');
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : '状态更新失败');
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!selectedUser || form.password.length < 6) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const user = await resetPlatformUserPassword(selectedUser.id, form.password);
      applyUserUpdate(user);
      setForm((current) => ({ ...current, password: '' }));
      setMessage('密码已重置');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : '密码重置失败');
    } finally {
      setSaving(false);
    }
  }

  async function removeUser() {
    if (!selectedUser || selectedUser.id === currentUser?.id) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await deletePlatformUser(selectedUser.id);
      setUsers((current) => current.filter((user) => user.id !== selectedUser.id));
      startCreate();
      setDeleteDialogOpen(false);
      setMessage('用户已删除');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除用户失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page user-page">
      <PageHeader
        eyebrow="Users"
        title="用户管理"
        description="维护平台账号，内置管理员和普通用户两类角色。"
        actions={<button className="primary" type="button" onClick={startCreate}>新增用户</button>}
      />

      <section className="info-grid">
        <Metric label="用户总数" value={stats.total} />
        <Metric label="管理员" value={stats.admins} />
        <Metric label="已禁用" value={stats.disabled} />
        <Metric label="本地账号" value={stats.local} />
      </section>

      <section className="user-layout">
        <div className="user-list-panel">
          {loading ? (
            <EmptyState type="loading" title="正在读取用户" ariaLabel="用户加载中" />
          ) : users.length ? (
            users.map((user) => (
              <button
                className={selectedUserId === user.id ? 'user-row active' : 'user-row'}
                key={user.id}
                type="button"
                onClick={() => selectUser(user)}
              >
                <span className="skill-icon">{initials(user.name || user.email)}</span>
                <span className="user-main">
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
                <span className="user-badges">
                  <Badge status={roleLabel(user.role)} />
                  <Badge status={user.disabled ? '停用' : '启用'} />
                </span>
                <span className="user-date">{formatDateTime(user.updatedAt || user.createdAt)}</span>
              </button>
            ))
          ) : (
            <EmptyState type="no-data" title="暂无用户" description="新增用户后会显示在这里。" ariaLabel="没有用户" />
          )}
        </div>

        <form className="form-card user-form" onSubmit={submitUser}>
          <h2>{isEditing ? '编辑用户' : '新增用户'}</h2>
          <label>
            <span>邮箱</span>
            <input
              autoComplete="username"
              disabled={isEditing || saving}
              placeholder="name@company.com"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
          </label>
          <label>
            <span>姓名</span>
            <input
              disabled={saving}
              placeholder="用户姓名"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <div className="form-grid">
            <label>
              <span>角色</span>
              <select
                disabled={saving}
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as AuthUser['role'] }))}
              >
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </label>
            <label>
              <span>账号状态</span>
              <select
                disabled={saving}
                value={form.disabled ? 'disabled' : 'enabled'}
                onChange={(event) => setForm((current) => ({ ...current, disabled: event.target.value === 'disabled' }))}
              >
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
          </div>
          <label>
            <span>{isEditing ? '新密码' : '初始密码'}</span>
            <input
              autoComplete={isEditing ? 'new-password' : 'new-password'}
              disabled={saving}
              placeholder={isEditing ? '至少 6 位，留空则不修改' : '至少 6 位'}
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
          <div className="user-form-actions">
            <button className="primary" type="submit" disabled={saving || !form.email.trim() || (!isEditing && form.password.length < 6)}>
              {saving ? '保存中...' : isEditing ? '保存用户' : '创建用户'}
            </button>
            {selectedUser ? (
              <>
                <button type="button" disabled={saving || form.password.length < 6} onClick={() => void resetPassword()}>重置密码</button>
                <button className="danger" type="button" disabled={saving || selectedUser.id === currentUser?.id} onClick={() => void toggleDisabled(selectedUser)}>
                  {selectedUser.disabled ? '启用账号' : '禁用账号'}
                </button>
                <button className="danger" type="button" disabled={saving || selectedUser.id === currentUser?.id} onClick={() => setDeleteDialogOpen(true)}>
                  删除用户
                </button>
              </>
            ) : null}
          </div>
          <div className="role-note">
            <strong>角色说明</strong>
            <p>管理员可管理源、发布/删除包、维护用户；普通用户可浏览、上传并维护自己的技能包。</p>
          </div>
          {message ? <div className="form-feedback ok">{message}</div> : null}
          {error ? <EmptyState type="error" title="操作失败" description={error} ariaLabel="用户管理错误" /> : null}
        </form>
      </section>
      <ConfirmDialog
        open={deleteDialogOpen && Boolean(selectedUser)}
        eyebrow="Delete"
        title={selectedUser ? `删除 ${selectedUser.email}` : '删除用户'}
        description="该账号会从平台用户列表中移除，之后无法再用此账号登录。"
        detail="此操作不可恢复，请确认不是当前登录账号。"
        confirmLabel="确认删除"
        tone="danger"
        busy={saving}
        onCancel={() => {
          if (!saving) setDeleteDialogOpen(false);
        }}
        onConfirm={() => void removeUser()}
      />
    </div>
  );
}

function initials(value: string): string {
  const trimmed = value.trim();
  return (trimmed.slice(0, 2) || 'U').toUpperCase();
}

function roleLabel(role: AuthUser['role']): string {
  return role === 'admin' ? '管理员' : '普通用户';
}
