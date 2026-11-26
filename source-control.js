'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

function git(root, args) {
  const local = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'MinGit', 'cmd', 'git.exe');
  const exe = fs.existsSync(local) ? local : 'git';
  return new Promise((resolve, reject) => {
    execFile(exe, ['--no-pager', '--literal-pathspecs', ...args], {
      cwd: root, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 16 * 1024 * 1024
    }, (error, stdout, stderr) => error ? reject(Error((stderr || error.message).trim())) : resolve(stdout || stderr || ''));
  });
}

async function sourceControl(root, action, value) {
  switch (action) {
    case 'status': {
      const result = await git(root, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', '.']);
      // Porcelain paths are relative to the repository root even when the project is a subdirectory.
      const top = (await git(root, ['rev-parse', '--show-toplevel'])).trimEnd();
      return result.split('\0').filter(Boolean).map(s => ({ status: s.slice(0, 2), file: path.relative(root, path.resolve(top, s.slice(3))) }));
    }
    case 'diff': {
      const args = ['--no-ext-diff', '--no-color'];
      const [index, working] = await Promise.all([git(root, ['diff', '--cached', ...args, '--', value]), git(root, ['diff', ...args, '--', value])]);
      return [index, working].filter(Boolean).join('\n') || 'No tracked changes.';
    }
    case 'stage': return git(root, ['add', '--', value]);
    case 'commit':
      if (!value?.trim()) throw Error('Enter a commit message.');
      return git(root, ['commit', '-m', value]);
    case 'pull': return git(root, ['pull', '--ff-only']);
    case 'push': return git(root, ['push']);
    case 'clone': {
      const url = new URL(value);
      if (url.protocol !== 'https:') throw Error('Enter an HTTPS repository URL.');
      return git(root, ['clone', '--', url.href, '.']);
    }
    default: throw Error('Unknown Git action');
  }
}
module.exports = { sourceControl };
