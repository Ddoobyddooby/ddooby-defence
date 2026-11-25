// UI-01 — 세션: advance(50ms·최대 5틱)·일시정지/숨김/결과, 명령·거부 피드백, UI 상태 전이, 결과·재도전·진행 상태.
// 기대값은 DEV_PLACEHOLDER 리터럴(Stage 1: 골드 300, archer 설치 100·환급 70, 길은 행 2)로 직접 계산한다.
import { describe, expect, it } from "vitest";
import { DEV_PLACEHOLDER } from "../content/devBundle";
import { menuView } from "./hudView";
import { MemoryProgressStore } from "./progress";
import { FEEDBACK_MS, GameSession } from "./session";

type Bundle = { stages: { baseHp: number; initialGold: number; waves: unknown[] }[]; enemies: { speedMtPerSec: number }[] };
const clone = (): Bundle => structuredClone(DEV_PLACEHOLDER) as unknown as Bundle;
const make = (bundle: unknown = DEV_PLACEHOLDER, store = new MemoryProgressStore()) => ({ session: new GameSession({ bundle, store }), store });
const tick = (s: GameSession): number => s.getRenderFrame()?.curr.tick ?? -1;
const battle = (s: GameSession) => s.getState().battle!;
/** 50ms 단위로 n틱 진행(한 번에 5틱 이하). */
const run = (s: GameSession, ticks: number): void => {
  for (let i = 0; i < ticks; i++) s.advance(50);
};

/**
 * 적이 즉시(5000mt/틱) 달려 기지에 닿는 묶음: 웨이브마다 4종·3특성이 1마리씩(Stage 1 등장 조건 충족), 준비 50ms.
 * 방어가 없으면 웨이브당 기지 피해 = normal 1 + fast 1 + heavy 3 + swarm 1 = 6.
 */
function sprint(baseHp: number): Bundle {
  const b = clone();
  for (const e of b.enemies) e.speedMtPerSec = 100000;
  const one = (enemyType: string, trait: string | null) => ({ startMs: 0, intervalMs: 0, count: 1, enemyType, trait });
  const segments = [one("normal", "controlResistance"), one("fast", "speedBoost"), one("heavy", "hpBoost"), one("swarm", null)];
  const w = (i: number) => ({ waveIndex: i + 1, role: ["basic", "focus", "newMix", "complex", "finale"][i], prepMs: 50, clearReward: 10, segments });
  for (const st of b.stages) {
    st.baseHp = baseHp;
    st.waves = [0, 1, 2, 3, 4].map(w);
  }
  return b;
}

describe("초기·화면 흐름", () => {
  it("처음에는 스테이지 선택 화면, 카드 [선택 가능, 잠김, 잠김], 전투 없음", () => {
    const { session } = make();
    const st = session.getState();
    expect(st.screen).toBe("stageSelect");
    expect(st.cards.map((c) => c.state)).toEqual(["available", "locked", "locked"]);
    expect(st.battle).toBeNull();
    expect(session.getState()).toBe(st); // 변경이 없으면 같은 객체(useSyncExternalStore)
  });
  it("잠긴 스테이지는 시작할 수 없다", () => {
    const { session } = make();
    expect(session.startStage(1)).toBe(false);
    expect(session.getState().screen).toBe("stageSelect");
  });
  it("Stage 1 시작: 전투 화면·HUD 초기값", () => {
    const { session } = make();
    expect(session.startStage(0)).toBe(true);
    expect(battle(session)).toMatchObject({ stageIndex: 0, attemptId: 1, feedback: null, result: null });
    expect(battle(session).hud).toMatchObject({ stageName: "초원 전초기지", gold: 300, baseHp: 20, phase: "preparation", waveIndex: 1 });
  });
  it("진입 재검증 실패: 카드가 콘텐츠 오류가 되고 전투가 시작되지 않는다(검증 통과 뒤 묶음을 망가뜨린 경우)", () => {
    const b = clone();
    const { session } = make(b);
    b.stages[0].baseHp = 0; // 생성 시 사전 검증은 통과했고 그 뒤 원본이 오염됨 → 진입 재검증이 잡는다
    expect(session.startStage(0)).toBe(false);
    const st = session.getState();
    expect(st.cards[0].state).toBe("contentError");
    expect(st.cards[0].diagnostics[0]).toContain("stages[0].baseHp");
    expect(st.screen).toBe("stageSelect");
  });
  it("사전 검증 실패 스테이지는 처음부터 contentError 이고 시작 불가, 다른 스테이지는 영향 없음", () => {
    const b = clone();
    b.stages[0].baseHp = 0;
    const { session } = make(b);
    expect(session.getState().cards.map((c) => c.state)).toEqual(["contentError", "locked", "locked"]);
    expect(session.startStage(0)).toBe(false);
  });
});

