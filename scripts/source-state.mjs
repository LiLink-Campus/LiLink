import { execFileSync } from 'node:child_process';
import { generatedImagePaths } from './images/generated-paths.mjs';

export function sourceState(root, paths = []) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const status = exclusions => git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...paths, ...exclusions]);
  const allChanges = status([]);
  const sourceChanges = status(generatedImagePaths.map(file => `:(exclude)${file}`));
  return {
    sourceSha: git(['rev-parse', 'HEAD']),
    sourceDirty: Boolean(sourceChanges),
    generatedDirty: allChanges !== sourceChanges,
  };
}
