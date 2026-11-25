// MOB-01: Android 앱 포장 설정. 웹 빌드(out/)를 앱 안에 넣어 오프라인으로 실행한다.
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ddooby.defence",
  appName: "Ddooby Defence",
  webDir: "out",
};

export default config;
