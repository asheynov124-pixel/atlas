import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { DAY_NAMES, FACES, PALETTES, RITES, SOUNDS } from '../catalog';
import { score } from '../runtime/audio';
import { go } from '../router';
import { blankAlarm, deleteAlarm, saveAlarm, useSnapshot } from '../store';
import type { Alarm, RiteKind } from '../types';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function Editor({ id }: { id: string }) {
  const { persisted, now } = useSnapshot();
  const existing = id === 'new' ? null : persisted.alarms.find((alarm) => alarm.id === id) ?? null;
  const [draft, setDraft] = useState<Alarm>(() => existing ?? blankAlarm(now));
  const [missing, setMissing] = useState(false);
  const [preview, setPreview] = useState(0);
  const [playId, setPlayId] = useState(0);
  const formId = useId();
  const deleteDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (id === 'new') {
      setDraft(blankAlarm(Date.now()));
      setMissing(false);
      return;
    }
    const found = persisted.alarms.find((alarm) => alarm.id === id);
    if (!found) {
      setMissing(true);
      return;
    }
    setDraft(found);
    setMissing(false);
    // Reload the draft only when the route changes, not on every store tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (playId === 0) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setPreview(1);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const next = Math.min(1, (time - start) / 15000);
      setPreview(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playId]);

  if (missing) {
    return (
      <>
        <h1>This alarm is not on the day</h1>
        <p>
          <button type="button" onClick={() => go('/alarms')}>
            Back to alarms
          </button>
        </p>
      </>
    );
  }

  function patch(partial: Partial<Alarm>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      form.querySelector<HTMLElement>(':user-invalid, :invalid')?.focus();
      return;
    }
    saveAlarm({
      ...draft,
      label: draft.label.trim() || 'Alarm',
      preludeMinutes: Math.min(30, Math.max(0, Math.round(draft.preludeMinutes))),
      volume: Math.min(1, Math.max(0, draft.volume)),
      snooze: {
        ...draft.snooze,
        minutes: Math.min(30, Math.max(1, Math.round(draft.snooze.minutes))),
        max: Math.min(10, Math.max(1, Math.round(draft.snooze.max))),
      },
      rite: { ...draft.rite, phrase: draft.rite.phrase.trim() || 'I am awake' },
    });
    go('/alarms');
  }

  const labelId = `${formId}-label`;
  const timeId = `${formId}-time`;

  return (
    <>
      <h1>{existing ? draft.label || 'Alarm' : 'New alarm'}</h1>
      <form aria-labelledby="editor-title" onSubmit={onSubmit} noValidate={false}>
        <h2 id="editor-title" className="visually-hidden">
          Alarm score
        </h2>
        <div className="field">
          <label htmlFor={labelId}>Name</label>
          <input id={labelId} name="label" required value={draft.label} onChange={(event) => patch({ label: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={timeId}>Time</label>
          <input
            id={timeId}
            name="time"
            type="time"
            required
            value={`${pad(draft.hour)}:${pad(draft.minute)}`}
            onChange={(event) => {
              const [hour, minute] = event.target.value.split(':').map(Number);
              if (Number.isFinite(hour) && Number.isFinite(minute)) patch({ hour, minute });
            }}
          />
        </div>
        <label className="check">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
          Enabled
        </label>
        <fieldset>
          <legend>Repeat</legend>
          {DAY_NAMES.map((name, index) => (
            <label key={name}>
              <input
                type="checkbox"
                checked={draft.repeat.includes(index)}
                onChange={(event) => {
                  const repeat = event.target.checked
                    ? [...draft.repeat, index].sort((a, b) => a - b)
                    : draft.repeat.filter((day) => day !== index);
                  patch({ repeat });
                }}
              />
              {name}
            </label>
          ))}
        </fieldset>
        <p className="hint">Leave every day clear for a once-only alarm.</p>
        <div className="field">
          <label htmlFor={`${formId}-prelude`}>Lead-in, {draft.preludeMinutes} minutes</label>
          <input
            id={`${formId}-prelude`}
            type="range"
            min={0}
            max={30}
            step={1}
            value={draft.preludeMinutes}
            onChange={(event) => patch({ preludeMinutes: Number(event.target.value) })}
          />
        </div>
        <fieldset>
          <legend>Sound</legend>
          {SOUNDS.map((sound) => (
            <label key={sound.id}>
              <input
                type="radio"
                name="sound"
                checked={draft.soundId === sound.id}
                onChange={() => patch({ soundId: sound.id })}
              />
              {sound.name}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor={`${formId}-volume`}>Volume, {Math.round(draft.volume * 100)}</label>
          <input
            id={`${formId}-volume`}
            type="range"
            min={0}
            max={100}
            value={Math.round(draft.volume * 100)}
            onChange={(event) => patch({ volume: Number(event.target.value) / 100 })}
          />
        </div>
        <div className="rise-swatch" style={{ ['--rise' as string]: String(preview) }} aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            setPreview(0);
            setPlayId((value) => value + 1);
            score.preview(draft.soundId, draft.volume);
          }}
        >
          Preview score (15s)
        </button>
        <fieldset>
          <legend>Snooze</legend>
          <label>
            <input
              type="checkbox"
              checked={draft.snooze.enabled}
              onChange={(event) => patch({ snooze: { ...draft.snooze, enabled: event.target.checked } })}
            />
            Allow snooze
          </label>
          <div className="field">
            <label htmlFor={`${formId}-snooze-min`}>Minutes</label>
            <input
              id={`${formId}-snooze-min`}
              type="text"
              inputMode="numeric"
              value={String(draft.snooze.minutes)}
              onChange={(event) => patch({ snooze: { ...draft.snooze, minutes: Number(event.target.value) || 1 } })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${formId}-snooze-max`}>Maximum</label>
            <input
              id={`${formId}-snooze-max`}
              type="text"
              inputMode="numeric"
              value={String(draft.snooze.max)}
              onChange={(event) => patch({ snooze: { ...draft.snooze, max: Number(event.target.value) || 1 } })}
            />
          </div>
          <label>
            <input
              type="checkbox"
              checked={draft.snooze.escalate}
              onChange={(event) => patch({ snooze: { ...draft.snooze, escalate: event.target.checked } })}
            />
            Lengthen each snooze
          </label>
        </fieldset>
        <fieldset>
          <legend>Rite</legend>
          {RITES.map((rite) => (
            <label key={rite.id}>
              <input
                type="radio"
                name="rite"
                checked={draft.rite.kind === rite.id}
                onChange={() => patch({ rite: { ...draft.rite, kind: rite.id as RiteKind } })}
              />
              {rite.name}
            </label>
          ))}
        </fieldset>
        {draft.rite.kind === 'phrase' ? (
          <div className="field">
            <label htmlFor={`${formId}-phrase`}>Phrase</label>
            <input
              id={`${formId}-phrase`}
              required
              value={draft.rite.phrase}
              onChange={(event) => patch({ rite: { ...draft.rite, phrase: event.target.value } })}
            />
          </div>
        ) : null}
        {draft.rite.kind === 'math' || draft.rite.kind === 'sequence' ? (
          <fieldset>
            <legend>Difficulty</legend>
            {([1, 2, 3] as const).map((level) => (
              <label key={level}>
                <input
                  type="radio"
                  name="difficulty"
                  checked={draft.rite.difficulty === level}
                  onChange={() => patch({ rite: { ...draft.rite, difficulty: level } })}
                />
                {level}
              </label>
            ))}
          </fieldset>
        ) : null}
        <fieldset>
          <legend>Ringing face</legend>
          {FACES.map((face) => (
            <label key={face.id}>
              <input type="radio" name="ring-face" checked={draft.faceId === face.id} onChange={() => patch({ faceId: face.id })} />
              {face.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Ringing palette</legend>
          {PALETTES.map((palette) => (
            <label key={palette.id}>
              <input
                type="radio"
                name="ring-palette"
                checked={draft.paletteId === palette.id}
                onChange={() => patch({ paletteId: palette.id })}
              />
              {palette.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Scenes</legend>
          {persisted.scenes.map((scene) => (
            <label key={scene.id}>
              <input
                type="checkbox"
                checked={draft.sceneIds.includes(scene.id)}
                onChange={(event) => {
                  const sceneIds = event.target.checked
                    ? [...draft.sceneIds, scene.id]
                    : draft.sceneIds.filter((item) => item !== scene.id);
                  patch({ sceneIds });
                }}
              />
              {scene.name}
            </label>
          ))}
        </fieldset>
        <div className="actions">
          <button type="submit" className="primary">
            Save alarm
          </button>
          {existing ? (
            <button type="button" onClick={() => deleteDialog.current?.showModal()}>
              Delete alarm
            </button>
          ) : null}
        </div>
      </form>
      <dialog
        className="confirm"
        aria-labelledby="delete-title"
        ref={deleteDialog}
        onClose={(event) => {
          const node = event.currentTarget;
          if (node.returnValue === 'delete' && existing) {
            deleteAlarm(existing.id);
            go('/alarms');
          }
          node.returnValue = '';
        }}
      >
        <h2 id="delete-title">Delete {draft.label || 'this alarm'}?</h2>
        <p>This removes it from the day.</p>
        <form method="dialog">
          <button value="cancel" autoFocus>
            Keep alarm
          </button>
          <button value="delete" className="primary">
            Delete alarm
          </button>
        </form>
      </dialog>
    </>
  );
}
