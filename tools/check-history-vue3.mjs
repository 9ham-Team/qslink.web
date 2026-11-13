import { execFileSync } from 'node:child_process';

// Only first-parent commits belong to this development line. Imported dev
// history keeps its original subjects; the merge commit itself needs vue3.
const baseline = 'f3289231bb3fd50941980eb146b5e5667095b034';
// PR checks run on GitHub's synthetic merge; validate the actual PR head so
// GitHub's generated temporary merge subject is not mistaken for a user commit.
const target = process.env.QSL_HEAD_SHA_VUE3 || 'HEAD';
if (target !== 'HEAD' && !/^[a-f0-9]{40}$/i.test(target)) throw new Error('Invalid Vue3 head SHA');
const lines = execFileSync('git', ['log', '--first-parent', baseline + '..' + target, '--format=%H%x09%s'], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);
const failures = lines.filter(line => !/vue3\s*$/i.test(line.split('\t').slice(1).join('\t')));
if (process.env.QSL_PR_TITLE_VUE3 && !/vue3\s*$/i.test(process.env.QSL_PR_TITLE_VUE3)) {
  failures.push('PR title must end with vue3');
}
if (failures.length) {
  console.error('Vue3 suffix check failed:\n' + failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Vue3 suffix check passed (' + lines.length + ' development-line commits)');
}
