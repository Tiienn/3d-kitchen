import { useState } from "react";
import { useConfigurator } from "../store/useConfigurator";

/**
 * Left sidebar: the localStorage-backed project list. Create / load / rename /
 * delete. The active project is highlighted and auto-saved on every change
 * (handled in the store). Collapsible for narrow widths.
 */
export function ProjectSidebar({
  onCloseMobile,
}: {
  onCloseMobile?: () => void;
}) {
  const projects = useConfigurator((s) => s.projects);
  const activeProjectId = useConfigurator((s) => s.activeProjectId);
  const createProject = useConfigurator((s) => s.createProject);
  const loadProject = useConfigurator((s) => s.loadProject);
  const renameProject = useConfigurator((s) => s.renameProject);
  const deleteProject = useConfigurator((s) => s.deleteProject);
  const sharedMode = useConfigurator((s) => s.sharedMode);

  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const commitCreate = () => {
    createProject(newName);
    setNewName("");
    setCreating(false);
  };

  const commitRename = (id: string) => {
    if (renameValue.trim()) renameProject(id, renameValue);
    setRenamingId(null);
  };

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button
          type="button"
          className="sidebar-toggle"
          title="Show projects"
          onClick={() => setCollapsed(false)}
        >
          ☰
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h2 className="panel-heading">Projects</h2>
        {/* Desktop: collapse the rail. */}
        <button
          type="button"
          className="sidebar-toggle"
          title="Hide projects"
          onClick={() => setCollapsed(true)}
        >
          ‹
        </button>
        {/* Mobile: close the drawer. */}
        <button
          type="button"
          className="drawer-close"
          title="Close"
          aria-label="Close projects panel"
          onClick={onCloseMobile}
        >
          ✕
        </button>
      </div>

      <ul className="project-list">
        {projects.map((p) => {
          const isActive = !sharedMode && p.id === activeProjectId;
          const isRenaming = renamingId === p.id;
          return (
            <li
              key={p.id}
              className={`project-item${isActive ? " is-active" : ""}`}
            >
              {isRenaming ? (
                <input
                  className="project-rename-input"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(p.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="project-name"
                    onClick={() => loadProject(p.id)}
                    onDoubleClick={() => {
                      setRenamingId(p.id);
                      setRenameValue(p.name);
                    }}
                    title={p.name}
                  >
                    {p.name}
                  </button>
                  <span className="project-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="Rename"
                      onClick={() => {
                        setRenamingId(p.id);
                        setRenameValue(p.name);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Delete"
                      onClick={() => {
                        if (
                          window.confirm(`Delete project “${p.name}”?`)
                        ) {
                          deleteProject(p.id);
                        }
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {creating ? (
        <div className="project-create">
          <input
            className="project-rename-input"
            autoFocus
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
          />
          <button type="button" className="mini-button" onClick={commitCreate}>
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="new-project-button"
          onClick={() => setCreating(true)}
        >
          + New project
        </button>
      )}
    </aside>
  );
}
