# travel-guide

DAVIAN Lab이 학회 출장과 여행에서 얻은 정보를 쌓아 두는 가이드다. 출장에서 모은 호텔·식당·공항·교통·통신·기념품 정보를 한 곳에 모아서, 다음 출장자가 빨리 준비할 수 있게 한다.

**웹사이트**: <https://davian-lab.github.io/travel-guide/>. 이 레포의 마크다운을 국가·도시 메뉴와 지도로 보여 준다. 레포를 고치면 최대 10분 뒤에 사이트에 반영된다.

## 핵심 규칙 (3줄)

- **한국어 위주**로 쓰고, 호텔·지명·학회명 같은 고유명사는 원문을 함께 적는다 (`[한국어명 (English)]`).
- **본문은 항상 최신**으로 유지한다. 옛 정보는 지우지 않고 같은 문서 맨 아래의 **변경 이력 (Archive)** 섹션으로 옮긴다.
- 모든 평가 bullet 끝에 `— 이름 (학회명 YYYY.MM)` 꼬리표를 단다. 학회와 무관한 방문이면 `— 이름 (YYYY.MM)`으로 쓴다.

## 어디서부터 보면 되나

- **공통 팁** (항공권/공항/항공사/짐/비자/통신/정산/학회 준비/안전): [general.md](general.md)
- **국가·도시별 가이드**: [countries/README.md](countries/README.md)
- **새 도시·국가 추가**: [templates/](templates/)의 파일을 복사해서 시작한다.
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
├── templates/
│   ├── country-template.md
│   └── city-template.md
├── index.html                       웹사이트 진입점
└── site/                            웹사이트 코드·데이터 (site/README.md)
```

학회별로 따로 문서를 만들지 않는다. 학회 정보(시기·학회명·작성자)는 도시 문서의 각 항목 끝에 붙는 꼬리표 한 줄로 남긴다.
