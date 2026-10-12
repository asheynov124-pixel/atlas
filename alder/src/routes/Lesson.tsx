import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { lesson, LESSONS } from '../data/lessons';
import { catalogItem } from '../data/catalog';
import { useStore } from '../lib/store';
import { Button, Kicker, Img, Chip } from '../components/ui';
import { fmtRange } from '../lib/takeoff';
import { parseIdea } from '../lib/parse';

export default function LessonPage() {
  const { lessonId = '' } = useParams();
  const l = lesson(lessonId);
  const nav = useNavigate();
  const markLesson = useStore((s) => s.markLesson);
  const patchStudio = useStore((s) => s.patchStudio);
  const saveItem = useStore((s) => s.saveItem);
  const setQuizScore = useStore((s) => s.setQuizScore);
  const customs = useStore((s) => s.customs);
  const studio = useStore((s) => s.studio);
  const ownWall = customs.find((c) => c.kind === 'color' && c.id === studio.wall);
  const ownPieces = customs.filter((c) => c.kind !== 'color').flatMap((c) => parseIdea(c.text).pieces ?? []);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  useEffect(() => { if (l) markLesson(l.id); setAnswers({}); }, [l?.id]);
  if (!l) return <p className="p-6 text-muted">No such lesson.</p>;
  const idx = LESSONS.findIndex((x) => x.id === l.id);
  const next = LESSONS[(idx + 1) % LESSONS.length];
  const related = l.related.map((id) => catalogItem(id)).filter((x) => x != null);
  const answered = l.quiz ? Object.keys(answers).length === l.quiz.length : false;
  const score = l.quiz ? l.quiz.filter((q, i) => answers[i] === q.answer).length : 0;
  useEffect(() => { if (answered) setQuizScore(l.id, score); }, [answered]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-8">
      <Link to="/learn" className="text-sm text-oak">← All lessons</Link>
      <Img src={l.image} className="mt-4 aspect-[16/9] rounded-xl" kind={l.id === "kitchen" || l.id === "bath" ? l.id : "living"} />
      <Kicker className="mt-5">{l.kicker} · {l.minutes} min</Kicker>
      <h1 className="mt-2 display text-4xl">{l.title}</h1>
      <p className="mt-3 text-lg text-muted">{l.lede}</p>
      {l.sections.map((s) => <section key={s.heading} className="mt-6"><h2 className="display text-2xl">{s.heading}</h2><p className="mt-2 leading-relaxed">{s.body}</p></section>)}
      {l.try && (
        <section className="mt-8"><h3 className="kicker">Try it in the studio</h3>
          <div className="mt-3 flex flex-wrap gap-2">{l.try.map((t) => <Button key={t.label} kind="ghost" onClick={() => { const pieces = t.studio.pieces ? [...new Set([...t.studio.pieces, ...ownPieces])] : undefined; patchStudio({ ...t.studio, ...(pieces ? { pieces } : {}) }); nav('/studio'); }}>{t.label}</Button>)}</div>
          {(ownWall || ownPieces.length > 0) && <p className="mt-2 text-xs text-muted">Your notes come along: {[ownWall ? `${ownWall.text} stays on the walls` : '', ownPieces.length ? `${[...new Set(ownPieces)].join(', ')} stay in the room` : ''].filter(Boolean).join('; ')}.</p>}
        </section>
      )}
      {l.quiz && (
        <section className="card mt-8 p-4">
          <h3 className="kicker">Check yourself</h3>
          {l.quiz.map((q, i) => (
            <div key={i} className="mt-3">
              <p className="font-medium">{q.q}</p>
              <div className="mt-2 flex flex-wrap gap-2">{q.options.map((o, j) => <Chip key={j} on={answers[i] === j} onClick={() => setAnswers({ ...answers, [i]: j })}>{o}</Chip>)}</div>
              {answers[i] != null && <p className={`mt-2 text-sm ${answers[i] === q.answer ? 'text-good' : 'text-hmm'}`}>{answers[i] === q.answer ? 'Yes. ' : 'Not quite. '}{q.why}</p>}
            </div>
          ))}
        </section>
      )}
      {related.length > 0 && (
        <section className="mt-8"><h3 className="kicker">Pieces this lesson talks about</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{related.map((c) => <Link key={c.id} to={`/catalog?piece=${c.id}`} className="flex gap-3 rounded-xl bg-surface p-2"><Img src={c.image} className="size-16 rounded-xl" kind={c.rooms[0]} /><span><span className="block font-medium">{c.name}</span><span className="text-sm text-muted">{fmtRange(c.price)}</span></span></Link>)}</div>
        </section>
      )}
      <div className="mt-8 flex flex-wrap gap-2">
        <Button kind="ghost" onClick={() => saveItem({ kind: 'lesson', title: l.title, subtitle: l.kicker, body: l.lede, image: l.image })}>Save to a board</Button>
        <Button onClick={() => nav(`/learn/${next.id}`)}>Next: {next.title}</Button>
      </div>
    </div>
  );
}