describe("advance: 벽시계 → 50ms 틱 (SIM-CONTRACT 2절·UI-CONTRACT 5절)", () => {
  it("49ms 는 0틱, 1ms 더하면 1틱, 120ms 는 2틱(20ms 남음)", () => {
    const { session } = make();
    session.startStage(0);
    expect(session.advance(49)).toBe(0);
    expect(tick(session)).toBe(0);
    expect(session.advance(1)).toBe(1);
    expect(session.advance(120)).toBe(2);
    expect(tick(session)).toBe(3);
    expect(session.advance(30)).toBe(1); // 20 + 30 = 50
  });
  it("한 번에 최대 5틱, 한도를 넘은 누적은 버린다(다음 49ms 는 0틱)", () => {
    const { session } = make();
    session.startStage(0);
    expect(session.advance(1000)).toBe(5);
    expect(tick(session)).toBe(5);
    expect(session.advance(49)).toBe(0);
  });
  it("음수·NaN·Infinity 입력은 무시", () => {
    const { session } = make();
    session.startStage(0);
    for (const v of [-50, Number.NaN, Number.POSITIVE_INFINITY]) expect(session.advance(v)).toBe(0);
    expect(tick(session)).toBe(0);
  });
  it("일시정지 중 0틱(코어 paused), 재개하면 진행하고 누적은 일시정지 전 값에서 이어진다", () => {
    const { session } = make();
    session.startStage(0);
    session.advance(40);
    session.pause();
    expect(battle(session).hud).toMatchObject({ paused: true, phaseLabel: "준비", controlsEnabled: false });
    expect(session.advance(500)).toBe(0);
    expect(tick(session)).toBe(0);
    session.resume();
    expect(session.advance(10)).toBe(1); // 40 + 10
    expect(battle(session).hud.paused).toBe(false);
  });
  it("togglePause 와 결과 단계에서의 pause 무시", () => {
    const { session } = make();
    session.startStage(0);
    session.togglePause();
    expect(battle(session).hud.paused).toBe(true);
    session.togglePause();
    expect(battle(session).hud.paused).toBe(false);
  });
  it("숨김(hidden) 동안 0틱·누적 안 함, 숨겨질 때 자동 일시정지, 복귀 시 누적은 0부터(40ms 쌓아 둔 값도 버려짐)", () => {
    const { session } = make();
    session.startStage(0);
    session.advance(40);
    session.setHidden(true);
    expect(battle(session).hud.paused).toBe(true); // MOB-02: 숨김 → 자동 일시정지
    expect(session.advance(5000)).toBe(0);
    session.setHidden(false);
    expect(battle(session).hud.paused).toBe(true); // 복귀해도 사용자가 재개할 때까지 일시정지
    expect(session.advance(49)).toBe(0); // 복귀 직후 첫 입력은 버린다(F1)
    session.resume();
    expect(session.advance(49)).toBe(0); // 누적은 0부터
    expect(session.advance(1)).toBe(1);
  });
  it("리뷰 F1: 숨김 복귀 직후 첫 advance 는 얼마나 커도 0틱(기준만 재설정, 재개를 먼저 했어도 동일), 그다음 정상 진행", () => {
    const { session } = make();
    session.startStage(0);
    session.advance(40);
    session.setHidden(true);
    session.setHidden(false);
    session.resume(); // 사용자가 재개를 먼저 눌러도 숨김 시간이 섞인 첫 프레임은 버린다
    expect(session.advance(10000)).toBe(0);
    expect(tick(session)).toBe(0);
    expect(session.advance(50)).toBe(1);
    expect(session.advance(49)).toBe(0);
    expect(session.advance(1)).toBe(1);
  });
  it("리뷰 F1: 숨김 상태가 아니었다면 setHidden(false)는 첫 입력을 버리지 않고, 연속 setHidden(true) 뒤 복귀해도 한 번만 버린다", () => {
    const { session } = make();
    session.startStage(0);
    session.setHidden(false); // 숨김이 아니었으므로 변화 없음
    expect(session.advance(50)).toBe(1);
    session.setHidden(true);
    session.setHidden(true);
    session.setHidden(false);
    session.resume();
    expect(session.advance(50)).toBe(0);
    expect(session.advance(50)).toBe(1);
  });
  it("MOB-02 자동 일시정지: 전투 중에도 숨기면 일시정지, 이미 일시정지면 그대로(재개되지 않음), 스테이지 선택 화면에서는 아무 일도 없다", () => {
    const { session } = make();
    session.setHidden(true); // 전투 아님: 오류 없이 무시
    session.setHidden(false);
    session.startStage(0);
    session.advance(0); // 복귀 직후 첫 입력은 버려지므로 먼저 소비
    session.startWave();
    session.advance(100);
    expect(battle(session).hud.phase).toBe("combat");
    session.setHidden(true);
    expect(battle(session).hud.paused).toBe(true);
    session.setHidden(false);
    expect(battle(session).hud.paused).toBe(true);
    session.pause(); // 이미 일시정지: 변화 없음
    session.setHidden(true);
    expect(battle(session).hud.paused).toBe(true);
  });
  it("MOB-02 자동 일시정지: 결과 단계에서는 pause 를 호출하지 않는다(코어 오류 방지)", () => {
    const { session } = make(sprint(100));
    session.startStage(0);
    session.startWave();
    run(session, 200);
    expect(battle(session).result?.outcome).toBe("victory");
    expect(() => session.setHidden(true)).not.toThrow();
    expect(() => session.openMenu()).not.toThrow();
    expect(battle(session).hud.paused).toBe(false);
  });
  it("스테이지 선택 화면에서는 틱이 없다", () => {
    const { session } = make();
    expect(session.advance(1000)).toBe(0);
  });
  it("보간 비율 alpha = 남은 누적 / 50", () => {
    const { session } = make();
    session.startStage(0);
    session.advance(70);
    expect(session.getRenderFrame()?.alpha).toBeCloseTo(0.4, 5);
  });
});

