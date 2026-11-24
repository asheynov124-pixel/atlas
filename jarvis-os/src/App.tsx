import { CommandBar } from './components/CommandBar';
import { Graph } from './components/Graph';
import { Inspector } from './components/Inspector';
import { LeadPanel } from './components/LeadPanel';
import { PeekSheet } from './components/PeekSheet';

export default function App() {
  return (
    <div className="shell">
      <Inspector />
      <main className="stage">
        <Graph />
        <CommandBar />
      </main>
      <LeadPanel />
      <PeekSheet />
    </div>
  );
}
