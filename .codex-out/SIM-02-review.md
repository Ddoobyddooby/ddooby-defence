통과

# SIM-02 독립 리뷰

- 검토일: 2026-11-25
- 대상: /Users/ddooby/Desktop/Ddooby/projects/ddooby-defence-sim-02, feat/sim-02, HEAD `50b320b77eb397bb50e2f0b29dc161f66328e64c`
- 범위: `git diff main...HEAD`, 13파일 +932/-100. SPEC 3·4·5·7절, SIM-CONTRACT 2.1·3.3·5·6·7·12·13·14절 및 현재 WORKFLOW 기준.
- 결과: 수정 요청할 기능 결함·회귀를 발견하지 못함. 이 판정은 SIM-02 코어 변경에 한정하며 출시/UI/밸런스 승인 또는 병합·push 실행을 뜻하지 않는다.
- 제품·테스트 코드·문서·Git 수정 없음. 이 결과 파일만 작성. 대상 worktree의 git status --short는 검토 전후 빈 출력.

## 확인 결과

| 요청 항목 | 근거와 판단 |
|---|---|
| 단계 순서 | attempt.ts stage4Combat → advanceProjectiles → fireTowers → runFireHook. 기존 투사체 projectileId 순, 타워 towerId 순. 새 투사체는 기존 투사체 순회 종료 후 생성되어 발사 틱 이동 없음. |
| 살아 있는 적 | advanceProjectiles의 single 대상 검색, fireTowers 후보, explode의 각 대상 모두 hp > 0 조건. 앞선 투사체가 죽인 적은 이후 피해·타깃에서 제외. frost의 치명타 후 slowApplied는 계약 14.5의 명시적 예외대로 기록. |
| 타깃·거리 | combat.ts 4모드 비교는 진행도/현재 HP/거리² 및 ID 동률 처리와 일치. 사거리·폭발 반경 모두 ≤ 경계 포함. 정수 helper 사용, 좌표 범위는 검증된 맵·콘텐츠에 제한. |
| 둔화 | 같은 출처 강도·만료 교체, 실효값 저장, 저항 반영, 최대 효과 하나만 속도에 사용. T ≥ expireTick 제거 및 최소 속도 1. 기존 combat.test.ts가 약화 교체·다른 출처 만료 후 재노출·저항 반올림·최소 속도 리터럴 검증. |
| 정리·스냅샷 | 8단계 single 대상 부재 정리, aoe는 유지. projectile 필드는 모두 생성하며 비해당 필드는 null. 적·타워·투사체·둔화 스냅샷 정렬, attempt-v3 확인. |
| 원자성·결정성 | step은 structuredClone한 작업 상태에서 진행하고 성공 시에만 this.s 교체. 아래 독립 probe에서 전투 후 예외 롤백 및 재시도, 저장 순서 교란 시 80틱 상태·이벤트 일치 직접 확인. 기존 리플레이 테스트는 0..120틱 해시 비교와 변경 명령의 첫 불일치 틱 10 검증. |
| 기대값 독립성 | combat.test.ts 주요 타깃·이동·피해·둔화·경계 기대값은 수기 리터럴. 리플레이 양쪽 동일 구현 비교는 재현성 증거이며 규칙 정확성은 별도 리터럴 사례가 담당. |
| Lv 누적 | levelStats.ts는 base + inc[0..N-2], validate.ts:283-298의 필드별 누적과 일치. 아래 독립 probe는 서로 다른 양/음 증분으로 Lv4 전체 필드 기대값 확인. |

## 구현자 판단 사항

- (a) 8단계 취소가 waveCleared 뒤, prepEntered/resultReached 앞인 순서는 SPEC의 7단계 판정 → 8단계 정리·전환과 일치한다. 별도 제품 규칙 변경으로 볼 근거 없음.
- (b) 만료 틱에 먼저 이동하고 미명중이면 제거하는 구현은 계약 14.4의 순서 그대로다. 삭제되는 좌표는 다음 스냅샷에 남지 않는다.
- (c) 판매는 준비 단계에서만 허용되고 준비 진입 때 생존 적이 없으므로, 정상 게임 입력으로 판매된 타워의 활성 둔화를 관찰하는 사례는 도달 불가다. 둔화 자체도 tower 존재를 참조하지 않아 출처 제거에 종속되지 않는다. 판매된 mage 투사체 진행 테스트는 별도로 존재한다.
- (d) 런타임 누적 helper 분리는 현재 검증기와 의미가 같다. 수정 불필요.

