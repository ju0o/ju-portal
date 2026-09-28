import type { ProductEntry } from '../../src/registry/types';

export default {
  slug: 'juqode',
  title: 'JuQode',
  summary:
    'Claude Code에 자연어로 지시하고, 바뀐 내용을 읽을 수 있는 카드로 확인하는 데스크톱 워크벤치.',
  status: 'available',
  media: {
    // Immutable by construction: the asset sits under a pinned release tag, so this
    // URL can never be reused for different bytes. No local re-encode needed yet.
    overviewVideoExternal: {
      externalUrl:
        'https://github.com/ju0o/JuQode/releases/download/demo-v0.1/juqode-usage.mp4',
      version: 'demo-v0.1',
      byteSize: 878203,
    },
    // Intended but absent. Recorded as intent, never as a phantom path.
    pending: ['poster'],
  },
  releases: [
    {
      provider: 'github_release',
      repo: 'ju0o/JuQode',
      tag: 'demo-v0.1',
      asset: 'JuQode-0.1.0-x64.exe',
      version: '0.1.0',
      platforms: ['windows'],
      verb: 'Download',
    },
    {
      provider: 'github_release',
      repo: 'ju0o/JuQode',
      tag: 'demo-v0.1',
      asset: 'JuQode-0.1.0-x64.zip',
      version: '0.1.0',
      platforms: ['windows'],
      verb: 'Download',
    },
  ],
  source: { url: 'https://github.com/ju0o/JuQode', license: 'MIT' },
  updatedAt: '2026-09-18',
} satisfies ProductEntry;
