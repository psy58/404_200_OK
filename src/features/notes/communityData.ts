export type CommunityPostKind = "question" | "tip" | "resource";
export type CommunityEvidence = "공식" | "경험" | "참고";

export interface CommunityAttachment {
  name: string;
  meta: string;
}

export interface CommunityAnswer {
  author: string;
  body: string;
}

export interface CommunityPost {
  id: string;
  kind: CommunityPostKind;
  taskId: string;
  taskTitle: string;
  taskCategory: string;
  schoolLevel: string;
  academicYear: number;
  materialType: string;
  evidence: CommunityEvidence;
  author: string;
  body: string;
  createdAt: string;
  helpfulCount: number;
  attachments?: CommunityAttachment[];
  answers?: CommunityAnswer[];
}

export const COMMUNITY_POSTS: CommunityPost[] = [
  {
    id: "community-1",
    kind: "tip",
    taskId: "t11",
    taskTitle: "영재학급 선발·배정",
    taskCategory: "영재교육",
    schoolLevel: "초등",
    academicYear: 2026,
    materialType: "업무 팁",
    evidence: "경험",
    author: "서울 · 김하늘 선생님",
    body: "이 업무는 10월 초부터 학부모 문의가 많아집니다. 추천 기준과 배점을 가정통신문에 미리 자세히 적어 두는 게 좋았어요.",
    createdAt: "2시간 전",
    helpfulCount: 38,
  },
  {
    id: "community-2",
    kind: "resource",
    taskId: "t11",
    taskTitle: "영재학급 선발·배정",
    taskCategory: "영재교육",
    schoolLevel: "초등",
    academicYear: 2026,
    materialType: "가정통신문",
    evidence: "참고",
    author: "경기 · 박지수 선생님",
    body: "올해 사용한 영재 선발 가정통신문과 학부모 문의 대응 체크리스트입니다. 학교 기준에 맞게 숫자와 일정은 꼭 다시 확인하세요.",
    createdAt: "어제",
    helpfulCount: 52,
    attachments: [
      { name: "2026_영재선발_가정통신문.hwp", meta: "한글 · 184KB" },
      { name: "학부모_문의대응_체크리스트.pdf", meta: "PDF · 96KB" },
    ],
  },
  {
    id: "community-3",
    kind: "question",
    taskId: "t4",
    taskTitle: "영재학급 2학기 강사비 정산",
    taskCategory: "영재교육",
    schoolLevel: "초등",
    academicYear: 2026,
    materialType: "질문·답변",
    evidence: "경험",
    author: "인천 · 이윤서 선생님",
    body: "외부 강사 원천징수 서류는 강사별로 어떤 순서로 받으셨나요? 행정실에 넘기기 전 확인 목록이 궁금합니다.",
    createdAt: "3일 전",
    helpfulCount: 17,
    answers: [
      { author: "대전 · 최민호 선생님", body: "통장 사본 → 신분증 사본 → 개인정보 동의서 → 강의 확인서 순으로 한 묶음씩 만들면 누락 확인이 쉬웠어요." },
    ],
  },
  {
    id: "community-4",
    kind: "tip",
    taskId: "t2",
    taskTitle: "2026 AI 교육주간 운영",
    taskCategory: "과학정보",
    schoolLevel: "초등",
    academicYear: 2026,
    materialType: "업무 팁",
    evidence: "경험",
    author: "부산 · 정서우 선생님",
    body: "외부 강사 섭외 전에 학년별 희망 시간을 먼저 받아 두세요. 강사 일정부터 잡으면 학년 행사와 겹쳐 다시 조정하게 됩니다.",
    createdAt: "5일 전",
    helpfulCount: 29,
  },
  {
    id: "community-5",
    kind: "resource",
    taskId: "t1",
    taskTitle: "2학기 학교정보공시 자료 확정",
    taskCategory: "과학정보",
    schoolLevel: "초등",
    academicYear: 2026,
    materialType: "체크리스트",
    evidence: "참고",
    author: "광주 · 한유진 선생님",
    body: "최종 확정 전 교무부와 대조할 항목만 한 장으로 정리했습니다. 공시 기준은 해당 연도 공식 지침을 우선해 주세요.",
    createdAt: "1주 전",
    helpfulCount: 44,
    attachments: [{ name: "정보공시_최종검증_체크리스트.xlsx", meta: "Excel · 42KB" }],
  },
];

export const KIND_LABEL: Record<CommunityPostKind, string> = {
  question: "① 질문",
  tip: "② 감 공유",
  resource: "③ 자료 공유",
};
