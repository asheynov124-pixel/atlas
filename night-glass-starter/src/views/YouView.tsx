/** You: who you are, what you've done, and the settings. */
import { useState } from 'react';
import { APP } from '../app/config';
import { VERBS } from '../app/verbs';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { ToggleRow } from '../ui/common';

export function YouView() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const judgments = useStore((s) => s.judgments);
  const saves = useStore((s) => s.saves.length);
  const [confirm, setConfirm] = useState(false);
  const values = Object.values(judgments);
  const likes = values.filter((v) => v === 'like').length;
  const passes = values.length - likes;

  return (
    <div className="page">
      <div className="page__head">
        <h1>You</h1>
      </div>
      <section className="section" aria-labelledby="you-profile">
        <div className="section__head">
          <h2 id="you-profile">{APP.profileName}</h2>
          <span className="subhead">On this device</span>
        </div>
        <div className="stats">
          <div className="stat stat--like" data-verb="like">
            <b>{likes}</b>
            <small>{VERBS.like.done}</small>
          </div>
          <div className="stat stat--pass" data-verb="pass">
            <b>{passes}</b>
            <small>{VERBS.pass.done}</small>
          </div>
          <div className="stat stat--save" data-verb="save">
            <b>{saves}</b>
            <small>{VERBS.save.done}</small>
          </div>
        </div>
      </section>
      <section className="section" aria-labelledby="you-settings">
        <div className="section__head">
          <h2 id="you-settings">Settings</h2>
        </div>
        <div>
          <ToggleRow label="Haptics" hint="A light tap when a swipe lands" checked={settings.haptics} onChange={(haptics) => setSettings({ haptics })} />
          <ToggleRow label="Classic swipes" hint="Up and down move between cards" checked={settings.classic} onChange={(classic) => setSettings({ classic })} />
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => useUI.getState().openSheet({ kind: 'gestures' })}>
            How swiping works
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => useStore.getState().showWelcome()}>
            Show the welcome again
          </button>
        </div>
      </section>
      <section className="section" aria-labelledby="you-data">
        <div className="section__head">
          <h2 id="you-data">Your data</h2>
        </div>
        <p className="muted small">Likes, saves, and history are stored only in this browser. Resetting clears them for good.</p>
        <div className="row" data-tone="danger">
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (!confirm) return setConfirm(true);
              useStore.getState().reset();
              setConfirm(false);
              useUI.getState().toast({ text: 'Everything was reset' });
            }}
          >
            {confirm ? 'Tap again to reset everything' : 'Reset everything'}
          </button>
          {confirm && (
            <button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>
              Keep my data
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