describe("명령·거부 피드백 (UI-CONTRACT 5·7절)", () => {
  const start = () => {
    const m = make();
    m.session.startStage(0);
    return m.session;
  };
  it("설치 성공: 다음 틱에 골드 300 → 200, 타워 1개, 피드백 없음", () => {
    const s = start();
    expect(s.build("archer", { col: 0, row: 0 })).toEqual({ ok: true });
    s.advance(50);
    expect(battle(s).hud.gold).toBe(200);
    expect(s.getRenderFrame()?.curr.towers).toHaveLength(1);
    expect(battle(s).feedback).toBeNull();
  });
  it("경로 칸(행 2) 설치 → '여기에는 설치할 수 없습니다', 골드·타워 불변", () => {
    const s = start();
    s.build("archer", { col: 0, row: 2 });
    s.advance(50);
    expect(battle(s).feedback).toBe("여기에는 설치할 수 없습니다");
    expect(battle(s).hud.gold).toBe(300);
    expect(s.getRenderFrame()?.curr.towers).toHaveLength(0);
  });
  it("골드 부족: 3개 설치(300) 뒤 4번째 → '골드가 부족합니다'", () => {
    const s = start();
    for (const col of [0, 1, 2]) s.build("archer", { col, row: 0 });
    s.advance(50);
    expect(battle(s).hud.gold).toBe(0);
    s.build("archer", { col: 3, row: 0 });
    s.advance(50);
    expect(battle(s).feedback).toBe("골드가 부족합니다");
  });
  it("이미 타워가 있는 칸 → '이미 타워가 있습니다', 맵 밖 → '맵 밖입니다'", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    expect(battle(s).feedback).toBe("이미 타워가 있습니다");
    s.build("archer", { col: 99, row: 0 });
    s.advance(50);
    expect(battle(s).feedback).toBe("맵 밖입니다");
  });
  it("최고 레벨·타워 없음 거부 문구, 전투 중 판매 거부(지금은 할 수 없습니다)", () => {
    const b = clone();
    b.stages[0].initialGold = 1000;
    const { session: s } = make(b);
    s.startStage(0);
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    for (let i = 0; i < 3; i++) {
      s.upgrade(1);
      s.advance(50);
    }
    s.upgrade(1);
    s.advance(50);
    expect(battle(s).feedback).toBe("최고 레벨입니다");
    s.upgrade(77);
    s.advance(50);
    expect(battle(s).feedback).toBe("타워가 없습니다");
    s.startWave();
    s.advance(50);
    s.sell(1);
    s.advance(50);
    expect(battle(s).feedback).toBe("지금은 할 수 없습니다");
  });
  it("피드백은 2초(UI 시계) 뒤 사라진다 — 일시정지 중에도 시간은 흐른다", () => {
    const s = start();
    s.build("archer", { col: 0, row: 2 });
    s.advance(50);
    expect(battle(s).feedback).not.toBeNull();
    s.pause();
    s.advance(FEEDBACK_MS - 1);
    expect(battle(s).feedback).not.toBeNull();
    s.advance(1);
    expect(battle(s).feedback).toBeNull();
  });
  it("일시정지 중 명령은 제출되지 않고 안내 피드백", () => {
    const s = start();
    s.pause();
    expect(s.build("archer", { col: 0, row: 0 })).toEqual({ ok: false, reason: "paused" });
    expect(battle(s).feedback).toBe("일시정지 중에는 할 수 없습니다");
    s.resume();
    s.advance(50);
    expect(s.getRenderFrame()?.curr.towers).toHaveLength(0);
  });
  it("조기 시작: 준비 → 전투, 준비 중이 아닐 때 다시 보내면 wrongPhase 거부", () => {
    const s = start();
    s.startWave();
    s.advance(50);
    expect(battle(s).hud).toMatchObject({ phase: "combat", phaseLabel: "전투" });
    s.startWave();
    s.advance(50);
    expect(battle(s).feedback).toBe("지금은 할 수 없습니다");
  });
  it("타깃 변경 명령이 코어에 반영된다", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    s.setTargeting(1, "strong");
    s.advance(50);
    expect(s.getRenderFrame()?.curr.towers[0].targetingMode).toBe("strong");
  });
});

