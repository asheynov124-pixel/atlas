import { useState, type FormEvent } from 'react';
import { useSession } from '../state/session';

export function CommandBar() {
  const runCommand = useSession((s) => s.runCommand);
  const [value, setValue] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    runCommand(value);
    setValue('');
  }

  return (
    <form className="command-bar" onSubmit={onSubmit}>
      <span className="command-prefix" aria-hidden>
        ›
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Command or search — /lead · /depth 5 · ship loop"
        aria-label="Command bar"
      />
      <button type="submit" className="btn primary compact">
        Run
      </button>
    </form>
  );
}
