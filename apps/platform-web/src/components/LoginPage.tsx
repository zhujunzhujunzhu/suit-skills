import { type FormEvent, useEffect, useState } from 'react';
import {
  getAuthConfig,
  loginWithExternalToken,
  loginWithPassword,
  type AuthConfig,
} from '../api/client';

export function LoginPage() {
  const [authConfig, setAuthConfig] = useState<AuthConfig>({
    enabled: true,
    scopes: [],
    apiAvailable: true,
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const nextAuthConfig = await getAuthConfig();
      if (!mounted) return;
      setAuthConfig(nextAuthConfig);

      if (nextAuthConfig.mode !== 'external-token') return;

      const url = new URL(window.location.href);
      const token = url.searchParams.get('token');
      if (!token) return;

      setError('');
      setSubmitting(true);
      try {
        await loginWithExternalToken(token);
        url.searchParams.delete('token');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        window.location.reload();
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : '外部平台登录失败');
        }
      } finally {
        if (mounted) setSubmitting(false);
      }
    }

    void initializeAuth();
    return () => {
      mounted = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await loginWithPassword(username, password);
      window.location.replace(window.location.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand login-brand">
          <span>CH</span>
          <div>
            <strong>ClawHub</strong>
            <small>登录后进入技能平台</small>
          </div>
        </div>
        <form className="login-form" onSubmit={submit}>
          {error ? <p className="form-error">登录失败：{error}</p> : null}
          {authConfig.mode === 'external-token' ? (
            <p className="form-hint">
              {submitting ? '正在验证外部平台登录...' : '请从外部平台跳转进入，链接需要携带 token。'}
            </p>
          ) : (
            <>
              <label>
                <span>用户名</span>
                <input
                  autoComplete="username"
                  disabled={!authConfig.enabled || submitting}
                  placeholder="name@company.com"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label>
                <span>密码</span>
                <input
                  autoComplete="current-password"
                  disabled={!authConfig.enabled || submitting}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={!authConfig.enabled || submitting || !username || !password}
                type="submit"
              >
                {submitting ? '登录中...' : '登录'}
              </button>
            </>
          )}
          {!authConfig.enabled ? (
            <p className="form-hint">
              {authConfig.apiAvailable
                ? '服务端尚未启用登录，请联系管理员设置登录参数。'
                : '平台 API 未启动，请先运行 npm run dev:platform-web。'}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