describe("UI 상태 전이 (UI-CONTRACT 6절)", () => {
  const start = () => {
    const m = make();
    m.session.startStage(0);
    return m.session;
  };
  it("설치 모드: 같은 항목 다시 탭하면 해제, 다른 종류로 바꿀 수 있고 선택은 해제", () => {
    const s = start();
    s.togglePlaceMode("archer");
    expect(battle(s).ui.placeType).toBe("archer");
    s.togglePlaceMode("mage");
    expect(battle(s).ui.placeType).toBe("mage");
    s.togglePlaceMode("mage");
    expect(battle(s).ui.placeType).toBeNull();
  });
  it("설치 모드에서 칸 탭: build 제출 후 모드 종료(성공·실패 무관) — 경로 칸 실패여도 종료", () => {
    const s = start();
    s.togglePlaceMode("archer");
    s.tapCell({ col: 0, row: 0 });
    expect(battle(s).ui.placeType).toBeNull();
    s.advance(50);
    expect(s.getRenderFrame()?.curr.towers).toHaveLength(1);
    s.togglePlaceMode("archer");
    s.tapCell({ col: 0, row: 2 }); // 경로 칸
    expect(battle(s).ui.placeType).toBeNull();
    s.advance(50);
    expect(battle(s).feedback).toBe("여기에는 설치할 수 없습니다");
  });
  it("설치 모드에서 맵 밖(null) 탭: 명령 없이 모드만 해제, 골드·타워 불변", () => {
    const s = start();
    s.togglePlaceMode("archer");
    s.tapCell(null);
    expect(battle(s).ui.placeType).toBeNull();
    s.advance(50);
    expect(battle(s).hud.gold).toBe(300);
    expect(s.getRenderFrame()?.curr.towers).toHaveLength(0);
  });
  it("기본 모드: 타워 칸 탭 → 선택(상세), 빈 칸 탭 → 선택 해제, Esc 로도 해제", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    s.tapCell({ col: 0, row: 0 });
    expect(battle(s).ui.selectedTowerId).toBe(1);
    expect(battle(s).hud.detail?.name).toBe("궁수탑");
    s.tapCell({ col: 5, row: 0 });
    expect(battle(s).ui.selectedTowerId).toBeNull();
    s.tapCell({ col: 0, row: 0 });
    s.cancel();
    expect(battle(s).ui.selectedTowerId).toBeNull();
  });
  it("Esc 순서: 판매 확인 → 설치 모드 → 선택 순으로 한 단계씩", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    s.selectTower(1);
    s.requestSell(1);
    expect(battle(s).ui).toMatchObject({ selectedTowerId: 1, sellConfirmId: 1 });
    s.cancel();
    expect(battle(s).ui).toMatchObject({ selectedTowerId: 1, sellConfirmId: null });
    s.cancel();
    expect(battle(s).ui.selectedTowerId).toBeNull();
    s.togglePlaceMode("frost");
    s.cancel();
    expect(battle(s).ui.placeType).toBeNull();
  });
  it("판매 확인: 확인창 중에는 맵 입력 무시, 취소하면 닫힘, 확인하면 다음 틱에 판매(환급 70)·선택 해제", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    s.selectTower(1);
    s.requestSell(1);
    s.tapCell({ col: 5, row: 0 }); // 확인창 중 맵 탭은 무시
    expect(battle(s).ui).toMatchObject({ selectedTowerId: 1, sellConfirmId: 1 });
    s.cancelSell();
    expect(battle(s).ui.sellConfirmId).toBeNull();
    s.requestSell(1);
    s.confirmSell();
    s.advance(50);
    expect(battle(s).hud.gold).toBe(270); // 200 + floor(100 × 0.7)
    expect(s.getRenderFrame()?.curr.towers).toHaveLength(0);
    expect(battle(s).ui).toMatchObject({ selectedTowerId: null, sellConfirmId: null });
  });
  it("판매 확인은 준비 → 전투 전환 시 자동 취소(선택은 유지)", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    s.selectTower(1);
    s.requestSell(1);
    s.startWave();
    s.advance(50);
    expect(battle(s).hud.phase).toBe("combat");
    expect(battle(s).ui).toMatchObject({ selectedTowerId: 1, sellConfirmId: null });
  });
  it("전투 중 판매 요청은 확인창을 열지 않고 안내 피드백", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.startWave();
    s.advance(50);
    s.selectTower(1);
    s.requestSell(1);
    expect(battle(s).ui.sellConfirmId).toBeNull();
    expect(battle(s).feedback).toBe("준비 단계에서만 판매할 수 있습니다");
  });
  it("일시정지 중 설치 모드 진입 불가(안내), 일시정지 전에 정해 둔 선택은 재개 후에도 유지", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    s.selectTower(1);
    s.pause();
    s.togglePlaceMode("mage");
    expect(battle(s).ui.placeType).toBeNull();
    s.resume();
    expect(battle(s).ui.selectedTowerId).toBe(1);
  });
});

