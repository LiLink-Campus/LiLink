import { execFileSync } from 'node:child_process';

export function sourceState(root, paths = []) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  return {
    sourceSha: git(['rev-parse', 'HEAD']),
    sourceDirty: Boolean(git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...paths])),
  };
}
