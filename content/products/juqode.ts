import type { ProductEntry } from '../../src/registry/types';

export default {
  slug: 'juqode',
  title: 'JuQode',
  summary:
    'Claude Code에 자연어로 지시하고, 바뀐 내용을 읽을 수 있는 카드로 확인하는 데스크톱 워크벤치.',
  status: 'available',
  media: {
    // LOCAL, versioned, immutable. Hosted on the Portal CDN rather than the GitHub
    // Release asset: release assets serve as application/octet-stream with no
    // accept-ranges, so they are not a reliable <video> source. 878 KB is far
    // under the 25 MB inline tier, so it belongs here.
    overviewVideo: {
      path: '/media/juqode/overview.v1.mp4',
      byteSize: 878203,
      alt: 'JuQode 실사용 영상',
    },
    // Intended but absent. Recorded as intent, never as a phantom path.
    pending: ['poster'],
  },
  releases: [
    // PRIMARY. Founder decision 2026-09-29: the zero-install web Try experience is
    // the primary action, not the installer. The audience is vibe-coding beginners,
    // for whom "open it in the browser right now" beats "download an exe and run it".
    // Verified live 2026-09-29: 200, "JuQode — 클릭 체험판".
    {
      provider: 'web',
      url: 'https://ju0o.github.io/JuQode/',
      platforms: ['web'],
      verb: 'Try',
      primary: true,
    },
    // SECONDARY. The executable remains available and verified, but is not the
    // primary CTA. URL is pinned to a tag so it stays immutable.
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