describe("결과·재도전·진행 상태", () => {
  it("패배(기지 HP 1, 방어 없음): 결과 뷰·입력 차단·틱 정지, 클리어 플래그 없음, 다음 스테이지는 잠겨 비활성", () => {
    const { session: s, store } = make(sprint(1));
    s.startStage(0);
    s.startWave();
    run(s, 30);
    const b = battle(s);
    expect(b.hud).toMatchObject({ phase: "defeat", phaseLabel: "패배", isResult: true, controlsEnabled: false });
    expect(b.result).toMatchObject({ outcome: "defeat", stageName: "초원 전초기지", reachedWave: 1, baseHp: 0, maxBaseHp: 1, hasNext: true, nextEnabled: false });
    expect(store.getCleared()).toEqual([]);
    const t = tick(s);
    expect(s.advance(1000)).toBe(0);
    expect(tick(s)).toBe(t);
    expect(s.build("archer", { col: 0, row: 0 })).toEqual({ ok: false, reason: "result" });
    s.pause(); // 결과 단계에서는 무시
    expect(battle(s).hud.paused).toBe(false);
  });
  it("승리(5웨이브 모두 통과): 클리어 플래그·다음 스테이지 해금, 결과에 도달 웨이브 5·다음 활성", () => {
    const { session: s, store } = make(sprint(100));
    s.startStage(0);
    s.startWave();
    run(s, 200);
    const b = battle(s);
    expect(b.hud.phase).toBe("victory");
    expect(b.result).toMatchObject({ outcome: "victory", reachedWave: 5, waveTotal: 5, baseHp: 70, maxBaseHp: 100, hasNext: true, nextEnabled: true });
    expect(store.getCleared()).toEqual([DEV_PLACEHOLDER.stages[0].stageId]);
    expect(s.getState().cards.map((c) => c.state)).toEqual(["cleared", "available", "locked"]);
  });
  it("재도전: 같은 스테이지·새 attemptId·새 상태(골드·타워 초기화), 클리어 플래그 유지", () => {
    const { session: s, store } = make(sprint(100));
    s.startStage(0);
    s.build("archer", { col: 0, row: 0 });
    s.startWave();
    run(s, 200);
    expect(battle(s).result?.outcome).toBe("victory");
    expect(s.retry()).toBe(true);
    expect(battle(s)).toMatchObject({ stageIndex: 0, attemptId: 2, result: null });
    expect(battle(s).hud).toMatchObject({ gold: 300, phase: "preparation", waveIndex: 1 });
    expect(s.getRenderFrame()?.curr.towers).toEqual([]);
    expect(store.getCleared()).toHaveLength(1);
  });
  it("스테이지 선택으로 돌아가면 화면이 바뀌고 클리어 표시 유지, 다음 스테이지로 진행하면 stageIndex 1", () => {
    const { session: s } = make(sprint(100));
    s.startStage(0);
    s.startWave();
    run(s, 200);
    s.toStageSelect();
    expect(s.getState().screen).toBe("stageSelect");
    expect(s.getState().cards[0].state).toBe("cleared");
    s.startStage(0);
    s.startWave();
    run(s, 200);
    expect(s.nextStage()).toBe(true);
    expect(battle(s)).toMatchObject({ stageIndex: 1, attemptId: 3 });
    expect(battle(s).hud.stageName).toBe("눈 내리는 협곡");
  });
  it("Stage 3 결과에는 다음 스테이지가 없다(hasNext false)", () => {
    const { session: s, store } = make(sprint(100));
    for (const st of DEV_PLACEHOLDER.stages.slice(0, 2)) store.markCleared(st.stageId);
    s.startStage(2);
    s.startWave();
    run(s, 200);
    expect(battle(s).result).toMatchObject({ outcome: "victory", hasNext: false, nextEnabled: false });
    expect(s.nextStage()).toBe(false);
  });
  it("VFX 이벤트는 drainEvents 로 한 번만 가져간다", () => {
    const { session: s } = make();
    s.startStage(0);
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    const first = s.drainEvents();
    expect(first.map((e) => e.type)).toEqual(["towerBuilt", "economySettled"]);
    expect(s.drainEvents()).toEqual([]);
  });
  it("구독: 상태가 바뀔 때만 알리고 해제할 수 있다", () => {
    const { session: s } = make();
    let n = 0;
    const off = s.subscribe(() => n++);
    s.startStage(0);
    expect(n).toBe(1);
    s.advance(10); // 틱 없음 → 알리지 않음
    expect(n).toBe(1);
    s.advance(40);
    expect(n).toBe(2);
    off();
    s.advance(50);
    expect(n).toBe(2);
  });
});

