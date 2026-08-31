import type { AcpSession } from "@ainide/shared";
import { ProjectRegistry } from "../projects.js";
import { AcpSessionError, type AcpResourceHandlers } from "./manager.js";
import { relativeAcpPath } from "./paths.js";
import { AcpTerminalManager } from "./terminals.js";

export function createAcpResourceHandlers(projects: ProjectRegistry, terminalManager: AcpTerminalManager): AcpResourceHandlers {
  return {
    readTextFile: async (session, params) => {
      const workspace = workspaceFor(projects, session);
      const relative = await relativeAcpPath(workspace.rootPath, params.path);
      const value = await workspace.manager.read(relative);
      if (typeof value !== "string") throw new Error("ACP requested a binary file as text");
      return { content: sliceLines(value, params.line, params.limit) };
    },
    writeTextFile: async (session, params) => {
      const workspace = workspaceFor(projects, session);
      const relative = await relativeAcpPath(workspace.rootPath, params.path);
      await workspace.manager.write(relative, params.content);
      if (projects.activeId === session.projectId) await workspace.manager.refreshGit();
      return {};
    },
    createTerminal: (session, params) => terminalManager.create(session, params),
    terminalOutput: async (session, params) => terminalManager.output(session, params.terminalId),
    releaseTerminal: (session, params) => terminalManager.release(session, params.terminalId),
    waitForTerminalExit: (session, params) => terminalManager.waitForExit(session, params.terminalId),
    killTerminal: async (session, params) => terminalManager.kill(session, params.terminalId),
    closeSession: (session) => terminalManager.closeSession(session.id),
  };
}

function workspaceFor(projects: ProjectRegistry, session: AcpSession): { rootPath: string; manager: NonNullable<ReturnType<ProjectRegistry["managerFor"]>> } {
  const manager = projects.managerFor(session.projectId);
  const workspace = manager?.current;
  if (!manager || !workspace || workspace.rootPath !== session.projectId) throw new AcpSessionError(409, "ACP session workspace is no longer open");
  return { rootPath: workspace.rootPath, manager };
}

function sliceLines(content: string, line: number | null | undefined, limit: number | null | undefined): string {
  if (line !== undefined && line !== null && (!Number.isInteger(line) || line < 1)) throw new Error("ACP line must be a positive integer");
  if (limit !== undefined && limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new Error("ACP line limit must be a positive integer");
  const lines = content.split(/\r?\n/);
  const start = line ? line - 1 : 0;
  return lines.slice(start, limit ? start + limit : undefined).join("\n");
}
