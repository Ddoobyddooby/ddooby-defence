지적 있음

# SIM-03 독립 코드 리뷰

- 검토일: 2026-11-25
- 대상: /Users/ddooby/Desktop/Ddooby/projects/ddooby-defence-sim-03
- 브랜치/HEAD: feat/sim-03 / `2bf8024b37cbf32732ef9d798adc29ca7fc23916`
- 범위: main 대비 16파일 +1448/-59. attempt.ts·sim/** 변경 없음 직접 확인.
- 기준: SIM-CONTRACT 15절, 7.3·7.4·13.3·14.8, SPEC 및 WORKFLOW의 결정성·무결성 게이트.
- 결론: **높음 1건, 보통 1건. SIM-03 반영 보류.** 기존 전투 코어의 결함으로 판정하는 것이 아니라 새 기록 생성기와 회귀 기준 보호의 결함이다.

## F1 — 높음: 종료 틱이 변하는 코어 회귀를 골든 갱신 가드가 허용

- 위치: `src/game/core/attempt/regression/golden.ts:177`
- 연관: `src/game/core/attempt/regression/regression.test.ts:19` (시나리오별 검증 즉시 파일 쓰기)
- 기준: SIM-CONTRACT 15.2, REQ-QA / 결정성·회귀 게이트.
- 원인: record 전체가 다르면 시나리오 변경으로 간주해 즉시 허용한다. 그러나 record.endTick은 R1/R2에서 입력이 아니라 **실행 결과**다. 코어 회귀만으로 결과 틱이 달라져도 동일 codeVersion·콘텐츠·명령의 회귀를 승인한다.
- 직접 재현: 디스크 파일은 건드리지 않고 TypeScript 로딩 시 메모리에서 적 이동 `addSafe(e.pathProgress, speed)`를 `addSafe(e.pathProgress, speed + 1)`로 변이.
  - R1: 기존 endTick 1093 → 1086. 기존 골든 verify는 ReplayEndMismatchError로 실패하나 assertUpdateAllowed는 **ALLOWED**.
  - R2: 259 → 258, 동일하게 **ALLOWED**.
  - 두 사례 모두 codeVersion·콘텐츠·명령 스크립트 변경 없음.
  - 피해 -1 변이도 R1 1093 → 790 / R2 259 → 232에서 같은 우회 재현.
- 영향: 회귀를 새 기준으로 덮어쓸 수 있다. 현재 갱신 루프는 R1/R2를 즉시 쓰므로 이후 R3 가드가 실패해도 앞 파일은 이미 교체되는 구조다. 파일 쓰기는 실제 실행하지 않았으며, 이 부분은 가드의 실행 결과와 루프 소스에 근거한 판단이다.
- 수정 제안: 시나리오 변경 여부를 실행 결과와 분리해 판단. 종료 정책(endTick 고정 또는 결과까지), 입력 콘텐츠/명령 등의 명시적 시나리오 정의를 비교하고, 계산된 endTick·initialStateHash 변경 자체를 승인 사유로 쓰지 말 것. 같은 코드 버전에서 동일 입력으로 발생한 해시/종료 틱 차이는 차단. 모든 시나리오 생성·가드·검증을 먼저 완료한 뒤 파일 쓰기.
- 재검증: 위 두 코어 변이에 모든 해당 골든 갱신 거부, R3에서 차단될 때 기존 R1/R2 바이트 불변, 정상 시나리오 입력 변경·코드 버전 변경은 의도대로 허용.

## F2 — 보통: 미적용 명령이 있으면 finish()가 유효하지 않은 ReplayRecord 반환

- 위치: `src/game/core/attempt/record.ts:104` 및 `:105`
- 기준: SIM-CONTRACT 15.1의 현재 completedTick 종료 및 validateReplayRecord 통과, 7.3의 applyTick ≤ endTick.
- 재현: createRecordedAttempt → core.submit("startWave", {}) → step 없이 finish().
- 실제: `endTick=0`, `commands[0].applyTick=1`. 생성된 기록을 validateReplayRecord에 넣으면 `ReplayStructureError`, 경로 `record.commands[0].applyTick`.
- 같은 문제는 진행 중 다음 틱 명령을 접수한 직후, 접수 뒤 일시정지, step 예외로 큐가 유지된 뒤에도 생긴다. 정상 공개 API 호출만으로 생성되는 무효 기록이다.
- 수정 제안: completedTick까지 완료된 기록을 반환하는 계약을 유지하려면 finish 결과에는 applyTick ≤ completedTick 명령만 복사하되, 내부 기록과 코어 큐는 보존하여 이후 성공한 step/finish에 포함할 것. 또는 큐가 있는 경우 finish의 명시적 오류 정책을 계약에 정의해야 한다. 미래 명령을 실행하기 위해 finish가 임의로 step하거나 endTick을 늘리지 말 것.
- 재검증: 최초 접수 직후·실행 중 접수 직후·일시정지·step 실패 후 finish, 이후 재시도 성공 후 finish. 성공 반환한 모든 기록은 validateReplayRecord 및 원 실행 완료 틱 trace 비교를 통과해야 한다. 기존 record.test.ts 마지막 사례는 실패한 step 후 endTick만 검사해서 무효 commands를 놓친다.

## 기타 검토 결과와 보강 후보

- 기록기: 즉시 거부 제외/적용 거부 포함, 접수 payload 복사, finish 깊은 동결, 제품 생성 함수에 훅·TEST_ONLY 의존 없음 확인. 정상 완료 틱에서 원 실행/재생 trace 일치 테스트 통과.
- 골든: 틱별 해시·최종 결과/골드/HP/경제 원장·2회 재생 비교·불변식 검사가 실제 수행된다. 아래 변이 3종 모두 최소 한 시나리오에서 검출. R1/R2에서 둔화 max→min 미검출은 둘째 frost가 있는 R3에서 틱 301 검출로 보완된다.
- F1~F8 테스트: 구조 오류 경로·호환성/초기 상태/종료 오류·0 step·첫 불일치 틱/상태·이벤트 경로/eventSeq·전투 예외 후 재시도 비교가 전반적으로 구체적이다. F8은 record를 고정한 해시 변조만 검사해 위 F1을 놓친다.
- 불변식 helper: econ.test의 독립 가격 리터럴 및 실제 ledger 대조는 유지됨. combat.test의 기존 실제 ledger 합 비교는 이벤트 delta 합 비교로 바뀌었으므로 완전히 동일한 검사는 아니다. 골든 생성 시 실제 ledger와 교차 검증하고 econ.test에서도 직접 대조하는 보완이 존재한다. 전투 랜덤 테스트에서도 실제 ledger 대조를 유지하면 이전 범위가 명확히 보존된다.
- REQ-TOWER-09: 다음 발사에서 last=e2/first=e1 차이는 직접 단언한다. 다만 `combat.test.ts:231`의 e2는 틱 21 생성, 모드 변경은 틱 2, 기존 투사체 명중은 틱 4라서 **비행 중에는 후보가 e1 하나뿐**이다. 즉 이미 발사된 투사체를 새 모드로 재선택하는 잘못된 구현을 이 전용 사례만으로 구분할 수 없다. 변경 시점 전에 first/last 대상이 다른 적 2명을 존재시키고 기존 투사체가 원래 적에 명중하는 사례로 보강 권고(현재 코어 타깃 변경 결함을 확인했다는 의미는 아님).
- 판단 사항 (a): POSIX 환경변수 명령은 현재 macOS에서 동작. Windows 셸 호환은 미검증이며 별도 지원 범위로 명시.
- (b): 시나리오별 requiredEvents는 빈 실행 방지에 합리적이나 계약 15.2의 “시나리오마다 … 웨이브 보상·기지 피해” 문구와 실제 분담은 다름. R2 패배 우선·R3 고정 종료의 예외를 문서에 명시 권고.
- (c): R2 마지막 적 도달/패배 틱의 이벤트·생존 적 없음·웨이브 보상 없음 검사 확인.
- (d): 이벤트 기반 ledger는 생성 시 실제 ledger()와 교차 검증되어 기준 파일에 포함됨.
- (e): 독립 경제 oracle 유지 확인.
- (f): any 사용은 변조 테스트에 제한되어 제품 타입 약화로 이어지지 않음. 파일 전체 비활성은 구간 제한 가능하지만 기능 차단 사유 아님.
- (g): 속도 4배는 TEST_ONLY 시나리오 정의에 제한, 게임 수치 승인으로 취급하지 않음.

## 직접 실행한 검증

1. 아래 명령: **3파일/49개 테스트 통과, exit 0**.
   `npm test -- src/game/core/attempt/record.test.ts src/game/core/attempt/regression/faults.test.ts src/game/core/attempt/regression/regression.test.ts`
2. 독립 메모리 변이/probe: 아래 코드와 결과. 무효 기록 재현 및 갱신 가드 우회 확인. 소스·골든 파일을 쓰지 않으므로 원복할 디스크 변이 없음.
3. 대상 HEAD 및 작업 트리 검토 전후 확인: 동일 HEAD, `git status --short` 빈 출력, `git diff --check` exit 0.
4. lint/typecheck/build 및 전체 25파일/523개 통과는 **claude-main 사전 보고**이며 이번 리뷰에서 재실행하지 않았다.

### 독립 재현 코드

대상 worktree에서 아래 코드를 `node -e`로 실행. import.meta.url 치환은 Node CommonJS 메모리 로더를 위한 처리이며 저장 파일에는 적용하지 않는다. 변이마다 프로젝트 모듈 캐시를 제거하여 독립 로딩한다.

```js
const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
let mutation=null;
require.extensions['.ts']=(m,f)=>{let src=fs.readFileSync(f,'utf8').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(f).href));if(mutation&&f.endsWith('/attempt/attempt.ts')){assert(src.includes(mutation[0]));src=src.replace(mutation[0],mutation[1]);}m._compile(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);};
const root=process.cwd()+'/src/game/core/';
function fresh(change){mutation=change;for(const k of Object.keys(require.cache))if(k.startsWith(root))delete require.cache[k];return {g:require(root+'attempt/regression/golden.ts'),sc:require(root+'attempt/regression/scenarios.ts').SCENARIOS};}
const {createRecordedAttempt}=require(root+'attempt/record.ts'),{uniformStage2,seg,STAGE2_ID}=require(root+'attempt/testing/bundles.ts'),{validateReplayRecord}=require(root+'sim/replay.ts');
const rec=createRecordedAttempt(uniformStage2({prepMs:150,clearReward:20,segments:[seg(0,0,1)]}),STAGE2_ID,1);
rec.core.submit('startWave',{});const record=rec.finish();
try{validateReplayRecord(record,{formatVersion:1,codeVersion:record.codeVersion,contentHash:record.contentHash});console.log('pending: VALID');}catch(e){console.log('pending:',e.name,e.path,'endTick='+record.endTick,'applyTick='+record.commands[0].applyTick);}
const clean=fresh(null);
const originals=clean.sc.map(s=>JSON.parse(fs.readFileSync(root+'attempt/regression/golden/'+s.id+'.json','utf8')));
for(const [name,change] of [['movement+1',['addSafe(e.pathProgress, speed)','addSafe(e.pathProgress, speed + 1)']],['damage-1',['e.hp - p.damage','e.hp - Math.max(0, p.damage - 1)']],['slow max->min',['Math.max(...e.slows.map((x) => x.slowBp))','Math.min(...e.slows.map((x) => x.slowBp))']]]){
 const {g,sc}=fresh(change);
 for(let i=0;i<sc.length;i++){const old=originals[i];let verdict;try{g.verifyGolden(old,sc[i]);verdict='MISSED';}catch(e){verdict=e.name+': '+e.message.split('\n')[0];}
 let guard;try{const next=g.buildGolden(sc[i]);try{g.assertUpdateAllowed(old,next);guard='ALLOWED';}catch(e){guard='BLOCKED';} console.log(name,sc[i].id,'verify='+verdict,'update='+guard,'endTick '+old.record.endTick+' -> '+next.record.endTick,'same commands='+ (JSON.stringify(old.record.commands)===JSON.stringify(next.record.commands)));}catch(e){console.log(name,sc[i].id,'verify='+verdict,'build failed: '+e.message);}
 }
}

```

### 실제 결과 요약

```text
pending: ReplayStructureError record.commands[0].applyTick endTick=0 applyTick=1
movement+1 R1: verify ReplayEndMismatchError, update ALLOWED, endTick 1093 -> 1086, same commands=true
movement+1 R2: verify ReplayEndMismatchError, update ALLOWED, endTick 259 -> 258, same commands=true
movement+1 R3: GoldenMismatchError first tick 1, update BLOCKED, endTick 500 -> 500
damage-1 R1: verify ReplayEndMismatchError, update ALLOWED, endTick 1093 -> 790, same commands=true
damage-1 R2: verify ReplayEndMismatchError, update ALLOWED, endTick 259 -> 232, same commands=true
damage-1 R3: GoldenMismatchError first tick 22, update BLOCKED, endTick 500 -> 500
slow max->min R1: verify MISSED, update ALLOWED, unchanged endTick 1093
slow max->min R2: verify MISSED, update ALLOWED, unchanged endTick 259
slow max->min R3: GoldenMismatchError first tick 301, update BLOCKED, endTick 500 -> 500
```

## 반영 보류·해제 조건

- 대상: 위 SIM-03 HEAD. CORE/STATE 기록 재현 및 QA 회귀 기준 보호 게이트.
- 반영 보류 근거: F1은 회귀 검출 기준 파일을 동일 버전 회귀로 교체하도록 허용하는 실제 가드 결함. F2는 정상 API 사용으로 재생 불가능한 기록 생성.
- 해제 조건: F1/F2 수정, 실패하던 재현의 회귀 테스트 추가·실행, 관련 기록·골든·실패 주입 및 불변식 기존 검사 재검증. 재리뷰는 이 파일에 최대 2회 추가.
- 제품·테스트·문서·Git·골든 수정 없음. QA 결과 파일만 작성. claude-main에게 원 요청 메시지로 결과와 보류·해제 조건을 회신한다.

## 재리뷰 1

지적 있음

- 검토일: 2026-11-25
- 대상: feat/sim-03 HEAD `61fdd746105aa42a496c36b8fab7fbdf7d6cb1e8` (`2bf8024..61fdd74` 중심)
- 판정: **원 F1·F2 수정 확인. 새 갱신 가드 우회 1건(높음)으로 반영 보류 유지.**

### 확인된 수정

- F2: 원 재현 `submit("startWave", {}) → finish()` 결과는 이제 `endTick=0, commands=[]`이며 `validateReplayRecord` 통과. 미적용 명령은 다음 step 성공 뒤 기록에 들어간다. 접수 직후·일시정지·예외 후 재시도 테스트도 확인했다.
- F1: 디스크 수정 없는 기존 메모리 변이 probe 재실행. 적 이동 +1에서 R1 `1093→1086`, R2 `259→258`; 피해 −1에서 R1 `1093→790`, R2 `259→232`. 네 경우 모두 기존 골든 재생 검증은 실패하고 새 `assertUpdateAllowed`도 **BLOCKED**. R3 둔화 max→min 변이도 틱 301에서 검출·차단. `inputOf`에는 콘텐츠 해시·stageId·attemptId·명령 스크립트·고정 틱/"result" 종료 정책만 있고 실행 결과 필드는 없다. R1/R2의 "result"는 실제 결과 틱 값과 독립적이다.
- `updateGoldens`는 전 시나리오의 후보 생성·가드 검사 뒤 쓰기 루프에 진입한다. 따라서 가드 실패 시 쓰기 0회가 코드와 주입 I/O 테스트에서 확인된다.
- 이전 `2bf8024`와 현재 HEAD의 R1/R2/R3 골든 JSON을 독립 비교: `record`, `tickHashes`, `outcome`, `finalGold`, `finalBaseHp`, `ledger`가 **세 파일 모두 동일**. `input`만 추가됐다.
- TOWER-09 변경 시점에 두 적이 사거리 안에 있는 사례 추가, 전투 랜덤 테스트의 실제 코어 원장 대조 복원 확인.
- 직접 실행: 관련 4파일 **103테스트 통과**. 전체 25파일/534테스트와 lint/typecheck/build 통과는 claude-main 보고이며 이번 재리뷰에서 재실행하지 않았다.

### RR1-F1 — 높음: 구형식 골든 허용 분기로 같은 버전의 회귀 갱신 가능

- 위치: `src/game/core/attempt/regression/golden.ts:203` (`previous.input === undefined` 즉시 허용); `regression.test.ts:19`의 갱신 경로에서 호출.
- 기준: SIM-CONTRACT 15.2 동일 코드 버전·동일 입력 정의의 결과 차이 갱신 거부, QA 회귀 기준 보호.
- 직접 재현(메모리만 사용): 정상 R1 골든에서 `delete old.input`; 같은 코드 버전·같은 명령으로 새 후보의 `tickHashes[1]`만 변경. `assertUpdateAllowed(old, changed)`는 오류 없이 통과하고 `updateGoldens([R1], io, () => changed)`가 I/O의 `write("R1")`을 호출했다. 실제 결과: `BYPASS: delete old.input, same-version/same-script changed hash accepted and written R1`. 디스크 골든은 변경하지 않았다.
- 영향: 현재 저장된 골든은 모두 `input`을 포함하지만, 필드 삭제나 구형식 파일 재도입 뒤 `npm run golden:update`를 실행하면 같은 버전의 회귀 기준을 덮어쓸 수 있다. 테스트는 구형식을 의도적으로 허용한다고 단언하므로 이 우회가 유지된다. F1의 핵심 보호 목적이 다시 깨진다.
- 수정 제안: 현재 세 골든의 마이그레이션이 이미 끝났으므로 동일 코드 버전의 `input` 없는 이전 골든은 **거부**한다. 최초 파일 부재(`previous === null`)와 실제 codeVersion 변경은 기존 정책대로 구분. 구형식 허용이 필요하다면 별도 일회성 마이그레이션 명령에서만 입력·기존 결과의 일치성을 검증하고 허용해야 한다.
- 해제 조건: 위 삭제 + 해시 변경 probe가 갱신을 거부하고 쓰기 0회, 구형식 골든에 대한 회귀 테스트, 정상 골든·입력 변경·코드 버전 변경 동작 재검증. 원 F1/F2 재현도 계속 통과해야 한다.

이번 재리뷰에서 대상 worktree의 제품·테스트 코드·문서·Git·골든 파일은 수정하지 않았다. 재리뷰 기록만 이 결과 파일에 추가했다.

## 재리뷰 2

통과

- 검토일: 2026-11-25. 대상: feat/sim-03 HEAD `3ea5077013191cb55378ac4c241d0e2d9ec88046`; `61fdd74..3ea5077`와 기존 재현을 확인.
- **RR1-F1 해소:** 정상 R1 골든에서 `input`을 삭제하고 같은 코드 버전·같은 명령의 새 후보 `tickHashes[1]`만 바꾼 이전 probe를 다시 실행했다. `assertUpdateAllowed`가 `GoldenMismatchError`를 던지고 `updateGoldens`는 쓰기 **0회**였다. 유효하지 않은 입력·손상된 이전 골든·다른 시나리오 ID를 거부하는 추가 검사 및 테스트 확인.
- **원 F1 회귀 없음:** 메모리 코어 변이 적 이동 +1의 R1 `1093→1086`·R2 `259→258`, 피해 −1의 R1 `1093→790`·R2 `259→232`에서 모두 기존 골든 검증 실패 및 새 가드 **BLOCKED**. R3 둔화 max→min은 틱 301에서 검출·차단. R1/R2에서 변이가 영향 없는 둔화 사례의 `ALLOWED`는 이전 골든과 생성 후보가 동일해서 정상 동작이다.
- **원 F2 회귀 없음:** 최초 접수 직후 `finish()` 기록의 `endTick=0, commands=[]`가 `validateReplayRecord`를 통과했다. 기존 접수·일시정지·step 예외 후 보존 및 다음 성공 틱 포함 테스트도 통과.
- **가드 판정:** 같은 버전의 이전 골든에서 `input`이 없거나 형식이 틀리면 갱신을 거부한다. 정상 `inputOf`는 콘텐츠 해시·stageId·attemptId·명령 스크립트·종료 정책만 포함하며 결과로 정해진 종료 틱은 포함하지 않는다. `updateGoldens`는 모든 후보 검사 후 쓰므로 가드 실패로 일부 골든만 갱신되지 않는다. 현재 API/스크립트의 정상 입력 경로에서 같은 버전·같은 입력의 결과 차이를 덮는 우회는 발견하지 못했다.
- **잔여 위험 판단:** 이전 골든 JSON의 `record.codeVersion`이나 유효한 `input`을 사람이 직접 위조하면 가드가 실제 코드/시나리오 변경과 구별할 수 없다. 이 보호는 변조 방지 서명이 아니라 회귀 갱신 실수 방지 장치이므로 **반영 차단 사유로 보지 않는다**. 낮춘 버전은 일반 검증에서 `StaleGoldenError`로 실패하고, 갱신을 통한 위조는 골든 변경 diff와 변경 사유 검토에서 확인해야 한다.
- 직접 실행: 관련 4파일 **111테스트 통과**; 재현 probe 모두 exit 0. claude-main의 전체 25파일/542테스트 및 lint/typecheck/build 통과는 사전 보고로 구분한다. 이번 두 커밋에서 골든 JSON·attempt.ts·record.ts·sim/**가 변경되지 않았음을 diff로 확인. 대상 worktree HEAD 동일, `git status --short` 빈 출력.

SIM-03 CORE/STATE 회귀·기록 QA **반영 보류 해제**. 이 판정은 이 리뷰의 결함 해제이며 실제 병합·push·배포를 수행하거나 승인하는 것은 아니다. 이번 재리뷰에서 대상 코드·골든·문서·Git은 수정하지 않았고 이 QA 파일에만 결과를 추가했다.