describe("리뷰 UI-01 F6: 같은 명령 이중 제출 방지(적용 틱까지)", () => {
  const start = () => {
    const m = make();
    m.session.startStage(0);
    return m.session;
  };
  it("지금 시작 두 번 연속: 두 번째는 pending 으로 거부(코어에 안 보냄), 거부 문구 없음, 적용 후 전투", () => {
    const s = start();
    expect(s.startWave()).toEqual({ ok: true });
    expect(battle(s).hud.prep?.canStartNow).toBe(false);
    expect(s.startWave()).toEqual({ ok: false, reason: "pending" });
    s.advance(50);
    expect(battle(s).hud).toMatchObject({ phase: "combat", prep: null });
    expect(battle(s).feedback).toBeNull();
  });
  it("강화 두 번 연속: 골드 한 번만 차감(300-100-80=120), 거부 문구 없음, 적용 후 다시 활성", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    s.selectTower(1);
    expect(s.upgrade(1)).toEqual({ ok: true });
    expect(battle(s).hud.detail?.canUpgrade).toBe(false);
    expect(s.upgrade(1)).toEqual({ ok: false, reason: "pending" });
    s.advance(50);
    expect(battle(s).hud.gold).toBe(120);
    expect(battle(s).hud.detail).toMatchObject({ level: 2, canUpgrade: true });
    expect(battle(s).feedback).toBeNull();
  });
  it("판매 확인 두 번 연속: 한 번만 판매(골드 200+70=270), 거부 문구 없음", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    expect(s.sell(1)).toEqual({ ok: true });
    expect(s.sell(1)).toEqual({ ok: false, reason: "pending" });
    s.advance(50);
    expect(battle(s).hud.gold).toBe(270);
    expect(battle(s).feedback).toBeNull();
  });
  it("대기 중에 일시정지해도 pending 은 다음 step 까지 유지, 재개 후 첫 틱에 해제", () => {
    const s = start();
    s.startWave();
    s.pause();
    expect(s.startWave()).toEqual({ ok: false, reason: "paused" });
    s.resume();
    expect(s.startWave()).toEqual({ ok: false, reason: "pending" });
    s.advance(50);
    expect(battle(s).hud.phase).toBe("combat");
  });
  it("서로 다른 타워·다른 종류 명령은 막지 않는다", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.build("archer", { col: 1, row: 0 });
    s.advance(50);
    expect(s.upgrade(1)).toEqual({ ok: true });
    expect(s.upgrade(2)).toEqual({ ok: true });
    expect(s.setTargeting(1, "last")).toEqual({ ok: true });
  });
});

describe("MOB-02: ⚙ 메뉴(= 일시정지)·스테이지 선택 확인", () => {
  const start = () => {
    const { session } = make();
    session.startStage(0);
    return session;
  };
  it("메뉴를 열면 일시정지(0틱), 닫으면 재개·진행", () => {
    const s = start();
    s.openMenu();
    expect(battle(s).hud.paused).toBe(true);
    expect(s.advance(500)).toBe(0);
    s.closeMenu();
    expect(battle(s).hud.paused).toBe(false);
    expect(s.advance(50)).toBe(1);
  });
  it("메뉴 안 `스테이지 선택`: 확인창 → 취소하면 메뉴 유지, 확인하면 시도를 버리고 선택 화면, 닫으면(재개) 확인창도 사라진다", () => {
    const s = start();
    s.requestLeave(); // 메뉴가 닫혀 있으면 무시
    expect(battle(s).ui.leaveConfirm).toBe(false);
    s.openMenu();
    s.requestLeave();
    expect(battle(s).hud.leaveConfirm).toBe(true);
    s.cancelLeave();
    expect(battle(s).hud).toMatchObject({ leaveConfirm: false, paused: true });
    s.requestLeave();
    s.closeMenu();
    expect(battle(s).hud).toMatchObject({ leaveConfirm: false, paused: false });
    s.openMenu();
    s.confirmLeave(); // 확인창 없이는 나가지 않는다
    expect(s.getState().screen).toBe("battle");
    s.requestLeave();
    s.confirmLeave();
    expect(s.getState()).toMatchObject({ screen: "stageSelect", battle: null });
  });
  it("메뉴를 열면 판매 확인창은 취소된다(메뉴와 겹치지 않음)", () => {
    const s = start();
    s.build("archer", { col: 0, row: 0 });
    s.advance(50);
    s.selectTower(1);
    s.requestSell(1);
    expect(battle(s).ui.sellConfirmId).toBe(1);
    s.openMenu();
    expect(battle(s).ui).toMatchObject({ sellConfirmId: null, selectedTowerId: 1 });
  });
  it("결과 단계에서는 메뉴를 열 수 없다", () => {
    const { session } = make(sprint(100));
    session.startStage(0);
    session.startWave();
    run(session, 200);
    session.openMenu();
    session.requestLeave();
    expect(battle(session).hud.paused).toBe(false);
    expect(battle(session).ui.leaveConfirm).toBe(false);
  });
  it("메뉴 파생 값: 준비 단계는 단계만, 전투 단계는 생성 진행 `k / 전체`·생존 적 수", () => {
    const s = start();
    expect(menuView(battle(s).hud)).toEqual({ stageName: "초원 전초기지", phaseLabel: "준비", spawnText: null, alive: null });
    s.startWave();
    s.advance(50);
    s.openMenu();
    expect(menuView(battle(s).hud)).toEqual({ stageName: "초원 전초기지", phaseLabel: "전투", spawnText: "1 / 6", alive: 1 });
  });
});

