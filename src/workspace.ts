import { z } from "zod";
import { projectSchema, uid, type Project } from "./model";
import { loadProject, parseProject, STORAGE_KEY } from "./storage";

export const LIBRARY_KEY = "formlane.library.v1";
export const RECOVERY_KEY = "formlane.library.recovery";
export const MAX_PROJECTS = 10;
export const MAX_VERSIONS = 10;
export const MAX_LIBRARY_SIZE = 3_000_000;
type Store = Pick<Storage, "getItem" | "setItem">;
const id = z.string().min(1).max(80);
const savedVersionSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  createdAt: z.iso.datetime(),
  project: projectSchema,
});
const entrySchema = z.object({
  id,
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  project: projectSchema,
  versions: z.array(savedVersionSchema).max(MAX_VERSIONS),
});
const librarySchema = z
  .object({
    version: z.literal(1),
    activeId: id.nullable(),
    entries: z.array(entrySchema).max(MAX_PROJECTS),
  })
  .superRefine((library, ctx) => {
    if (
      new Set(library.entries.map((entry) => entry.id)).size !==
        library.entries.length ||
      (library.activeId !== null &&
        !library.entries.some((entry) => entry.id === library.activeId)) ||
      library.entries.some(
        (entry) =>
          new Set(entry.versions.map((version) => version.id)).size !==
          entry.versions.length,
      )
    )
      ctx.addIssue({ code: "custom", message: "Invalid library references" });
  });
export type Library = z.infer<typeof librarySchema>;
export type ProjectRef = { id: string; revision: number | null };
export type LibraryEntry = Library["entries"][number];
const emptyLibrary = (): Library => ({
  version: 1,
  activeId: null,
  entries: [],
});

export function readLibrary(storage: Pick<Storage, "getItem">): Library {
  const raw = storage.getItem(LIBRARY_KEY);
  if (!raw) return emptyLibrary();
  try {
    if (new TextEncoder().encode(raw).length > MAX_LIBRARY_SIZE)
      throw new Error();
    const library = librarySchema.parse(JSON.parse(raw));
    for (const entry of library.entries) {
      parseProject(JSON.stringify(entry.project));
      for (const version of entry.versions)
        parseProject(JSON.stringify(version.project));
    }
    return library;
  } catch {
    throw new Error(
      "Your project library could not be read. Autosave is paused to protect it. Export this draft or choose “Save this draft” to keep a recovery backup and start a new library.",
    );
  }
}

export function loadWorkspace(storage: Pick<Storage, "getItem">, hash: string) {
  let library: Library;
  try {
    library = readLibrary(storage);
  } catch (error) {
    const loaded = loadProject(storage, hash);
    return {
      ...loaded,
      recovered: true,
      notice: (error as Error).message,
      ref: { id: uid(), revision: null } as ProjectRef,
    };
  }
  const active = library.entries.find((entry) => entry.id === library.activeId);
  const loaded = loadProject(
    {
      getItem: (key) =>
        key === STORAGE_KEY && active
          ? JSON.stringify(active.project)
          : storage.getItem(key),
    },
    hash,
  );
  return {
    ...loaded,
    ref: {
      id: active?.id ?? uid(),
      revision: active?.revision ?? null,
    } as ProjectRef,
  };
}

function writeLibrary(storage: Store, library: Library) {
  const json = JSON.stringify(library);
  if (new TextEncoder().encode(json).length > MAX_LIBRARY_SIZE)
    throw new Error(
      "Your library has reached its 3 MB limit. Export and remove an older project or saved version, then try again.",
    );
  try {
    storage.setItem(LIBRARY_KEY, json);
  } catch {
    throw new Error(
      "Browser storage is full or unavailable. Export your project to keep these changes.",
    );
  }
  // Compatibility cache for earlier Formlane builds. The library is authoritative.
  const active = library.entries.find((entry) => entry.id === library.activeId);
  if (active) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(active.project));
    } catch {
      /* Library is already durable. */
    }
  }
}

export function saveWorkspace(
  storage: Store,
  ref: ProjectRef,
  project: Project,
  options: {
    activate?: boolean;
    versionName?: string;
    removeVersion?: string;
  } = {},
): ProjectRef {
  const library = readLibrary(storage);
  const normalized = parseProject(JSON.stringify(project));
  let entry = library.entries.find((item) => item.id === ref.id);
  if ((entry?.revision ?? null) !== ref.revision)
    throw new Error(
      "This project changed in another tab or was removed. Export your draft, then reload to open the saved copy.",
    );
  if (
    entry &&
    JSON.stringify(entry.project) === JSON.stringify(normalized) &&
    options.versionName === undefined &&
    !options.removeVersion &&
    (!options.activate || library.activeId === entry.id)
  )
    return { id: entry.id, revision: entry.revision };
  if (!entry) {
    if (library.entries.length >= MAX_PROJECTS)
      throw new Error(
        "Your library has 10 projects. Export and remove one before adding another.",
      );
    entry = {
      id: ref.id,
      revision: 0,
      updatedAt: new Date().toISOString(),
      project,
      versions: [],
    };
    library.entries.push(entry);
  }
  entry.project = normalized;
  if (options.removeVersion)
    entry.versions = entry.versions.filter(
      (version) => version.id !== options.removeVersion,
    );
  if (options.versionName !== undefined) {
    const name = options.versionName.trim();
    if (!name || name.length > 80)
      throw new Error("Give this version a name of 1–80 characters.");
    if (entry.versions.length >= MAX_VERSIONS)
      throw new Error(
        "This project has 10 saved versions. Remove one before saving another.",
      );
    entry.versions.unshift({
      id: uid(),
      name,
      createdAt: new Date().toISOString(),
      project: structuredClone(entry.project),
    });
  }
  entry.revision++;
  entry.updatedAt = new Date().toISOString();
  if (options.activate || library.activeId === null)
    library.activeId = entry.id;
  writeLibrary(storage, library);
  return { id: entry.id, revision: entry.revision };
}

export function openWorkspace(storage: Store, id: string): LibraryEntry {
  const library = readLibrary(storage);
  const entry = library.entries.find((item) => item.id === id);
  if (!entry)
    throw new Error(
      "This project was removed in another tab. Reopen Projects to refresh the list.",
    );
  library.activeId = id;
  writeLibrary(storage, library);
  return entry;
}

export function removeWorkspace(storage: Store, id: string) {
  const library = readLibrary(storage);
  if (library.activeId === id)
    throw new Error("Open another project before removing this one.");
  library.entries = library.entries.filter((entry) => entry.id !== id);
  writeLibrary(storage, library);
}

export function recoverLibrary(storage: Store) {
  const raw = storage.getItem(LIBRARY_KEY);
  if (!raw) return;
  try {
    readLibrary(storage);
    return;
  } catch {
    /* Explicit recovery only. */
  }
  // A failed backup must never erase the unreadable original.
  storage.setItem(`${RECOVERY_KEY}.${uid()}`, raw);
  storage.setItem(LIBRARY_KEY, JSON.stringify(emptyLibrary()));
}
