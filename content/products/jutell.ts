import type { ProductEntry } from '../../src/registry/types';

export default {
  slug: 'jutell',
  title: 'JuTell',
  // Beginner-facing Korean. The English line that used to sit here leaked into the
  // public UI on three pages and broke the beginner-readable register required by
  // docs/DESIGN_CONTRACT.md. Copy-only change: slug, status, releases, source,
  // version and CTA resolution are untouched.
  summary:
    'AI 에이전트가 뭘 바꿨는지 쉽게 확인하고, 작업 전엔 묻고 작업 후엔 검증해요.',
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
