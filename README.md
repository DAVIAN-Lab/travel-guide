# travel-guide

DAVIAN Lab의 학회/여행 누적 가이드. 출장에서 쌓인 호텔·식당·공항·교통·통신·기념품 정보를 한 곳에 모아 다음 출장자가 빨리 준비할 수 있게 한다.

## 핵심 규칙 (3줄)

- **한국어 위주**, 호텔·지명·학회명 같은 고유명사는 원문 병기 (`[한국어명 (English)]`).
- **본문은 항상 최신.** 옛 정보는 지우지 않고 같은 문서 맨 아래 **변경 이력 (Archive)** 섹션으로 옮긴다.
- 모든 평가 bullet 끝에 `— 이름 (학회명 YYYY.MM)` 꼬리표를 단다.

## 어디서부터 보면 되나

- **공통 팁** (항공권/공항/항공사/짐/비자/통신/정산/학회 준비/안전): [general.md](general.md)
- **국가·도시별 가이드**: [countries/README.md](countries/README.md)
- **새 도시·국가 추가**: [templates/](templates/)에서 복사해 시작
- **AI 에이전트 운영 매뉴얼**: [AGENTS.md](AGENTS.md)
- **사람용 기여 가이드**: [CONTRIBUTING.md](CONTRIBUTING.md)

## 디렉터리

```
.
├── general.md                       공통 팁 (국가/도시 무관)
├── countries/
│   ├── README.md                    국가 인덱스 (가나다순)
│   └── <country>/
│       ├── README.md                국가 공통 정보 (통화/콘센트/시차/비자/...)
│       └── <city>.md                도시별 정보 (공항/숙소/교통/식당/...)
└── templates/
    ├── country-template.md
    └── city-template.md
```

학회별 별도 문서는 만들지 않는다. 학회 정보(시기·학회명·작성자)는 도시 문서의 각 항목 옆 꼬리표 한 줄로 남긴다.
