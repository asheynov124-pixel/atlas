export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = '/', error } = await searchParams;
  const configured = !!process.env.APP_PASSWORD;
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--dark)', color: '#EEEAE1', padding: 24 }}>
      <form method="post" action="/api/auth" style={{ width: '100%', maxWidth: 380 }}>
        <div className="wordmark" style={{ fontSize: 28 }}>MODUS</div>
        <div className="mono" style={{ fontSize: 11, color: '#A9AEB5', letterSpacing: '.08em', marginTop: 6 }}>Serial murder in America, graded by evidence</div>
        <p style={{ marginTop: 28, fontSize: 14.5, lineHeight: 1.5, color: '#D9D7D0' }}>{configured ? 'Private research file. Enter the app password.' : 'No app password is configured, so the file is open. Set APP_PASSWORD to lock it.'}</p>
        <input type="hidden" name="next" value={next} />
        <label htmlFor="pw" className="k" style={{ display: 'block', marginTop: 18, color: '#A9AEB5' }}>Password</label>
        <input id="pw" name="password" type="password" autoComplete="current-password" required autoFocus className="srch" style={{ maxWidth: 'none', marginTop: 8, height: 44 }} />
        {error && <p className="mono" style={{ color: '#E8A090', fontSize: 12, marginTop: 10 }}>That is not the password.</p>}
        <button type="submit" style={{ marginTop: 16, height: 44, width: '100%', background: 'var(--gold)', border: 0, color: '#14161A', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Open the file</button>
      </form>
    </main>
  );
}
