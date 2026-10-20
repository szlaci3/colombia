import { useState } from "react";
import { Download, FolderOpen, Plus, Trash2 } from "lucide-react";
import { Dialog } from "./Dialog";
import {
  MAX_PROJECTS,
  MAX_VERSIONS,
  type Library,
  type LibraryEntry,
} from "../workspace";
import type { Project } from "../model";

const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
export function Projects({
  library,
  activeId,
  enabled,
  error,
  close,
  create,
  open,
  remove,
  saveVersion,
  restore,
  removeVersion,
  download,
}: {
  library: Library;
  activeId: string;
  enabled: boolean;
  error: string;
  close: () => void;
  create: (name: string, duplicate: boolean) => void;
  open: (id: string) => void;
  remove: (id: string) => void;
  saveVersion: (name: string) => void;
  restore: (project: Project) => void;
  removeVersion: (id: string) => void;
  download: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [versionName, setVersionName] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const current = library.entries.find((entry) => entry.id === activeId);
  function row(entry: LibraryEntry) {
    const active = entry.id === activeId;
    return (
      <li key={entry.id} className="project-row">
        <div>
          <strong>{entry.project.name}</strong>
          <small>
            {active ? "Current project · " : ""}
            {date(entry.updatedAt)} · {entry.versions.length} versions
          </small>
        </div>
        <div className="project-row-actions">
          <button
            className="button subtle"
            disabled={!enabled || active}
            aria-label={`${active ? "Open now" : "Open"} ${entry.project.name}`}
            onClick={() => open(entry.id)}
          >
            <FolderOpen size={14} />
            {active ? "Open now" : "Open"}
          </button>
          <button
            className="icon-button"
            aria-label={`Export ${entry.project.name}`}
            onClick={() => download(entry.project)}
          >
            <Download size={16} />
          </button>
          <button
            className="icon-button"
            disabled={!enabled || active}
            aria-label={`Remove ${entry.project.name}`}
            onClick={() => setConfirm(entry.id)}
          >
            <Trash2 size={16} />
          </button>
        </div>
        {confirm === entry.id && (
          <div className="project-confirm">
            <p>
              Remove “{entry.project.name}” and its versions from this device?
              Export its draft and any versions you need before removing it.
            </p>
            <button className="button subtle" onClick={() => setConfirm(null)}>
              Cancel removal
            </button>
            <button
              className="button dark"
              onClick={() => {
                remove(entry.id);
                setConfirm(null);
              }}
            >
              Remove project
            </button>
          </div>
        )}
      </li>
    );
  }
  return (
    <Dialog title="A little room for every idea." close={close} wide>
      <p className="dialog-description">
        Your projects and named versions stay on this device. Export a project
        file for a backup you can keep elsewhere.
      </p>
      {!enabled && (
        <p className="project-message" role="status">
          Keep this copy or save this draft before switching projects.
        </p>
      )}
      {error && (
        <p className="project-message" role="alert">
          {error}
        </p>
      )}
      <section className="project-section" aria-labelledby="projects-heading">
        <h3 id="projects-heading">
          Projects{" "}
          <small>
            {library.entries.length}/{MAX_PROJECTS}
          </small>
        </h3>
        <ul className="project-list">{library.entries.map(row)}</ul>
        <form
          className="project-form"
          onSubmit={(event) => {
            event.preventDefault();
            create(name.trim(), false);
          }}
        >
          <label htmlFor="new-project-name">New project name</label>
          <input
            id="new-project-name"
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="The next good idea"
          />
          <div className="project-row-actions">
            <button
              className="button dark"
              disabled={
                !enabled ||
                !name.trim() ||
                library.entries.length >= MAX_PROJECTS
              }
            >
              <Plus size={15} />
              Create project
            </button>
            <button
              type="button"
              className="button subtle"
              disabled={
                !enabled ||
                !name.trim() ||
                library.entries.length >= MAX_PROJECTS
              }
              onClick={() => create(name.trim(), true)}
            >
              Duplicate current
            </button>
          </div>
        </form>
      </section>
      <section className="project-section" aria-labelledby="versions-heading">
        <h3 id="versions-heading">
          Saved versions{" "}
          <small>
            {current?.versions.length ?? 0}/{MAX_VERSIONS}
          </small>
        </h3>
        <p className="dialog-description">
          Capture a direction before the meeting moves on. Restoring replaces
          all six templates and the shared brand; Undo brings back your working
          draft.
        </p>
        <form
          className="project-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveVersion(versionName.trim());
          }}
        >
          <label htmlFor="version-name">Version name</label>
          <input
            id="version-name"
            required
            maxLength={80}
            value={versionName}
            onChange={(event) => setVersionName(event.target.value)}
            placeholder="Before the team review"
          />
          <button
            className="button dark"
            disabled={
              !enabled ||
              !versionName.trim() ||
              (current?.versions.length ?? 0) >= MAX_VERSIONS
            }
          >
            Save version
          </button>
        </form>
        {!current?.versions.length && (
          <p className="dialog-fineprint">
            No saved versions yet. Your working draft still autosaves.
          </p>
        )}
        <ul className="project-list">
          {current?.versions.map((version) => (
            <li className="project-row" key={version.id}>
              <div>
                <strong>{version.name}</strong>
                <small>{date(version.createdAt)}</small>
              </div>
              <div className="project-row-actions">
                <button
                  className="button subtle"
                  disabled={!enabled}
                  aria-label={`Restore ${version.name}`}
                  onClick={() => restore(version.project)}
                >
                  Restore
                </button>
                <button
                  className="icon-button"
                  aria-label={`Export version ${version.name}`}
                  onClick={() => download(version.project)}
                >
                  <Download size={16} />
                </button>
                <button
                  className="icon-button"
                  disabled={!enabled}
                  aria-label={`Remove version ${version.name}`}
                  onClick={() => setConfirm(version.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {confirm === version.id && (
                <div className="project-confirm">
                  <p>
                    Remove version “{version.name}”? Your working draft stays as
                    it is.
                  </p>
                  <button
                    className="button subtle"
                    onClick={() => setConfirm(null)}
                  >
                    Cancel removal
                  </button>
                  <button
                    className="button dark"
                    onClick={() => {
                      removeVersion(version.id);
                      setConfirm(null);
                    }}
                  >
                    Remove version
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </Dialog>
  );
}
