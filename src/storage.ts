import LZString from "lz-string";
import { createProject, projectSchema, type Project } from "./model";

export const STORAGE_KEY = "formlane.project.v1";
export const MAX_PROJECT_SIZE = 750_000;
const MAX_SHARE_LENGTH = 48_000;

export function parseProject(json: string): Project {
  if (new TextEncoder().encode(json).length > MAX_PROJECT_SIZE)
    throw new Error("This project is too large. The limit is 750 KB.");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(
      "This file is not valid JSON. Your current project is unchanged.",
    );
  }
  const result = projectSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "This is not a supported Formlane v1 project. Your current project is unchanged.",
    );
  if (
    new TextEncoder().encode(JSON.stringify(result.data)).length >
    MAX_PROJECT_SIZE
  )
    throw new Error(
      "This project is too large after adding the new templates. The limit is 750 KB. Your saved copy is unchanged.",
    );
  return result.data;
}

export function makeShareUrl(project: Project, href: string): string {
  const data = LZString.compressToEncodedURIComponent(JSON.stringify(project));
  if (data.length > MAX_SHARE_LENGTH)
    throw new Error(
      "This project is too large for a link. Export the project file instead.",
    );
  const url = new URL(href);
  url.hash = `project=${data}`;
  return url.toString();
}

export function loadProject(
  storage: Pick<Storage, "getItem">,
  hash: string,
): {
  project: Project;
  notice?: string;
  shared?: boolean;
  recovered?: boolean;
} {
  if (hash.startsWith("#project=")) {
    try {
      const compressed = hash.slice(9);
      if (compressed.length > MAX_SHARE_LENGTH) throw new Error();
      const json = LZString.decompressFromEncodedURIComponent(compressed);
      if (!json) throw new Error();
      return {
        project: parseProject(json),
        notice:
          "Shared snapshot opened. Choose “Keep this copy” to add it as a separate project on this device.",
        shared: true,
      };
    } catch {
      const local = loadProject(storage, "");
      return {
        ...local,
        notice:
          "That shared link could not be opened. Showing your local project instead.",
      };
    }
  }
  try {
    const saved = storage.getItem(STORAGE_KEY);
    return { project: saved ? parseProject(saved) : createProject() };
  } catch {
    return {
      project: createProject(),
      recovered: true,
      notice:
        "Your saved project could not be read. Autosave is paused to protect it. Export this draft or choose “Save this draft” to replace the saved copy.",
    };
  }
}

export function saveProject(
  storage: Pick<Storage, "setItem">,
  project: Project,
): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}
