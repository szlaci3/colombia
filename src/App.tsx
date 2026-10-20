import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Columns3,
  Download,
  ExternalLink,
  FileJson,
  Layers,
  Leaf,
  Link,
  Menu,
  Monitor,
  MousePointer2,
  PanelTop,
  Play,
  Plus,
  Redo2,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Table2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { blockNames, SortableBlock } from "./components/Blocks";
import { Dialog } from "./components/Dialog";
import { Editable } from "./components/Editable";
import { StyleImport } from "./components/StyleImport";
import {
  createBlock,
  createProject,
  historyReducer,
  moveItem,
  pageIds,
  themeIds,
  themePresets,
  uid,
  type Block,
  type BlockType,
  type PageId,
  type Project,
  type ThemeId,
} from "./model";
import {
  loadProject,
  makeShareUrl,
  MAX_PROJECT_SIZE,
  parseProject,
  saveProject,
} from "./storage";

const pages = {
  webshop: {
    title: "Webshop",
    subtitle: "A home for good things",
    icon: ShoppingBag,
    number: "01",
    description: "Thoughtful products. Your point of view.",
  },
  kanban: {
    title: "Kanban board",
    subtitle: "Make progress visible",
    icon: Columns3,
    number: "02",
    description: "A shared space for the next big idea.",
  },
  table: {
    title: "Data table",
    subtitle: "Find clarity in the details",
    icon: Table2,
    number: "03",
    description: "Bring a little order to everything.",
  },
};
const library: {
  type: BlockType;
  icon: typeof PanelTop;
  description: string;
}[] = [
  {
    type: "hero",
    icon: PanelTop,
    description: "Make a thoughtful first impression.",
  },
  {
    type: "products",
    icon: ShoppingBag,
    description: "A collection worth exploring.",
  },
  {
    type: "table",
    icon: Table2,
    description: "Give your information a little clarity.",
  },
  {
    type: "board",
    icon: Columns3,
    description: "Move ideas from maybe to made.",
  },
  {
    type: "quote",
    icon: Sparkles,
    description: "Let a happy customer do the talking.",
  },
  { type: "text", icon: Layers, description: "Tell the rest of your story." },
];
function readPage(): PageId {
  const page = new URLSearchParams(location.search).get("template");
  return pageIds.includes(page as PageId) ? (page as PageId) : "webshop";
}
function duplicateBlock(block: Block): Block {
  const copy = structuredClone(block);
  copy.id = uid();
  if (copy.type === "products")
    copy.items.forEach((item) => {
      item.id = uid();
    });
  if (copy.type === "board")
    copy.columns.forEach((column) => {
      column.id = uid();
      column.cards.forEach((card) => {
        card.id = uid();
      });
    });
  return copy;
}

