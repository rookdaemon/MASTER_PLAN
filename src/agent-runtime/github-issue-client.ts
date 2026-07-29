import { execFileSync } from 'node:child_process';

export interface GitHubIssueClient {
  createIssue(request: {
    repo: string;
    title: string;
    labels: string[];
    body: string;
  }): string;
  viewIssue(repo: string, issueNumber: number): unknown;
  listOpenIssues(repo: string, label: string): unknown[];
}

export class GhCliIssueClient implements GitHubIssueClient {
  createIssue(request: { repo: string; title: string; labels: string[]; body: string }): string {
    return execFileSync('gh', [
      'issue', 'create',
      '--repo', request.repo,
      '--title', request.title,
      '--label', request.labels.join(','),
      '--body-file', '-',
    ], {
      input: request.body,
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  }

  viewIssue(repo: string, issueNumber: number): unknown {
    const output = execFileSync('gh', [
      'issue', 'view', String(issueNumber),
      '--repo', repo,
      '--json', 'number,title,state,labels,body,comments,createdAt,closedAt',
    ], { encoding: 'utf-8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(output);
  }

  listOpenIssues(repo: string, label: string): unknown[] {
    const output = execFileSync('gh', [
      'issue', 'list',
      '--repo', repo,
      '--label', label,
      '--state', 'open',
      '--json', 'number,title,state,labels,createdAt',
      '--limit', '50',
    ], { encoding: 'utf-8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(output) as unknown[];
  }
}
