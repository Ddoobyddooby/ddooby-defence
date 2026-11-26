// MOB-01: Android 앱 포장 설정. 웹 빌드(out/)를 앱 안에 넣어 오프라인으로 실행한다.
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ddooby.defence",
  appName: "Ddooby Defence",
  webDir: "out",
  plugins: {
    // MOB-03: 화면 가장자리 여백은 MainActivity가 좌우 대칭으로 직접 처리한다(카메라 구멍 반대쪽도 같은 폭).
    SystemBars: { insetsHandling: "disable" },
  },
};

export default config;
