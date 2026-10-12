import { useEffect, useState } from 'react';
import { checkAccess, unlockSite } from '../services/regionApi';

/* Checks preview access on mount, shows a locked password form when required, and exposes clear checking, submitting, and error states. */
export default function AccessGate({ children }) {
  const [status, setStatus] = useState('checking');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    checkAccess(controller.signal)
      .then(result => setStatus(result.authenticated ? 'unlocked' : 'locked'))
      .catch(error => {
        if (error.name !== 'AbortError') {
          setMessage(error.message);
          setStatus('locked');
        }
      });
    return () => controller.abort();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('submitting');
    setMessage('');

    try {
      await unlockSite(password);
      setPassword('');
      setStatus('unlocked');
    } catch (error) {
      setMessage(error.message);
      setStatus('locked');
    }
  }

  if (status === 'unlocked') return children;

  return (
    <main className="access-page">
      <section className="access-card" aria-labelledby="access-title">
        <span className="access-mark" aria-hidden="true">AU</span>
        <p className="eyebrow">AUSTRALIA 2050</p>
        <h1 id="access-title">Private preview</h1>
        <p className="access-intro">Enter the shared password to view this website.</p>
        {status === 'checking' ? (
          <p className="access-status" role="status">Checking access…</p>
        ) : (
          <form className="access-form" onSubmit={handleSubmit}>
            <label htmlFor="site-password">Password</label>
            <input
              id="site-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={status === 'submitting'}
              required
              autoFocus
            />
            {message && <p className="access-error" role="alert">{message}</p>}
            <button className="button primary" type="submit" disabled={status === 'submitting'}>
              {status === 'submitting' ? 'Checking…' : 'Open website'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
