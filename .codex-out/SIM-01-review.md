통과

# SIM-01 구현 독립 리뷰

- 대상: `feat/sim-01` @ `12741d9674729e1b402cd065fcea81915acc136d`
- worktree: `/Users/ddooby/Desktop/Ddooby/projects/ddooby-defence/wt-sim-01`
- 비교: `9bf927a..12741d9` (계약·baseHp·attempt 구현·테스트 포함)
- 기준: SPEC 7·9·10절, SIM-CONTRACT 2.1·4·5·7·11·12절, 요청된 TRACE 요구.
- 판정: **보통 3건, 낮음 1건**. 기본 틱 흐름은 확인됐으나 공개 훅·생성 경계에 아래 지적이 남는다.
- 방법: 코드·계약 읽기, 기존 검사, 파일을 생성하지 않는 독립 Node/Python/TypeScript 의미 검사. 제품·테스트·문서·Git 변경 없음.

## F1 — 보통: 훅의 쓰기 함수가 반환 후에도 살아 있어 틱 밖·결과 후 상태를 바꾼다

- 위치: `src/game/core/attempt/attempt.ts:247`~250행, `:332`~338행, `:211`; 관련 `attempt/types.ts:69`.
- 기준: SIM-CONTRACT 12.4의 단계별 쓰기 범위, SPEC 7절/REQ-STATE-01·06의 틱 순서·결과 이후 불변.
- 직접 재현 A: fire 훅에서 `ctx.damage`를 저장하고 첫 step을 반환한 뒤 저장한 함수를 호출한다. tick 1·HP 100이 **tick 1·HP 0**으로 바뀌며, 이미 반환된 이벤트는 waveStarted/enemySpawned 그대로다.
- 직접 재현 B: command 훅에서 `ctx.settle`를 저장하고, TEST_ONLY fire 처치로 5개 웨이브를 완료한다. victory/tick 5/gold 475에서 저장한 정산 함수를 호출하면 **victory/tick 5/gold 1475**, nextEventSeq 36→37, 원장에 `a2:late`가 추가된다. 새 틱·반환 이벤트 없이 결과 상태가 바뀐다.
- 현실적인 지연 호출도 가능하다: `fire: async ctx => { await Promise.resolve(); ctx.damage(1,100); }`는 현재 AttemptHooks 타입의 의미 검사를 통과한다(진단 0개). step은 Promise를 기다리거나 거부하지 않고 반환하고, microtask 뒤 같은 tick의 HP가 100→0으로 바뀌는 것을 재현했다.
- 원인: 콜백은 작업 상태 w를 캡처하며, 성공 시 그 w가 그대로 실제 상태가 된다. 콜백의 유효 기간·소속 단계 검사가 없다. 적 view 동결만으로는 쓰기 함수의 수명을 제한하지 못한다.
- 수정 제안: command/fire 훅 호출별 활성 토큰을 두고 **그 호출이 끝나면 finally에서 폐기**한다. damage/emit/settle은 해당 호출·단계가 활성일 때만 허용하고, 반환 후·다른 단계·결과 후 호출은 변경 전 오류로 처리한다. stepping 플래그만 확인하면 같은 step의 다른 단계에서 재사용하는 경우를 막지 못한다. 훅의 동기 실행 계약도 타입·런타임에서 명확히 제한한다.
- 재검증: 저장한 세 함수의 반환 후/다음 단계/다음 틱/결과 후 사용, 예외로 끝난 훅의 함수 재사용, async fire에서 tick·스냅샷·원장·카운터·반환 이벤트 불변.

## F2 — 보통: step 중 pause 호출 후 훅 예외가 나면 원자성이 깨진다

- 위치: `src/game/core/attempt/attempt.ts:141`~146행, `:196`~214행.
- 기준: SIM-CONTRACT 12.2의 pause/resume은 틱 밖 조작, step 주석의 훅 오류 시 상태 불변. REQ-STATE-11.
- 재현: fire 훅에서 `core.pause(); throw new Error("hook failed")`를 실행한다. startWave가 대기한 snapshot 0을 저장한 뒤 step을 호출한다.
- 실제: step은 예외, completedTick 0, 큐 보존이지만 **paused가 false→true**로 바뀌어 이전 스냅샷과 달라진다.
- 원인: step은 작업 사본 w를 만들지만 pause/resume은 stepping 여부를 검사하지 않고 원본 this.s를 직접 변경한다.
- 수정 제안: pause/resume 모두 step 실행 중에는 상태를 건드리기 전에 SimStateError를 던진다. 결과 단계 pause 거부 및 기존 틱 밖 pause/resume 정책은 유지한다.
- 재검증: command/slow/fire/speed 훅에서 pause/resume 호출 시 즉시 거부와 전체 상태 불변, 일반적인 틱 밖 pause·큐 보존·재개 회귀.
- 범위 구분: command 정산 뒤 throw, slow throw, fire 피해 뒤 throw, speed throw의 **보통 예외 4종은 모두 전체 스냅샷·원장 롤백에 성공**했다. 실패는 원본을 직접 변경하는 공개 조작 경로다.

