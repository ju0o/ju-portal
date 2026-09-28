import type { ProductEntry } from '../../src/registry/types';

export default {
  slug: 'jutell',
  title: 'JuTell',
  summary:
    'Understand what your AI coding agent actually did. A clarify-before / verify-after layer for Codex, Claude Code and OpenCode.',
  status: 'available',
  media: {
    pending: ['poster', 'overviewVideo'],
  },
  // NOTE: this repository has 4 GitHub releases but ZERO release assets, so
  // github_release is NOT a valid provider here. npm is the real install path.
  releases: [
    {
      provider: 'npm',
      package: 'jutell',
      version: '2.0.1',
      platforms: ['node'],
      verb: 'Install',
    },
  ],
  source: { url: 'https://github.com/ju0o/jutell', license: 'MIT' },
  updatedAt: '2026-09-07',
} satisfies ProductEntry;
