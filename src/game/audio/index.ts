// SND-01: 브라우저 전용 싱글턴. 서버 렌더·테스트에서는 만들지 않는다.
import { browserStorage } from "./audioSettings";
import { SoundEngine } from "./soundEngine";
import { WebAudioBackend } from "./webAudioBackend";

let engine: SoundEngine | null = null;
export function getSoundEngine(): SoundEngine {
  if (engine === null) {
    const backend = new WebAudioBackend();
    engine = new SoundEngine(backend, browserStorage());
    // 검증용: 개발 빌드에서만 재생 기록을 콘솔에서 볼 수 있게 한다.
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __soundLog: engine.log, __audioDebug: () => backend.debugState() });
  }
  return engine;
}
