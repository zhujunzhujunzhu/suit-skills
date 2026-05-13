import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthConfig, loginWithPassword, type AuthConfig } from '../api/client';

export function LoginPage() {
  const navigate = useNavigate();
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
    getAuthConfig().then(setAuthConfig);
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
          <div className="form-links">
            <a href="#" className="forgot-password">忘记密码？</a>
          </div>
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
