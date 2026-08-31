export interface GitRequestProject {
  token: string;
  activeProjectId?: string;
  workspaceRoot?: string;
}

export interface GitRequestCoordinator {
  begin: () => number;
  isCurrent: (requestId: number, projectId: string, token: string, current: GitRequestProject) => boolean;
}

export function createGitRequestCoordinator(): GitRequestCoordinator {
  let latestRequest = 0;
  return {
    begin: () => {
      latestRequest += 1;
      return latestRequest;
    },
    isCurrent: (requestId, projectId, token, current) => requestId === latestRequest
      && current.token === token
      && current.activeProjectId === projectId
      && current.workspaceRoot === projectId,
  };
}
