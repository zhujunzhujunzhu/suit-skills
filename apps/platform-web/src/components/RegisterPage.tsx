import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { registerWithInvite } from '../api/client';

export function RegisterPage() {
  const token = useMemo(() => new URL(window.location.href).searchParams.get('invite') ?? '', []);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError('');
    try {
      await registerWithInvite({
        token,
        email: email.trim(),
        name: name.trim() || email.trim(),
        password,
      });
      setRegistered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell register-shell">
      <section className="login-panel register-panel">
        <div className="brand login-brand">
          <span>CH</span>
          <div>
            <strong>ClawHub</strong>
            <small>通过邀请加入技能平台</small>
          </div>
        </div>

        {registered ? (
          <div className="register-result">
            <p className="form-feedback ok">注册成功，请使用新账号登录。</p>
            <Link className="button-like primary" to="/market">去登录</Link>
          </div>
        ) : (
          <form className="login-form" onSubmit={submit}>
            {!token ? <p className="form-error">邀请链接缺少 invite 参数，请联系管理员重新生成。</p> : null}
            {error ? <p className="form-error">注册失败：{error}</p> : null}
            <label>
              <span>邮箱</span>
              <input
                autoComplete="username"
                disabled={!token || submitting}
                placeholder="name@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              <span>姓名</span>
              <input
                autoComplete="name"
                disabled={!token || submitting}
                placeholder="用户姓名"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              <span>密码</span>
              <input
                autoComplete="new-password"
                disabled={!token || submitting}
                placeholder="至少 6 位"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={!token || submitting || !email.trim() || password.length < 6}
              type="submit"
            >
              {submitting ? '注册中...' : '完成注册'}
            </button>
            <Link className="subtle-link" to="/market">已有账号，返回登录</Link>
          </form>
        )}
      </section>
    </main>
  );
}