export default function App() {
  const [initial] = useState(() =>
    loadProject({ getItem: (key) => localStorage.getItem(key) }, location.hash),
  );
  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initial.project,
    future: [],
  });
  const project = history.present;
  const [page, setPage] = useState<PageId>(readPage);
  const [preview, setPreview] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [inspector, setInspector] = useState<"brand" | "layers">("brand");
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<
    "share" | "library" | "help" | "reset" | "style" | null
  >(null);
  const [toast, setToast] = useState("");
  const [notice, setNotice] = useState(initial.notice ?? "");
  const [autoSave, setAutoSave] = useState(
    !initial.shared && !initial.recovered,
  );
  const [isShared, setIsShared] = useState(!!initial.shared);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saving",
  );
  const [mobileMenu, setMobileMenu] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const blocks = project.pages[page];
  const preset = project.theme.custom ?? themePresets[project.theme.preset];
  const themeStyle = {
    "--brand-accent": preset.accent,
    "--brand-surface": preset.surface,
    "--brand-ink": preset.ink,
    "--brand-soft": preset.soft,
    "--brand-radius": `${project.theme.radius}px`,
    "--brand-font":
      project.theme.font === "serif"
        ? 'Georgia, "Times New Roman", serif'
        : "Arial, Helvetica, sans-serif",
  } as CSSProperties;

  const change = useCallback(
    (edit: (draft: Project) => void) => {
      const next = structuredClone(project);
      edit(next);
      if (
        new TextEncoder().encode(JSON.stringify(next)).length > MAX_PROJECT_SIZE
      ) {
        setToast(
          "This project has reached its 750 KB limit. Remove some content or start a new project.",
        );
        return false;
      }
      dispatch({ type: "change", project: next });
      return true;
    },
    [project],
  );
  const updateBlock = (block: Block) =>
    change((draft) => {
      draft.pages[page] = draft.pages[page].map((item) =>
        item.id === block.id ? block : item,
      );
    });
  function navigate(id: PageId) {
    setPage(id);
    setSelected(null);
    setMobileMenu(false);
    const url = new URL(location.href);
    url.searchParams.set("template", id);
    window.history.pushState(null, "", url);
    canvasRef.current?.scrollTo({ top: 0 });
  }
  useEffect(() => {
    const popstate = () => {
      setPage(readPage());
      setSelected(null);
    };
    window.addEventListener("popstate", popstate);
    return () => window.removeEventListener("popstate", popstate);
  }, []);
  useEffect(() => {
    const openSnapshot = () => {
      if (!location.hash.startsWith("#project=")) return;
      const loaded = loadProject(
        { getItem: (key) => localStorage.getItem(key) },
        location.hash,
      );
      setAutoSave(!loaded.shared && !loaded.recovered);
      setIsShared(!!loaded.shared);
      dispatch({ type: "change", project: loaded.project });
      setNotice(loaded.notice ?? "");
      setSelected(null);
      setPage(readPage());
    };
    window.addEventListener("hashchange", openSnapshot);
    return () => window.removeEventListener("hashchange", openSnapshot);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!autoSave) return;
    setSaveStatus("saving");
    const save = () =>
      setSaveStatus(
        saveProject(
          { setItem: (key, value) => localStorage.setItem(key, value) },
          project,
        )
          ? "saved"
          : "error",
      );
    const timer = setTimeout(save, 350);
    const pagehide = () => {
      save();
    };
    window.addEventListener("pagehide", pagehide);
    const visibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", pagehide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [project, autoSave]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !modal) {
        setPreview(false);
        setMobileMenu(false);
      }
      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        modal
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [modal]);

  function setTheme(preset: ThemeId) {
    change((draft) => {
      draft.theme = {
        preset,
        font: themePresets[preset].font,
        radius: themePresets[preset].radius,
      };
    });
  }
  function addBlock(type: BlockType) {
    if (blocks.length >= 24) {
      setToast("This page has reached its 24-section limit.");
      return;
    }
    const block = createBlock(type);
    change((draft) => {
      const index = draft.pages[page].findIndex((item) => item.id === selected);
      draft.pages[page].splice(
        index < 0 ? draft.pages[page].length : index + 1,
        0,
        block,
      );
    });
    setSelected(block.id);
    setModal(null);
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-block-id="${block.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
    setToast(`${blockNames[type]} added. Make it yours.`);
  }
  function exportProject() {
    const blob = new Blob([JSON.stringify(project)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "prototype"}.formlane.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Project exported. A little backup for your ideas.");
  }
  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_SIZE)
        throw new Error("This project is too large. The limit is 750 KB.");
      const imported = parseProject(await file.text());
      dispatch({ type: "change", project: imported });
      setSelected(null);
      setModal(null);
      setToast(
        "Project imported. You can undo to return to your previous project.",
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "The project could not be imported.",
      );
    }
    if (importRef.current) importRef.current.value = "";
  }
  function openShare() {
    try {
      setShareUrl(makeShareUrl(project, location.href));
    } catch (error) {
      setShareUrl("");
      setToast((error as Error).message);
    }
    setModal("share");
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setToast("Snapshot link copied. Ready for a fresh pair of eyes.");
    } catch {
      setToast("Clipboard is unavailable. Select and copy the link below.");
    }
  }
  function keepCopy() {
    const saved = saveProject(
      { setItem: (key, value) => localStorage.setItem(key, value) },
      project,
    );
    if (!saved) {
      setSaveStatus("error");
      setToast(
        "Browser storage is unavailable. Export your project to keep it.",
      );
      return;
    }
    setAutoSave(true);
    setIsShared(false);
    setNotice("");
    const url = new URL(location.href);
    url.hash = "";
    window.history.replaceState(null, "", url);
    setToast("This copy is now your saved project.");
  }
  const saveLabel = !autoSave
    ? "Unsaved draft"
    : saveStatus === "saved"
      ? "Saved on this device"
      : saveStatus === "saving"
        ? "Saving…"
        : "Could not save — export a backup";

  return (
    <div
      className={`app-shell ${preview ? "presentation" : ""} ${mobileMenu ? "menu-open" : ""}`}
    >
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      {mobileMenu && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      {!preview && (
        <aside
          id="workspace-navigation"
          className="sidebar"
          aria-label="Workspace navigation"
        >
          <a className="wordmark" href="./" aria-label="Formlane home">
            <span className="brand-mark">
              f<span />
            </span>
            formlane<span className="wordmark-dot">.</span>
          </a>
          <div className="workspace-switch">
            <span className="workspace-avatar">P</span>
            <div>
              Personal workspace<small>A little room to explore</small>
            </div>
            <Leaf size={15} />
          </div>
          <div className="sidebar-label">
            PLAYGROUND <span>03</span>
          </div>
          <nav aria-label="Templates">
            {pageIds.map((id) => {
              const Icon = pages[id].icon;
              return (
                <button
                  key={id}
                  className={`template-link ${page === id ? "active" : ""}`}
                  aria-current={page === id ? "page" : undefined}
                  onClick={() => navigate(id)}
                >
                  <Icon size={17} />
                  <span>{pages[id].title}</span>
                  <ChevronRight size={14} />
                </button>
              );
            })}
          </nav>
          <button className="sidebar-add" onClick={() => setModal("library")}>
            <Plus size={16} /> Explore building blocks
          </button>
          <div className="sidebar-note">
            <span className="note-sparkle">✳</span>
            <h3>
              Same brand.
              <br />A whole new possibility.
            </h3>
            <p>
              Try a theme. Switch a template.
              <br />
              See what takes shape.
            </p>
            <button onClick={() => setModal("help")}>
              Take a quick tour <ArrowUpRight size={14} />
            </button>
            <div className="note-art">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="sidebar-bottom">
            <span className="local-dot" /> Your ideas stay on this device
            <button className="help-link" onClick={() => setModal("help")}>
              <CircleHelp size={16} /> A little guidance <span>↗</span>
            </button>
            <div className="sidebar-credit">
              A space for ideas, by Formlane.<span>v1.0</span>
            </div>
          </div>
        </aside>
      )}

      <div className="main-shell">
        <header className="topbar">
          {!preview ? (
            <>
              <div className="breadcrumb">
                <button
                  className="icon-button mobile-toggle"
                  aria-label="Toggle navigation"
                  aria-expanded={mobileMenu}
                  aria-controls="workspace-navigation"
                  onClick={() => setMobileMenu(!mobileMenu)}
                >
                  <Menu size={20} />
                </button>
                <span>Workspace</span>
                <ChevronRight size={13} />
                <Editable
                  value={project.name}
                  label="Project name"
                  maxLength={80}
                  onChange={(name) =>
                    change((draft) => {
                      draft.name = name.trim() || project.name;
                    })
                  }
                />
                <ChevronDown size={12} />
              </div>
              <div className="topbar-actions">
                <span
                  className={`save-state ${saveStatus === "error" && autoSave ? "save-error" : ""}`}
                  role="status"
                >
                  <span />
                  {saveLabel}
                </span>
                <button
                  className="button subtle"
                  onClick={() => setPreview(true)}
                >
                  <Play size={14} /> Present
                </button>
                <button className="button dark" onClick={openShare}>
                  Share prototype <ArrowUpRight size={14} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="presentation-brand">
                <span className="brand-mark small">
                  f<span />
                </span>
                <strong>{project.name}</strong>
                <span className="prototype-label">Prototype</span>
              </div>
              <div className="topbar-actions">
                <select
                  aria-label="Presentation template"
                  value={page}
                  onChange={(event) => navigate(event.target.value as PageId)}
                >
                  {pageIds.map((id) => (
                    <option key={id} value={id}>
                      {pages[id].title}
                    </option>
                  ))}
                </select>
                <button className="button subtle" onClick={openShare}>
                  <Link size={14} /> Share
                </button>
                <button
                  className="button dark"
                  onClick={() => setPreview(false)}
                >
                  <X size={14} /> Exit presentation
                </button>
              </div>
            </>
          )}
        </header>
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            {!autoSave && (
              <button onClick={keepCopy}>
                {isShared ? "Keep this copy" : "Save this draft"}
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Dismiss notice"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {!autoSave && !notice && (
          <div className="draft-bar">
            This draft isn’t being saved to your device.{" "}
            <button onClick={keepCopy}>Save this draft</button>
          </div>
        )}
        {autoSave && saveStatus === "error" && (
          <div className="notice save-failure" role="alert">
            <span>
              Your changes aren’t being saved. Export a project file to keep
              this work.
            </span>
            <button onClick={exportProject}>Export backup</button>
          </div>
        )}
        <main id="workspace" className="workspace" tabIndex={-1}>
          {!preview && (
            <div className="workspace-heading">
              <div>
                <div className="heading-eyebrow">
                  <span /> THE POSSIBILITIES START HERE
                </div>
                <h1>
                  Your next idea, taking shape<span>.</span>
                </h1>
                <p>
                  One visual identity. A few different ways to bring it to life.
                </p>
              </div>
              <div className="workspace-heading-actions">
                <button
                  className="button subtle"
                  onClick={() => setModal("style")}
                >
                  <Link size={14} /> Start from a website
                </button>
                <button
                  className="tour-button"
                  onClick={() => setModal("help")}
                >
                  <span>
                    <Play size={13} fill="currentColor" />
                  </span>{" "}
                  How it works <span className="tour-length">3 steps</span>
                </button>
              </div>
            </div>
          )}
          <div className="editor-layout">
            <section
              className="editor-column"
              aria-label={`${pages[page].title} prototype editor`}
            >
              {!preview && (
                <div className="editor-toolbar">
                  <div className="page-tab">
                    <span className="tab-dot" />
                    {pages[page].title}
                    <span className="page-tab-label">
                      Template {pages[page].number}
                    </span>
                  </div>
                  <div className="canvas-controls">
                    <div className="history-controls">
                      <button
                        className="icon-button"
                        aria-label="Undo"
                        title="Undo (Ctrl/⌘ Z)"
                        disabled={!history.past.length}
                        onClick={() => dispatch({ type: "undo" })}
                      >
                        <Undo2 size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Redo"
                        title="Redo (Ctrl/⌘ Shift Z)"
                        disabled={!history.future.length}
                        onClick={() => dispatch({ type: "redo" })}
                      >
                        <Redo2 size={16} />
                      </button>
                    </div>
                    <div className="viewport-controls">
                      <button
                        className={`icon-button ${viewport === "desktop" ? "active" : ""}`}
                        aria-label="Desktop preview"
                        aria-pressed={viewport === "desktop"}
                        onClick={() => setViewport("desktop")}
                      >
                        <Monitor size={16} />
                      </button>
                      <button
                        className={`icon-button ${viewport === "mobile" ? "active" : ""}`}
                        aria-label="Mobile preview"
                        aria-pressed={viewport === "mobile"}
                        onClick={() => setViewport("mobile")}
                      >
                        <Smartphone size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div
                className={`canvas-stage ${viewport === "mobile" && !preview ? "mobile-stage" : ""}`}
                ref={canvasRef}
              >
                <div
                  className="prototype-canvas"
                  style={themeStyle}
                  data-theme={
                    project.theme.custom ? "custom" : project.theme.preset
                  }
                >
                  <div className="prototype-nav">
                    <Editable
                      className="prototype-brand"
                      label="Canvas brand name"
                      value={project.brand}
                      maxLength={40}
                      preview={preview}
                      onChange={(brand) =>
                        change((draft) => {
                          draft.brand = brand.trim() || project.brand;
                        })
                      }
                    />
                    <div className="prototype-nav-links">
                      {pageIds.map((id) => (
                        <button
                          key={id}
                          className={page === id ? "current" : ""}
                          onClick={() => navigate(id)}
                        >
                          {id === "webshop"
                            ? "Collection"
                            : id === "kanban"
                              ? "Our process"
                              : "Our people"}
                        </button>
                      ))}
                    </div>
                    <span className="prototype-nav-end">
                      <Leaf size={16} />
                      <span>Made to matter.</span>
                    </span>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={({ active, over }) => {
                      if (over && active.id !== over.id)
                        change((draft) => {
                          const list = draft.pages[page];
                          draft.pages[page] = moveItem(
                            list,
                            list.findIndex((b) => b.id === active.id),
                            list.findIndex((b) => b.id === over.id),
                          );
                        });
                    }}
                  >
                    <SortableContext
                      items={blocks.map((block) => block.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {blocks.map((block, index) => (
                        <SortableBlock
                          key={block.id}
                          block={block}
                          index={index}
                          count={blocks.length}
                          preview={preview}
                          selected={selected === block.id}
                          select={() => setSelected(block.id)}
                          update={updateBlock}
                          move={(to) =>
                            change((draft) => {
                              draft.pages[page] = moveItem(
                                draft.pages[page],
                                index,
                                to,
                              );
                            })
                          }
                          duplicate={() =>
                            change((draft) => {
                              draft.pages[page].splice(
                                index + 1,
                                0,
                                duplicateBlock(block),
                              );
                            })
                          }
                          remove={() => {
                            change((draft) => {
                              draft.pages[page] = draft.pages[page].filter(
                                (b) => b.id !== block.id,
                              );
                            });
                            setSelected(null);
                          }}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  {!preview && (
                    <button
                      className="add-section"
                      disabled={blocks.length >= 24}
                      onClick={() => setModal("library")}
                    >
                      <Plus size={15} /> Make room for another idea{" "}
                      <span>Add a section</span>
                    </button>
                  )}
                  <footer className="prototype-footer">
                    <span>{project.brand}</span>
                    <span>A little less ordinary.</span>
                    <small>Built to imagine · Formlane</small>
                  </footer>
                </div>
              </div>
              {!preview && (
                <div className="editor-footnote">
                  <span>
                    <MousePointer2 size={13} /> Click text to edit. Grab a
                    handle to rearrange.
                  </span>
                  <span className="prototype-label">Interactive prototype</span>
                </div>
              )}
            </section>

            {!preview && (
              <aside className="inspector" aria-label="Design settings">
                <div className="inspector-tabs">
                  <button
                    className={inspector === "brand" ? "active" : ""}
                    onClick={() => setInspector("brand")}
                    aria-pressed={inspector === "brand"}
                  >
                    <Sparkles size={14} /> Your brand
                  </button>
                  <button
                    className={inspector === "layers" ? "active" : ""}
                    onClick={() => setInspector("layers")}
                    aria-pressed={inspector === "layers"}
                  >
                    <Layers size={14} /> Sections
                  </button>
                </div>
                {inspector === "brand" ? (
                  <>
                    <div className="inspector-intro">
                      <span className="panel-eyebrow">A FAMILIAR FEELING</span>
                      <h2>Make it yours.</h2>
                      <p>
                        A visual identity that follows
                        <br />
                        your ideas, everywhere.
                      </p>
                    </div>
                    <div className="inspector-field">
                      <label htmlFor="brand-name">Brand name</label>
                      <input
                        id="brand-name"
                        value={project.brand}
                        maxLength={40}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value.trim())
                            change((draft) => {
                              draft.brand = value;
                            });
                        }}
                      />
                    </div>
                    <div className="theme-section">
                      <div className="field-label">
                        Choose a starting point <span>4 themes</span>
                      </div>
                      <div className="theme-grid">
                        {themeIds.map((id) => {
                          const theme = themePresets[id];
                          return (
                            <button
                              key={id}
                              className={`theme-card ${!project.theme.custom && project.theme.preset === id ? "active" : ""}`}
                              aria-label={`${theme.name} theme`}
                              aria-pressed={
                                !project.theme.custom &&
                                project.theme.preset === id
                              }
                              onClick={() => setTheme(id)}
                            >
                              <div
                                className="theme-preview"
                                style={{
                                  background: theme.surface,
                                  color: theme.ink,
                                }}
                              >
                                <span
                                  style={{
                                    fontFamily:
                                      theme.font === "serif"
                                        ? "Georgia, serif"
                                        : "Arial, sans-serif",
                                  }}
                                >
                                  Aa
                                </span>
                                <div>
                                  <i style={{ background: theme.accent }} />
                                  <i style={{ background: theme.soft }} />
                                  <i style={{ background: theme.ink }} />
                                </div>
                                {!project.theme.custom &&
                                  project.theme.preset === id && (
                                    <b>
                                      <Check size={10} />
                                    </b>
                                  )}
                              </div>
                              <span>{theme.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="inspector-field">
                      <label htmlFor="heading-font">
                        Headings <span>Typography</span>
                      </label>
                      <select
                        id="heading-font"
                        value={project.theme.font}
                        onChange={(event) =>
                          change((draft) => {
                            draft.theme.font = event.target.value as
                              "serif" | "sans";
                          })
                        }
                      >
                        <option value="serif">Editorial serif</option>
                        <option value="sans">Modern sans</option>
                      </select>
                    </div>
                    <div className="radius-setting">
                      <label htmlFor="corner-radius">
                        Corners <span>{project.theme.radius}px</span>
                      </label>
                      <input
                        id="corner-radius"
                        type="range"
                        min="0"
                        max="24"
                        step="1"
                        value={project.theme.radius}
                        onChange={(event) =>
                          change((draft) => {
                            draft.theme.radius = Number(event.target.value);
                          })
                        }
                      />
                      <div>
                        <span>Sharp</span>
                        <span>Soft</span>
                      </div>
                    </div>
                    <div className="brand-applied">
                      <Check size={14} />
                      <span>Applied to all 3 templates</span>
                    </div>
                    <div className="import-style-note">
                      <span className="coming-label">FROM YOUR WEBSITE</span>
                      <strong>Your website, your style.</strong>
                      <p>
                        {project.theme.custom
                          ? `Style imported from ${new URL(project.theme.custom.source.url).hostname}. Choose a theme above to start over.`
                          : "Explore a website’s colors, heading style, and corners. Review before you apply."}
                      </p>
                      <button
                        className="button subtle full-width"
                        onClick={() => setModal("style")}
                      >
                        <Link size={13} />
                        {project.theme.custom
                          ? "Import another style"
                          : "Import website style"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="layers-panel">
                    <span className="panel-eyebrow">THE BIG PICTURE</span>
                    <h2>Room to rearrange.</h2>
                    <p>
                      Choose a section to find it on your page. Use its arrows
                      or drag handle to move it.
                    </p>
                    <ol>
                      {blocks.map((block, index) => (
                        <li key={block.id}>
                          <button
                            className={selected === block.id ? "active" : ""}
                            onClick={() => {
                              setSelected(block.id);
                              document
                                .querySelector(`[data-block-id="${block.id}"]`)
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                            }}
                          >
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            {blockNames[block.type]}
                            <ChevronRight size={13} />
                          </button>
                        </li>
                      ))}
                    </ol>
                    <button
                      className="button dark full-width"
                      onClick={() => setModal("library")}
                      disabled={blocks.length >= 24}
                    >
                      <Plus size={15} /> Add a section
                    </button>
                  </div>
                )}
                <div className="project-tools">
                  <button onClick={exportProject}>
                    <ArrowDownToLine size={14} /> Export project
                  </button>
                  <button onClick={() => importRef.current?.click()}>
                    <Upload size={14} /> Import project
                  </button>
                  <button onClick={() => setModal("reset")}>
                    <Plus size={14} /> Start fresh
                  </button>
                </div>
              </aside>
            )}
          </div>
          {!preview && (
            <div className="workspace-footer">
              <span>Less explaining. More exploring.</span>
              <span>
                Made for the “what if?” moments. <span>✳</span>
              </span>
            </div>
          )}
        </main>
      </div>
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-label="Import Formlane project"
        onChange={(event) => void importProject(event.target.files?.[0])}
      />
      {modal === "style" && (
        <StyleImport
          close={() => setModal(null)}
          apply={(result, brand) => {
            if (
              !change((draft) => {
                draft.theme = {
                  ...draft.theme,
                  font: result.font,
                  radius: result.radius,
                  custom: { ...result.palette, source: result.source },
                };
                if (brand) draft.brand = brand;
              })
            )
              return;
            setModal(null);
            setToast(
              "Website style applied to all three templates. You can undo this change.",
            );
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss message"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {modal === "library" && (
        <Dialog
          title="A little more possibility."
          close={() => setModal(null)}
          wide
        >
          <p className="dialog-description">
            Add a building block, then make it your own. New sections appear
            after your selected section, or at the end.
          </p>
          <div className="block-library">
            {library.map(({ type, icon: Icon, description }) => (
              <button
                key={type}
                disabled={blocks.length >= 24}
                onClick={() => addBlock(type)}
              >
                <span className="library-icon">
                  <Icon size={22} />
                </span>
                <strong>{blockNames[type]}</strong>
                <span>{description}</span>
                <Plus size={16} />
              </button>
            ))}
          </div>
          <p className="dialog-fineprint">
            Every section works with your brand. Every change can be undone.
          </p>
        </Dialog>
      )}
      {modal === "share" && (
        <Dialog
          title="Good ideas are better shared."
          close={() => setModal(null)}
        >
          <p className="dialog-description">
            Share a snapshot of all three templates, exactly as they are now.
            Your next edits stay with you.
          </p>
          <label className="share-label" htmlFor="share-link">
            Snapshot link
          </label>
          <div className="share-input">
            <input
              id="share-link"
              readOnly
              value={shareUrl}
              placeholder="Export this large project instead"
              onFocus={(event) => event.target.select()}
            />
            <button
              className="button dark"
              disabled={!shareUrl}
              onClick={() => void copyLink()}
            >
              <Link size={15} /> Copy link
            </button>
          </div>
          <p className="dialog-fineprint">
            <Leaf size={13} /> No account or upload. Project content is stored
            inside the link. Anyone with it can view and edit their own copy.
            Use a project file for large snapshots.
          </p>
          <div className="share-divider" />
          <button className="export-card" onClick={exportProject}>
            <span>
              <FileJson size={24} />
            </span>
            <div>
              <strong>Keep a copy of your ideas</strong>
              <small>Export an editable .formlane.json project</small>
            </div>
            <Download size={18} />
          </button>
        </Dialog>
      )}
      {modal === "help" && (
        <Dialog
          title="From “what if?” to right here."
          close={() => setModal(null)}
          wide
        >
          <p className="dialog-description">
            A playground for visual thinking. Bring it to a meeting, try a
            direction, and see what feels right.
          </p>
          <div className="tour-steps">
            <div>
              <span>01</span>
              <Sparkles size={23} />
              <h3>Find your feeling.</h3>
              <p>
                Pick one of four themes. Change the brand, headings, and
                corners. Your choices follow you across every template.
              </p>
            </div>
            <div>
              <span>02</span>
              <MousePointer2 size={23} />
              <h3>Give it a little shape.</h3>
              <p>
                Click text to edit. Press Enter to finish or Escape to cancel.
                Add table rows, move cards, and rearrange whole sections.
              </p>
            </div>
            <div>
              <span>03</span>
              <ExternalLink size={23} />
              <h3>Bring everyone along.</h3>
              <p>
                Present without the editing controls. Share a snapshot link or
                export a project file to pick up where you left off.
              </p>
            </div>
          </div>
          <div className="tour-note">
            <strong>A few useful things</strong>
            <p>
              Use Ctrl / ⌘ Z to undo, and Ctrl / ⌘ Shift Z to redo outside text
              fields. Drag handles support Space, arrow keys, and Space to drop;
              Escape cancels. Move arrows and card menus work without dragging.
            </p>
            <p>
              Your project saves in this browser. Export it for a backup.
              Templates are visual prototypes: payments, emails, and backend
              workflows aren’t connected.
            </p>
          </div>
          <button className="button dark" onClick={() => setModal(null)}>
            Let’s make something <ArrowRight size={15} />
          </button>
        </Dialog>
      )}
      {modal === "reset" && (
        <Dialog title="A fresh place to start?" close={() => setModal(null)}>
          <p className="dialog-description">
            This replaces all three templates and your brand settings. Export a
            copy first if you want to keep this project. You can also undo this
            change during this session.
          </p>
          <div className="dialog-actions">
            <button className="button subtle" onClick={exportProject}>
              <Download size={14} /> Export first
            </button>
            <button
              className="button dark"
              onClick={() => {
                dispatch({ type: "change", project: createProject() });
                setSelected(null);
                setModal(null);
                setToast("A fresh canvas. Where shall we go?");
              }}
            >
              Start fresh <ArrowRight size={14} />
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