## F3 — 보통: command 훅이 거부 사유를 반환해도 이미 정산한 골드·이벤트가 확정된다

- 위치: `src/game/core/attempt/attempt.ts:242`~257행.
- 기준: SPEC 8절의 실패 명령 상태 불변·원자적 경제 처리, SIM-CONTRACT 4절, REQ-STATE-08.
- 재현: handleCommand에서 `ctx.settle("build:c1",-100,"towerBuilt",{})`를 호출하고 `"occupied"`를 반환한다. initialGold 350에서 build 하나를 접수하고 step 실행.
- 실제: 이벤트가 towerBuilt(−100, goldAfter 250) → commandRejected(occupied)이고, 골드 **250**, 소비 키·원장도 남는다. 실패한 명령이 돈을 쓴 상태로 완료된다.
- 원인: 훅에 즉시 쓰기 함수를 주고, 반환 사유를 확인한 뒤 reject 이벤트만 추가한다. 성공/거부를 확정하는 명령별 경계가 없다. 훅이 throw하면 전체 step은 롤백되지만, 정상적인 거부 사유 반환은 롤백되지 않는다.
- 수정 제안: 훅의 변경을 명령 단위로 보류한 뒤 null일 때만 확정하거나, 거부 시 그 명령의 정산·소비 키·원장·이벤트·eventSeq 변경을 되돌린다. 이미 변경한 뒤 거부하는 훅을 프로토콜 오류로 간주해 step 전체를 실패시키는 방식도 상태 무결성을 보존할 수 있으나 계약·테스트에 명시해야 한다.
- 재검증: 정산/emit 뒤 거부, 앞 명령 성공 + 뒤 명령 거부, 중복 정산 키, 정산 뒤 throw. 성공한 앞 명령의 상태와 거부 이벤트 순번 정책도 독립 기대값으로 확인한다.
- 현재 ECON-01 구현을 리뷰한 것은 아니다. SIM-01이 제공하는 command 훅의 성공·거부 계약이 SPEC을 보존하는지에 대한 지적이다.

## F4 — 낮음: 공개 생성자로 콘텐츠 복사·동결 경계를 우회할 수 있다

- 위치: `src/game/core/attempt/attempt.ts:88`~94행; `attempt/index.ts:1`.
- 기준: SIM-CONTRACT 11.4·12.1의 콘텐츠 사본만 읽는 시도, 고정 contentHash.
- 재현: 유효 entry.content를 structuredClone한 객체를 `new AttemptCore(copy, entry.contentHash, 5)`에 전달한다. 생성 후 copy.global.enemies[0].hp를 100→999로 바꾸고 웨이브 시작.
- 실제: stageContent는 동결되지 않았고 생성되는 적 HP가 **999**다. contentHash는 원래 값 그대로다. 생성자가 입력 참조와 호출자가 준 해시를 그대로 보관한다.
- createAttempt 경로는 진입 재검증·깊은 복사·동결을 수행하여 이 재현의 대상이 아니다. 그러나 현재 공개 export는 강제된 단일 생성 경계가 아니다.
- 수정 제안: 검증·복사·동결을 수행하는 생성 경로만 외부에 제공하거나, 공개 생성자에서도 해당 소유권·해시 일관성을 확보한다. 생성 후 입력의 적·웨이브 값을 바꿔도 현재 시도와 해시가 유지되는 회귀를 확인한다.

## 계약 판단과 검증 범위

