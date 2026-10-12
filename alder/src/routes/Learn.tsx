import { Link } from 'react-router-dom';
import { LESSONS } from '../data/lessons';
import { useStore } from '../lib/store';
import { Kicker, Img } from '../components/ui';

export default function Learn() {
  const seen = useStore((s) => s.seenLessons);
  const scores = useStore((s) => s.quizScores);
  const done = LESSONS.filter((l) => seen.includes(l.id)).length;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8">
      <Kicker>Learn</Kicker>
      <h1 className="mt-2 display text-4xl">Short lessons</h1>
      <p className="mt-2 max-w-xl text-muted">Enough to argue with a contractor. Each one ends with something you can try in the studio.</p>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised"><div className="h-full bg-oak transition-all" style={{ width: `${(done / LESSONS.length) * 100}%` }} /></div>
        <span className="text-xs text-muted">{done} of {LESSONS.length} read</span>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {LESSONS.map((l) => (
          <Link key={l.id} to={`/learn/${l.id}`} className="card overflow-hidden">
            <Img src={l.image} className="aspect-[16/9]" kind={l.id === "kitchen" || l.id === "bath" ? l.id : "living"} />
            <div className="p-4">
              <p className="kicker">{l.kicker} · {l.minutes} min{seen.includes(l.id) && ' · read'}{scores[l.id] != null && ` · quiz ${scores[l.id]}/${l.quiz?.length}`}</p>
              <h2 className="mt-1 display text-2xl">{l.title}</h2>
              <p className="mt-1 text-sm text-muted">{l.lede}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
