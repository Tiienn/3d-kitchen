import { KitchenScene } from "./components/KitchenScene";
import { Panel } from "./components/Panel";
import { useConfigurator } from "./store/useConfigurator";

export default function App() {
  const placeholderMode = useConfigurator((s) => s.placeholderMode);

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">Kitchen Studio — Configurator</h1>
        {placeholderMode && (
          <span className="header-note">Demo geometry — Blender model pending</span>
        )}
      </header>

      <main className="stage">
        <div className="canvas-wrap">
          <KitchenScene />
        </div>
        <Panel />
      </main>
    </div>
  );
}