- 요청서의 타이머 판단은 2.1·12.3과 일치한다. 준비 0이 된 틱은 preparation이고 다음 틱 명령 전에 timer 전환하므로 그 틱 startWave는 wrongPhase다.
- 패배 틱 처치 골드는 5단계 지급, 완료 보상은 7단계 미지급이므로 SPEC 순서와 일치한다. 결과 후 적을 남겨 두는 것은 결과 스냅샷 보존으로 해석할 수 있고, 기본 경로의 결과 후 step/명령/pause 거부도 확인했다. resume은 false를 재설정하는 멱등 조작으로 기본 결과 상태를 바꾸지 않는다.
- 원본 묶음으로 진입 재검증한 후 단일 StageContent 사본을 쓰는 factory 방식은 적절하다. 12.1의 content 인자 표현은 실제 API가 받는 원본 ContentBundle을 뜻한다고 명확히 쓰면 혼동을 줄일 수 있다.
- 현재 plan 생략은 고정 콘텐츠·waveIndex·waveStartTick에서 재구성 가능하고 waveSpawnCursor가 포함되어 있으므로 누락 결함으로 보지 않는다. 원장 이력을 상태 해시에서 빼고 틱 이벤트로 비교하는 것도 7.1과 일치한다.
- **후속 연결 한계:** 현재 훅의 자체 상태 저장소는 없고, fire의 자기 투사체 상태·slow 상태는 스냅샷에 포함될 수 없다. SIM-02/ECON-01에서 코어 소유 상태·트랜잭션·정규 스냅샷에 추가해야 한다. 임의 closure 상태를 가진 훅의 재도전 초기화/실패 롤백/리플레이까지 이번 구현이 보장한다고 해석하면 안 된다. 이 한계 자체는 요청서에서 후속 범위로 명시되어 별도 지적 건수에 넣지 않는다.
- 새 baseHp는 계약 11절/StageDef/validator/시도 초기화/TEST_ONLY fixture에 연결됐다. 무효 값 10종은 해당 Stage만 격리하고 factory 생성이 거부됐다. 하한 1·상한 1000000은 통과했다.
- 새 TEST_ONLY 해시 golden을 별도 Python 표준 JSON 정렬/FNV로 다시 계산해 세 값 모두 확인했다: `07e8d06cf2585b0b`, `bfeaecf9ad26ae5f`, `37d63f5c229ebcfb`.
- 테스트 oracle은 틱·위치·이벤트 리터럴을 사용한다. 별도 검증에서도 start 틱 **1·11·21·31·41**, clear 틱 **8·18·28·38·48**의 독립 계산으로 48틱 전체 phase·진행도·HP·골드·이벤트 유형을 대조했다. 최종 victory/gold 500/baseHp 20/nextEventSeq 31이 일치했다.
- 같은 기록의 두 새 코어 리플레이 49개 스냅샷은 서로 같고, 별도로 직접 실행한 48틱 상태·이벤트와도 일치했다.
- 동결된 enemy view·배열과 사본 snapshot을 직접 변경해 보았고 실제 적 상태는 보호됐다. 피해 입력 null/boolean/문자열/소수/NaN/Infinity/음수 7종도 거부됐다. F1은 이 보호를 우회하는 쓰기 함수 수명 문제다.
- TEST_ONLY 주입·수치가 테스트 외 제품 소비 경로 또는 attempt 배럴 export로 연결된 흔적은 찾지 못했다. 실제 전투·경제·VFX·저장·화면은 해당 후속 태스크 범위다.

## 실행 증거

| 검사 | 직접 결과 |
|---|---|
| `npm run test` | exit 0, 19 files / **391 tests passed** |
| `npm run lint` | exit 0 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit 0 |
| 파일 없는 Node/Python/TS 프로브 | 위 4건 재현, 48틱 독립 대조·리플레이·baseHp·해시·훅 경계 확인 |
| `git diff --check 9bf927a..12741d9` | exit 2: `attempt/attempt.test.ts:414: new blank line at EOF` (기능 지적 건수에 미포함) |

- claude-main의 `npm run typecheck`·`npm run build` 성공 보고와 직접 검사를 구분했다. 이 리뷰에서 두 명령을 재실행하지 않았다.
- worktree는 시작·종료 시 모두 clean이었다. 생성 Vitest 결과 캐시만 정리했으며 tracked/untracked 변경 없음과 HEAD 유지를 확인했다.
- 작성 파일은 공유 폴더의 이 리뷰 하나다. 소스·테스트·문서 수정, checkout, 커밋·push·병합은 하지 않았다.


## 재리뷰 1

- 대상: `feat/sim-01` @ `3ff57425e26a95a90da15fdf709b1e45f0e58daf`, diff `12741d9..3ff5742`.
- 판정: **통과**. F1~F4와 수정 경계에서 남은 지적 없음. 첫 줄을 현재 판정으로 갱신하고 최초 리뷰 기록은 보존한다.
- 범위: 훅 수명·동기 실행·step 중 조작·명령 롤백·생성 경계와 해당 계약 보완, 함께 수정된 TEST_ONLY fixture 참조 분리만 확인했다.

### F1 — 해소