describe("MOB-02: 타워 정보 창(일시정지 없음)", () => {
  const start = () => {
    const { session } = make();
    session.startStage(0);
    session.build("archer", { col: 0, row: 0 });
    session.advance(50);
    return session;
  };
  it("선택한 타워가 없으면 열리지 않고, 있으면 열린다(진행 시간은 계속 흐른다)", () => {
    const s = start();
    s.openInfo();
    expect(battle(s).ui.infoOpen).toBe(false);
    s.selectTower(1);
    s.openInfo();
    expect(battle(s).hud.infoOpen).toBe(true);
    const t0 = tick(s);
    expect(s.advance(100)).toBe(2);
    expect(tick(s)).toBe(t0 + 2);
    expect(battle(s).hud.paused).toBe(false);
  });
  it("열려 있는 동안 맵 입력 무시(선택·설치 불변), 닫으면 다시 입력", () => {
    const s = start();
    s.selectTower(1);
    s.openInfo();
    s.tapCell({ col: 5, row: 0 });
    expect(battle(s).ui).toMatchObject({ selectedTowerId: 1, infoOpen: true });
    s.closeInfo();
    expect(battle(s).ui.infoOpen).toBe(false);
    s.tapCell({ col: 5, row: 0 });
    expect(battle(s).ui.selectedTowerId).toBeNull();
  });
  it("타깃 변경은 정보 창을 연 채로 코어에 제출된다(일시정지 아님)", () => {
    const s = start();
    s.selectTower(1);
    s.openInfo();
    expect(s.setTargeting(1, "strong")).toEqual({ ok: true });
    s.advance(50);
    expect(battle(s).hud.detail?.targetingMode).toBe("strong");
    expect(battle(s).hud.infoOpen).toBe(true);
  });
  it("선택한 타워가 사라지면(판매) 자동으로 닫힌다", () => {
    const s = start();
    s.selectTower(1);
    s.openInfo();
    s.requestSell(1); // 판매 확인은 정보 창과 함께 열려 있을 수 있다
    expect(battle(s).ui).toMatchObject({ sellConfirmId: 1, infoOpen: true });
    s.confirmSell();
    s.advance(50);
    expect(battle(s).ui).toMatchObject({ selectedTowerId: null, infoOpen: false });
    expect(battle(s).hud.infoOpen).toBe(false);
  });
  it("설치 모드로 바꾸거나 선택이 해제되면 닫히고, 메뉴(일시정지) 중에는 열 수 없다", () => {
    const s = start();
    s.selectTower(1);
    s.openInfo();
    s.togglePlaceMode("frost");
    expect(battle(s).ui).toMatchObject({ infoOpen: false, selectedTowerId: null, placeType: "frost" });
    s.selectTower(1);
    s.openMenu();
    s.openInfo();
    expect(battle(s).ui.infoOpen).toBe(false);
  });
  it("준비→전투 전환의 판매 확인 자동 취소는 정보 창을 닫지 않는다", () => {
    const s = start();
    s.selectTower(1);
    s.openInfo();
    s.requestSell(1);
    s.startWave();
    s.advance(50);
    expect(battle(s).ui).toMatchObject({ sellConfirmId: null, infoOpen: true });
  });
});

