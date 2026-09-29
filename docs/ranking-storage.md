# Render 무료 서버의 랭킹 저장

Render 무료 서버의 로컬 파일은 절전·재시작·재배포 시 사라집니다. 이 프로젝트는
Upstash Redis REST API에 기록을 저장하여 웹 서버와 독립적으로 유지합니다.

## 최초 설정

1. https://console.upstash.com 에서 계정을 만들고 Redis 데이터베이스의 Free 플랜을 선택합니다.
2. 데이터베이스의 REST API 연결 정보에서 URL과 쓰기 가능한 Token을 확인합니다.
3. Render의 patent-siege 서비스 → Environment에 다음 두 환경변수를 추가합니다.
   - `UPSTASH_REDIS_REST_URL`: `https://...upstash.io`
   - `UPSTASH_REDIS_REST_TOKEN`: 쓰기 가능한 REST Token (Read Only Token 아님)
4. 변경된 코드를 배포하고 환경변수를 적용합니다. 토큰은 Git이나 클라이언트 코드에 넣지 않습니다.
5. 게임 종료 후 랭킹을 등록하고 서비스를 재시작한 다음 같은 기록이 표시되는지 확인합니다.

선택 환경변수 `RANK_REDIS_KEY`의 기본값은 `patent-siege:rankings:v1`입니다.
여러 게임/테스트 환경이 같은 DB를 쓸 때 서로 다른 키를 지정합니다.
무료 플랜의 저장 용량과 요청 한도는 https://upstash.com/pricing/redis 에서 확인하세요.

## 보관 규칙과 장애 처리

- 각 기록은 등록 시점부터 30일 동안 유효합니다. 매월 1일 초기화하는 방식이 아닙니다.
- 솔로/대전별 상위 20위를 표시하며, 기간 내 낮은 점수도 보관합니다.
- 조회/등록 시 30일이 지난 기록을 제거합니다. 등록 없이 30일이 지나면 Redis 키도 만료됩니다.
- 서버 메모리 스냅샷을 덮어쓰지 않고 Redis 트랜잭션으로 추가·정리·조회하므로 재배포 시 기록이 덮이지 않습니다.
- 외부 저장에 성공한 다음 등록 성공을 반환합니다. 연결 실패는 HTTP 503이며 등록을 재시도할 수 있습니다.
- Render에서 환경변수가 없거나 잘못되면 랭킹 API가 503을 반환합니다. 게임은 계속 실행됩니다.
- 로컬 개발은 환경변수가 없으면 `data/rankings.json`을 사용합니다 (`RANK_FILE`로 변경 가능).
- 기존 로컬 기록을 외부 DB로 자동 이관하지 않습니다. 이미 Render에서 삭제된 기록은 복원할 수 없습니다.

검증: `node --test tools/test-ranking-store.cjs`

참고: https://render.com/docs/free · https://upstash.com/docs/redis/features/restapi