- 호출별 lease를 정상/예외 모두 finally에서 폐기하고, damage/emit/settle 사용 전에 검사한다.
- `12741d9` 소스를 메모리에서 실행해 저장된 damage 호출로 HP가 0이 되는 기존 문제를 다시 재현했다. 수정본은 호출 전 SimStateError로 거부하고 HP 100·스냅샷·원장을 유지했다.
- 승리 후 저장한 settle/emit 호출도 거부하며 스냅샷·원장이 그대로였다. 같은 step의 다음 command에서 이전 command의 emit/settle 재사용 2종, 다음 틱 slow 훅에서 이전 damage 사용, 예외로 끝난 command/fire 문맥 재사용도 모두 변경 없이 거부됐다.
- async 4종(command/slow/fire/speed)과 thenable 4종의 **8개 입력**은 step 전체를 실패시켰다. async command/fire가 await 전에 이미 정산/피해를 가한 경우도 포함했다. microtask 처리 뒤에도 기존 스냅샷·큐·골드·원장이 유지됐고 unhandled rejection은 0개였다.
- 별도 TS 의미 검사 **5종**에서 정상 동기 fire는 통과하고 async fire/slow/command/speed는 모두 거부됐다. 런타임 방어는 타입 우회 입력에 대해서도 확인했다.
- 보완된 계약 12.4의 호출별 수명·동기 훅·프로토콜 오류 롤백과 일치한다.

### F2 — 해소

- pause/resume에 stepping 검사를 추가했다. submit의 기존 검사와 함께 상태 변경 전에 차단한다.
- 이전 소스의 pause 후 예외에서 paused=true 잔존을 재현했고, 수정본에서는 paused=false와 기존 스냅샷이 유지됐다.
- command/slow/fire/speed × pause/resume/submit의 **12개 조합**을 독립 프로브로 확인했다. 모두 SimStateError, completedTick·큐·스냅샷·원장 불변이었다.
- 기존 테스트의 틱 밖 pause·큐 보존·resume·정상 진행 회귀도 통과했다.

### F3 — 해소

- 명령 처리 전 gold·소비 키·원장 길이·카운터·이벤트 길이를 체크포인트로 저장하고, 거부 사유 반환 시 복원 후 commandRejected를 남긴다.
- 이전 소스의 settle(−100) 뒤 occupied 반환에서 gold 250·towerBuilt/commandRejected·원장 1개를 재현했다. 수정본은 gold 350·commandRejected 하나·원장 0개였다.
- 별도 손 계산 시나리오: 명령 1이 emit + −10 성공, 명령 2가 emit + −20 후 거부, 명령 3이 거부된 키를 재사용해 −30 성공하고 같은 키 중복 정산을 시도했다.
- 정확한 기대 이벤트 5개(eventSeq 1..5), 최종 gold **310**, 원장 2개(eventSeq 2·4), nextEventSeq **6**, nextCommandSeq **4**가 모두 일치했다. 앞 성공은 유지되고 거부된 명령의 임시 이벤트·소비 키·정산만 사라졌다.
- throw·미지 거부 사유의 step 전체 롤백과 관련 회귀 테스트도 통과했다. 현재 문맥이 실제로 바꿀 수 있는 상태 범위와 체크포인트가 맞는다.

### F4 — 해소

- 공개 배럴은 AttemptCore를 type으로만 내보내고, 생성에는 모듈 비공개 CREATE_TOKEN 일치를 요구한다.
- 이전 생성자의 mutable 입력 HP 100→999 유입을 다시 재현했다. 수정본은 undefined/null/위조 symbol/문자열 토큰 **4종**을 거부했다.
- factory 생성 후 원본 적 HP·웨이브 보상을 바꿔도 현재 적 HP 100·contentHash·동결 StageContent가 유지됐다. 런타임 배럴에 생성자 값이 없다는 것도 직접 확인했다.
- 계약 12.1이 원본 bundle 인자·진입 재검증·복사/동결·단일 생성 경로로 명확해졌다.

### 부수 수정·실행 증거

- TEST_ONLY withValue의 삽입 객체도 structuredClone하도록 변경했다. 반환 객체를 바꿔도 전달한 객체가 유지되고, 전달한 객체를 다시 바꿔도 반환 객체가 유지되는 양방향 참조 분리를 확인했다.
- 이전 EOF 빈 줄은 제거됐다.

| 직접 검사 | 결과 |
|---|---|
| `npm run test` | exit 0, 20 files / **419 tests passed** |
| `npm run lint` | exit 0 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit 0 |
| `git diff --check 12741d9..3ff5742` | exit 0 |
| 이전/현재 소스 비교·훅 경계·명령 순서·생성·fixture·TS 의미 검사 | 최종 프로브 exit 0 |

- 이전 소스는 git show로 읽어 메모리에서 실행했다. checkout·소스 파일 생성 없이 비교했다.
- `npm run typecheck`·`npm run build` 성공은 claude-main 보고이며 이번에도 직접 재실행하지 않았다.
- 지정 리뷰 파일의 첫 줄과 이 섹션만 갱신했다. 생성 Vitest 결과 캐시를 정리한 뒤 worktree clean·tracked diff 없음·HEAD 유지를 확인했다. 전체 비교 `git diff --check 9bf927a..3ff5742`도 exit 0이었다.