describe("MOB-02: handleBack 우선순위 (UI-CONTRACT 8.1절)", () => {
  const start = () => {
    const { session } = make();
    session.startStage(0);
    session.build("archer", { col: 0, row: 0 });
    session.advance(50);
    return session;
  };
  it("스테이지 선택 화면 → exit(앱 종료는 호출한 쪽), 아무 상태도 바꾸지 않는다", () => {
    const { session } = make();
    expect(session.handleBack()).toBe("exit");
    expect(session.getState().screen).toBe("stageSelect");
  });
  it("리뷰 F1: 정보 창 → 메뉴 → 스테이지 선택 확인창 → 뒤로가기 1회는 보이는 확인창을 닫는다(정보 창은 메뉴를 열 때 이미 닫힘)", () => {
    const s = start();
    s.selectTower(1);
    s.openInfo();
    s.openMenu();
    expect(battle(s).ui).toMatchObject({ infoOpen: false, selectedTowerId: 1 });
    s.requestLeave();
    expect(s.handleBack()).toBe("handled");
    expect(battle(s).ui).toMatchObject({ leaveConfirm: false, infoOpen: false });
    expect(battle(s).hud.paused).toBe(true);
    expect(s.handleBack()).toBe("handled");
    expect(battle(s).hud.paused).toBe(false);
    expect(battle(s).ui.infoOpen).toBe(false); // 재개해도 정보 창은 다시 열리지 않음
    expect(battle(s).ui.selectedTowerId).toBe(1);
  });
  it("리뷰 F1: Space/P(togglePause)·숨김 자동 일시정지 경로에서도 메뉴가 열리면 infoOpen=false(선택 유지)", () => {
    for (const open of [(s: GameSession) => s.togglePause(), (s: GameSession) => s.setHidden(true)]) {
      const s = start();
      s.selectTower(1);
      s.openInfo();
      expect(battle(s).ui.infoOpen).toBe(true);
      open(s);
      expect(battle(s).hud.paused).toBe(true);
      expect(battle(s).ui).toMatchObject({ infoOpen: false, selectedTowerId: 1 });
    }
  });
  it("리뷰 F1: Esc 도 같은 순서 — 정보 창 → 메뉴 → 확인창 순으로 보이는 최상위부터 닫는다", () => {
    const s = start();
    s.selectTower(1);
    s.openInfo();
    s.openMenu();
    s.requestLeave();
    s.cancel();
    expect(battle(s).ui).toMatchObject({ leaveConfirm: false, infoOpen: false });
    expect(battle(s).hud.paused).toBe(true);
    s.cancel();
    expect(battle(s).hud.paused).toBe(false);
    s.openInfo();
    s.cancel(); // 메뉴가 닫혀 있으면 정보 창부터
    expect(battle(s).ui.infoOpen).toBe(false);
    expect(battle(s).hud.paused).toBe(false);
  });
  it("판매 확인은 메뉴가 열릴 때 취소되어 스테이지 선택 확인창과 겹치지 않는다", () => {
    const s = start();
    s.selectTower(1);
    s.requestSell(1);
    s.openMenu();
    s.requestLeave();
    expect(battle(s).ui).toMatchObject({ sellConfirmId: null, leaveConfirm: true });
  });
  it("메뉴가 닫혀 있을 때: 판매 확인 → 정보 창 → 메뉴 열기 → 메뉴 닫고 재개 순서로 한 단계씩", () => {
    const s = start();
    s.selectTower(1);
    s.openInfo();
    s.requestSell(1);
    expect(s.handleBack()).toBe("handled");
    expect(battle(s).ui).toMatchObject({ sellConfirmId: null, infoOpen: true, selectedTowerId: 1 });
    expect(battle(s).hud.paused).toBe(false);
    expect(s.handleBack()).toBe("handled");
    expect(battle(s).ui).toMatchObject({ infoOpen: false, selectedTowerId: 1 });
    expect(battle(s).hud.paused).toBe(false);
    expect(s.handleBack()).toBe("handled"); // 전투 화면 → 메뉴 열기
    expect(battle(s).hud.paused).toBe(true);
    expect(s.handleBack()).toBe("handled"); // 메뉴 → 닫고 재개
    expect(battle(s).hud.paused).toBe(false);
  });
  it("메뉴의 스테이지 선택 확인창이 열려 있으면 그것부터 닫고, 다음에 메뉴를 닫는다", () => {
    const s = start();
    s.openMenu();
    s.requestLeave();
    expect(s.handleBack()).toBe("handled");
    expect(battle(s).hud).toMatchObject({ leaveConfirm: false, paused: true });
    expect(s.handleBack()).toBe("handled");
    expect(battle(s).hud.paused).toBe(false);
  });
  it("뒤로가기는 설치 모드·선택이 있어도 곧바로 메뉴를 연다(Esc 와 다름)", () => {
    const s = start();
    s.togglePlaceMode("frost");
    expect(s.handleBack()).toBe("handled");
    expect(battle(s).hud.paused).toBe(true);
    expect(battle(s).ui.placeType).toBe("frost");
  });
  it("결과 단계 → 스테이지 선택 화면으로, 그다음 뒤로가기는 exit", () => {
    const { session } = make(sprint(100));
    session.startStage(0);
    session.startWave();
    run(session, 200);
    expect(battle(session).result).not.toBeNull();
    expect(session.handleBack()).toBe("handled");
    expect(session.getState().screen).toBe("stageSelect");
    expect(session.handleBack()).toBe("exit");
  });
  it("Esc(cancel): 설치 모드·선택 해제가 먼저, 그다음 뒤로가기와 같은 순서(메뉴 열기→닫기), 스테이지 선택 화면에서는 아무 일 없음", () => {
    const s = start();
    s.selectTower(1);
    s.togglePlaceMode("frost");
    s.cancel();
    expect(battle(s).ui.placeType).toBeNull();
    s.selectTower(1);
    s.cancel();
    expect(battle(s).ui.selectedTowerId).toBeNull();
    expect(battle(s).hud.paused).toBe(false);
    s.cancel(); // 해제할 것이 없으면 메뉴 열기
    expect(battle(s).hud.paused).toBe(true);
    s.cancel();
    expect(battle(s).hud.paused).toBe(false);
    const { session } = make();
    expect(() => session.cancel()).not.toThrow();
    expect(session.getState().screen).toBe("stageSelect");
  });
  it("Esc: 메뉴가 열려 있으면 설치 모드가 남아 있어도 메뉴부터 닫고, 정보 창이 열려 있으면 정보 창부터 닫는다", () => {
    const s = start();
    s.togglePlaceMode("frost");
    s.openMenu();
    s.cancel();
    expect(battle(s)).toMatchObject({ hud: { paused: false }, ui: { placeType: "frost" } });
    s.togglePlaceMode("frost");
    s.selectTower(1);
    s.openInfo();
    s.cancel();
    expect(battle(s).ui).toMatchObject({ infoOpen: false, selectedTowerId: 1 });
  });
});
