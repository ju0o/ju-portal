import type { LabEntry } from '../../src/registry/types';

/**
 * Labs holds work that is real but not yet user-installable. No primary CTA is
 * rendered for these entries - that is the entire point of the section.
 *
 * Verified 2026-09-29:
 *   JuDoctor    - 0 releases, 0 tags. GPL-3.0.
 *   JuControler - 0 releases, 0 tags. MIT.
 */
export const labs: LabEntry[] = [
  {
    slug: 'judoctor',
    title: 'JuDoctor',
    summary:
      'Windows PC 건강 모니터. CPU·RAM·GPU·디스크를 시간대로 쌓고, 한 번의 스파이크가 아니라 지속된 근거로만 업그레이드를 권합니다.',
    status: 'coming_soon',
    source: { url: 'https://github.com/ju0o/JuDoctor', license: 'GPL-3.0' },
    updatedAt: '2026-09-18',
    unavailableReason: 'Installer release not published yet.',
  },
  {
    slug: 'jucontroler',
    title: 'JuControler',
    summary:
      '여러 AI 프로젝트의 진행 상황을 한 화면에 모으는 읽기 전용 상태판. AI 빌더가 아닙니다.',
    status: 'coming_soon',
    source: { url: 'https://github.com/ju0o/JuControler', license: 'MIT' },
    updatedAt: '2026-09-28',
    unavailableReason: 'No downloadable build published yet.',
  },
];

export default labs;
