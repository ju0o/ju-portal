/**
 * Home copy — the ONLY editable Home content, in one committed file.
 *
 * Studio edits this file. It is deliberately COPY-ONLY: no layout, no CSS, no
 * animation, no component configuration lives here. Those remain Builder-owned
 * in src/ui/pages.js. A normal Portal copy change is a change to THIS file and
 * nothing else.
 *
 * `lines` arrays are authored line breaks. The Founder writes the Home headline
 * as the intended lines, so Studio never has to guess where Korean may wrap.
 */
export interface HomeCopy {
  hero: {
    label: string;
    titleLines: string[];
    /** Trailing segment of the headline, emphasised in the accent colour. */
    titleAccent: string;
    subtitleLines: string[];
    discoverPlaceholder: string;
    discoverLabel: string;
    hints: string[];
    primaryCta: string;
    secondaryCta: string;
  };
  brand: {
    index: string;
    titleLines: string[];
    bodyLines: string[];
    chain: string[];
    listLabel: string;
  };
  instruct: {
    index: string;
    titleLines: string[];
    bodyLines: string[];
    exampleLabel: string;
    /** Accessible label for the prompt, kept in the beginner Korean register. */
    exampleAria: string;
    exampleText: string;
  };
  works: {
    index: string;
    titleLines: string[];
    bodyLines: string[];
    statesLabel: string;
    states: string[];
  };
  resolve: {
    index: string;
    titleLines: string[];
    bodyLines: string[];
  };
  sections: {
    skillsTitle: string;
    skillsBody: string;
    labsTitle: string;
    labsBody: string;
    radarTitle: string;
    radarBody: string;
    radarCta: string;
    radarDetails: string;
    radarPending: string;
  };
  notify: {
    titleLines: string[];
    body: string;
    button: string;
    state: string;
    footnote: string;
  };
  meta: {
    title: string;
    description: string;
  };
}

export const home: HomeCopy = {
  hero: {
    label: 'JU · FROM SIGNAL TO TOOL',
    titleLines: [
      '비개발자의 생각이 말이 되고,',
      '말이 AI의 작업이 되고,',
      '그 결과가 다시 사람이 이해할 수 있는',
    ],
    titleAccent: '도구가 됩니다.',
    subtitleLines: [
      '사람의 생각이 신호가 되고, AI의 작업을 거쳐',
      '누구나 이해할 수 있는 도구로 이어집니다.',
    ],
    discoverPlaceholder: '지금 뭘 하고 싶나요?',
    discoverLabel: '찾아보기',
    hints: [
      'AI가 뭘 수정했는지 보고 싶어',
      '말로 앱 만들고 싶어',
      '코드를 쉽게 이해하고 싶어',
      'Agent에게 능력 추가',
      '새로운 AI 도구 찾기',
    ],
    primaryCta: 'JU 제품 시작하기',
    secondaryCta: 'Skills 보기',
  },
  brand: {
    index: '01 · BRAND VALUE',
    titleLines: ['누구나,', '자신의 아이디어를', '현실로 만들 수 있는 시대.'],
    bodyLines: [
      '비개발자도 할 수 있습니다.',
      'JU는 생각하는 모든 사람을 위해',
      '새로운 창작의 방식을 만듭니다.',
    ],
    chain: ['아이디어', '콘텐츠', '도구', '다시 사람'],
    listLabel: 'JU가 잇는 것',
  },
  instruct: {
    index: '02 · YOU INSTRUCT',
    titleLines: ['당신의 생각을,', '그냥 말해주세요.'],
    bodyLines: [
      '코드가 아니라 평소 쓰는 말이면 충분합니다.',
      '사람의 신호가 여기서 시작됩니다.',
    ],
    /** Visible label over the example prompt. */
    exampleLabel: 'Example',
    /** Accessible label for the same prompt, in the beginner Korean register. */
    exampleAria: '예시 요청',
    exampleText: '내 아이디어를 작은 웹 도구로 만들어줘',
  },
  works: {
    index: '03 · AI WORKS',
    titleLines: ['AI가 당신의 생각을', '작업으로 바꿉니다.'],
    bodyLines: [
      '계획하고, 만들고, 조립하고, 확인합니다.',
      '신호가 작업이 되는 과정이 그대로 보입니다.',
    ],
    statesLabel: 'AI 작업 단계',
    states: ['Planning', 'Generating', 'Building', 'Testing'],
  },
  resolve: {
    index: '04 · REAL TOOL',
    titleLines: ['그리고,', '당신이 이해할 수 있는', '도구가 완성됩니다.'],
    bodyLines: [
      '여기까지가 이야기이고, 아래는 지금 실제로 써 볼 수 있는 제품입니다.',
      '설치하지 않고 바로 열어보거나, 명령 한 줄로 시작합니다.',
    ],
  },
  sections: {
    skillsTitle: 'Skills',
    skillsBody: 'Agent에게 새로운 능력을 붙여요.',
    labsTitle: 'Labs',
    labsBody: '완제품으로 가장하지 않는 연구·실험 공간.',
    /** Home Radar BAND copy. Distinct from the RadarEntry title in content/radar. */
    radarTitle: '새로운 도구를 발견합니다.',
    radarBody: 'JU가 발견하고 검증하는 새로운 AI / Agent / 개발도구',
    radarCta: 'JU Radar 열어보기',
    radarDetails: '자세히',
    radarPending: '연결 준비 중',
  },
  notify: {
    titleLines: ['지금, JU의 다음 소식을', '가장 먼저 받아보세요.'],
    body: '새로운 기능, 제품 업데이트, 그리고 더 큰 가능성에 대한 소식을 전해드립니다.',
    button: '알림 받기',
    state: '알림 기능 준비 중 · 지금은 입력을 받지 않습니다',
    footnote:
      '구독을 받는 서버가 아직 없습니다. 준비되면 이곳에서 이메일을 받고 소식을 전해드리겠습니다.',
  },
  meta: {
    title: 'JU — 생각이 도구가 되는 곳',
    description:
      '누구나 자신의 아이디어를 현실로 만들 수 있는 시대. JU는 사람의 생각을 AI 작업과 이해하기 쉬운 도구로 이어줍니다.',
  },
};

export default home;
