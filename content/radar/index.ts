import type { RadarEntry } from '../../src/registry/types';

/**
 * V0 Radar is a THIN entry surface over the already-running JU Radar service.
 * No new backend, no crawl pipeline, no content system, no scheduler.
 *
 * Link-out is the default. Embed is opt-in and only for a genuinely public
 * read-only surface. The JU Radar admin route is permanently out of scope.
 */
export const radar: RadarEntry[] = [
  {
    slug: 'ju-radar',
    title: 'JU Radar',
    summary:
      '관심 키워드의 움직임을 추적해 매일 브리핑으로 모으는 기존 JU Radar 서비스.',
    status: 'available',
    external: {
      originEnv: 'RADAR_ORIGIN',
      path: '/',
      embed: false,
    },
    updatedAt: '2026-09-27',
  },
];

export default radar;
