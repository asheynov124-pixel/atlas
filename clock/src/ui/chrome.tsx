import type { MouseEvent, ReactNode } from 'react';
import { go } from '../router';
import type { Mark } from '../engine/present';

const NAV = [
  { to: '/', name: 'now', label: 'Now' },
  { to: '/alarms', name: 'alarms', label: 'Alarms' },
  { to: '/sleep', name: 'sleep', label: 'Sleep' },
  { to: '/timer', name: 'timer', label: 'Timer' },
  { to: '/stopwatch', name: 'stopwatch', label: 'Stopwatch' },
  { to: '/world', name: 'world', label: 'World' },
] as const;

export function Link({ to, children, current }: { to: string; children: ReactNode; current?: boolean }) {
  return (
    <a
      href={to}
      aria-current={current ? 'page' : undefined}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        go(to);
      }}
    >
      {children}
    </a>
  );
}

export function Shell({
  route,
  rise,
  bedside,
  onLeave,
  aside,
  children,
}: {
  route: string;
  rise: number;
  bedside: boolean;
  onLeave: () => void;
  aside: ReactNode;
  children: ReactNode;
}) {
  const className = ['shell', bedside ? 'bedside' : '', rise >= 1 ? 'at-wake' : ''].filter(Boolean).join(' ');
  return (
    <div className={className} style={{ ['--rise' as string]: String(rise) }}>
      <a className="skip" href="#clock">
        Skip to the clock
      </a>
      <nav className="rail" aria-label="Clock">
        <Link to="/">
          <span className="brand">Prelude</span>
        </Link>
        {NAV.map((item) => (
          <Link key={item.to} to={item.to} current={route === item.name || (item.name === 'alarms' && route === 'alarm')}>
            {item.label}
          </Link>
        ))}
      </nav>
      <main id="clock">
        {bedside ? (
          <p className="bedside-bar">
            <button type="button" onClick={onLeave}>
              Leave bedside
            </button>
          </p>
        ) : null}
        {children}
      </main>
      <aside className="facts">{aside}</aside>
    </div>
  );
}

export function DayRibbon({
  marks,
  now,
  span,
  leg,
}: {
  marks: Mark[];
  now: number;
  span?: { startMin: number; endMin: number } | null;
  leg?: { startMin: number; endMin: number } | null;
}) {
  const date = new Date(now);
  const minute = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const described = marks.map((mark) => `${mark.name}, ${mark.status}`).join('. ');
  return (
    <div
      className="ribbon"
      role="img"
      aria-label={`Day ribbon. Now is ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. ${described}`}
    >
      <div className="cells" aria-hidden="true">
        {Array.from({ length: 24 }, (_, hour) => (
          <i key={hour} />
        ))}
      </div>
      {span ? (
        <div
          className="span"
          style={{ left: `${(span.startMin / 1440) * 100}%`, width: `${((span.endMin - span.startMin) / 1440) * 100}%` }}
        />
      ) : null}
      {leg && leg.endMin > leg.startMin ? (
        <div
          className="leg"
          style={{ left: `${(leg.startMin / 1440) * 100}%`, width: `${((leg.endMin - leg.startMin) / 1440) * 100}%` }}
        />
      ) : null}
      {marks.map((mark) => (
        <span key={mark.id} className={`mark mark-${mark.kind}`} style={{ left: `${(mark.minute / 1440) * 100}%` }} />
      ))}
      <span className="seal" style={{ left: `${(minute / 1440) * 100}%` }} />
    </div>
  );
}

export function Face({
  face,
  text,
  now,
  showSeconds,
  marks,
}: {
  face: string;
  text: string;
  now: number;
  showSeconds: boolean;
  marks: Mark[];
}) {
  if (face === 'dial') {
    const date = new Date(now);
    const hours = date.getHours() % 12;
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const hourAngle = hours * 30 + minutes * 0.5;
    const minuteAngle = minutes * 6 + seconds * 0.1;
    const secondAngle = seconds * 6;
    const line = (angle: number, length: number) => {
      const rad = ((angle - 90) * Math.PI) / 180;
      return { x2: 100 + Math.cos(rad) * length, y2: 100 + Math.sin(rad) * length };
    };
    const hour = line(hourAngle, 46);
    const minuteHand = line(minuteAngle, 68);
    const second = line(secondAngle, 74);
    return (
      <svg className="dial" viewBox="0 0 200 200" role="img" aria-label={text}>
        <circle cx="100" cy="100" r="92" />
        {Array.from({ length: 12 }, (_, index) => {
          const rad = ((index * 30 - 90) * Math.PI) / 180;
          return <circle key={index} cx={100 + Math.cos(rad) * 78} cy={100 + Math.sin(rad) * 78} r="1.6" />;
        })}
        {marks
          .filter((mark) => mark.kind === 'alarm')
          .map((mark) => {
            const rad = (((mark.minute / 1440) * 360 - 90) * Math.PI) / 180;
            return <circle key={mark.id} className="tick" cx={100 + Math.cos(rad) * 86} cy={100 + Math.sin(rad) * 86} r="2.4" />;
          })}
        <line x1="100" y1="100" x2={hour.x2} y2={hour.y2} className="hand hour" />
        <line x1="100" y1="100" x2={minuteHand.x2} y2={minuteHand.y2} className="hand minute" />
        {showSeconds ? <line x1="100" y1="100" x2={second.x2} y2={second.y2} className="hand second" /> : null}
      </svg>
    );
  }
  return <p className={face === 'ribbon' ? 'numeral-md' : 'numeral-lg'}>{text}</p>;
}
