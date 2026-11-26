package com.ddooby.defence;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

// MOB-01: 가로 전용 게임 화면. 상태바·내비게이션 바를 숨긴 전체 화면(몰입 모드)으로 실행하고,
// 사용자가 가장자리를 쓸어 바를 꺼내도 잠시 뒤 다시 숨는다.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemBars();
        applySymmetricSideInsets();
    }

    // MOB-03: 카메라 구멍(컷아웃)·시스템 바가 차지하는 좌우 폭 중 큰 값을 양쪽에 같은 여백으로 준다.
    // 가로 화면에서 카메라 구멍 쪽만 비고 반대쪽 HUD 글자가 둥근 모서리에 잘리던 문제(사용자 피드백 2026-11-26).
    // 기기를 180° 돌려 구멍이 반대쪽으로 가도 대칭이 유지된다. capacitor.config 의 SystemBars insetsHandling=disable 과 짝.
    private void applySymmetricSideInsets() {
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int side = Math.max(i.left, i.right);
            v.setPadding(side, i.top, side, i.bottom);
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.of(0, 0, 0, 0))
                .build();
        });
        ViewCompat.requestApplyInsets(decor);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        // 카메라 구멍(디스플레이 컷아웃) 옆 빈 띠를 게임 배경색으로 맞춘다.
        getWindow().getDecorView().setBackgroundColor(0xFF0A0A0A);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
