# 물때AI — 농업인 하루판단판

한국농어촌공사(KRC) 저수지 수위 데이터와 강수전망을 농업인의 작물,
생육단계, 포장 상태에 연결해 오늘 먼저 확인할 행동을 제안하는 공개
파일럿입니다.

## 공개 파일럿의 목적

- 전국 대표 저수지 5곳의 최근 365일 데이터 품질 진단
- 기준모형과 비교해 통과한 1일·3일 저수율 전망만 공개
- 농업인이 선택한 오늘 행동을 익명으로 저장
- 이후 실제 비, 다음 포장 상태, 도움 여부를 기록하는 2일 검증

이 서비스는 영농 결정을 대신하지 않습니다. 현장 상태, 지역 용수공급
계획, 공식 기상특보를 함께 확인하기 위한 보조판입니다.

## Cloudflare 원클릭 배포

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Un1qu1st/multtae-ai)

Deploy 버튼은 새 D1 데이터베이스를 만들고 `DB`에 연결한 뒤,
`drizzle/`의 마이그레이션을 적용합니다. 배포 화면에서 공공데이터포털의
KRC 일반 인증키(Decoding)를 `KRC_API_KEY` 비밀값으로 입력합니다.

```bash
npm install
npm run build
npm run deploy
```

실제 인증키, `.env` 파일, 운영 데이터는 Git에 포함하지 않습니다.

## 기술 구성

- Next.js 16 + React 19
- vinext + Cloudflare Workers
- Cloudflare D1 + Drizzle ORM
- KRC 공공데이터 API + Open-Meteo

현재 파일럿은 검색엔진 수집을 차단하고 익명 참여번호만 브라우저에
저장합니다.