## 직접 실행한 보강 검증

기존 검증에서 명시되지 않은 전투 상태 롤백과 실제 엔티티 저장 순서 교란을 보강했다. 저장 순서를 바꾸기 위해 런타임 private 필드에 접근한 것은 이 일회성 probe에 한정한다. 소스 파일은 변경하지 않았다.

실행 위치: 대상 worktree. 아래 JavaScript를 `node -e '<아래 코드>'`로 실행(TypeScript transpileModule을 메모리에서 사용, 파일 생성 없음).

```js
const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {createAttempt}=require('./src/game/core/attempt/attempt.ts');
const {uniformStage2,withValues,seg,STAGE2_ID}=require('./src/game/core/attempt/testing/bundles.ts');
const bundle=withValues([['enemies[0].speedMtPerSec',1000],['stages[1].initialGold',3000],['towers[3].levels.base.projectileSpeedMtPerSec',100000]],uniformStage2({prepMs:150,clearReward:20,segments:[seg(0,100,5)]}));
let fail=false;
function make(hooks={}){const c=createAttempt(bundle,STAGE2_ID,1,hooks);for(const [type,col,row] of [['archer',0,0],['mage',0,2],['frost',1,0]])c.submit('build',{towerType:type,tile:{col,row}});c.submit('startWave',{});return c;}
const a=make({fire(){if(fail)throw Error('QA injected after combat');}}),b=make();
for(let t=1;t<=80;t++){if(t===2 || t===4){fail=true;const before=a.snapshot(),ledger=a.ledger();assert.throws(()=>a.step(),/QA injected/);assert.deepEqual(a.snapshot(),before);assert.deepEqual(a.ledger(),ledger);fail=false;}
b.s.enemies.reverse();b.s.towers.reverse();b.s.projectiles.reverse();for(const e of b.s.enemies)e.slows.reverse();
assert.deepEqual(a.step(),b.step());assert.deepEqual(a.snapshot(),b.snapshot());}
console.log('PASS: rollback after projectile/slow mutations; retry + reversed entity/slow storage: 80 ticks identical states and events');
const {towerLevelStats}=require('./src/game/core/content/levelStats.ts');
const def={levels:{base:{damage:10,rangeMt:1000,attackPeriodMs:1000,projectileSpeedMtPerSec:10000,projectileTtlMs:2000,slowBp:3000,slowDurationMs:2000},increments:[{damage:5,rangeMt:100,attackPeriodMs:-50,projectileSpeedMtPerSec:20,projectileTtlMs:50,slowBp:-500,slowDurationMs:50},{damage:7,rangeMt:200,attackPeriodMs:-100,projectileSpeedMtPerSec:40,projectileTtlMs:100,slowBp:100,slowDurationMs:100},{damage:9,rangeMt:300,attackPeriodMs:-150,projectileSpeedMtPerSec:60,projectileTtlMs:150,slowBp:200,slowDurationMs:150}]}};
assert.deepEqual(towerLevelStats(def,4),{damage:31,rangeMt:1600,attackPeriodMs:700,projectileSpeedMtPerSec:10120,projectileTtlMs:2300,slowBp:2800,slowDurationMs:2300});console.log('PASS: Lv4 all-field cumulative values with unequal signed increments');
```

실제 결과(exit 0):

```text
PASS: rollback after projectile/slow mutations; retry + reversed entity/slow storage: 80 ticks identical states and events
PASS: Lv4 all-field cumulative values with unequal signed increments
```

## 검증 출처·한계

- 직접 확인: 변경 코드·테스트·계약 대조, 위 독립 probe, 대상 HEAD 및 clean worktree.
- claude-main 보고(이 리뷰에서 재실행하지 않음): lint/typecheck/build exit 0, test 22파일/472개 통과.
- 영구 테스트 보강 후보(통과를 막는 결함 아님): 전투 상태 rollback·실제 저장 순서 교란 probe의 정식 테스트 편입, 저항 10000에서 slowBp 0 이벤트, frost 치명타의 slowApplied 및 결과 틱 잔존 aoe 스냅샷 전용 사례.
- CORE: 검토 범위 통과. ECON/STATE: 전투 연결·원자성 검토 및 probe 통과. DATA: 레벨 누적 연결 검토 통과. UI: 이번 변경 해당 없음.
- 실제 콘텐츠 수치·성능 상한·브라우저 간 런타임 비교·UI 동작은 이번 리뷰 검증 대상이 아니다.

