package com.ddooby.defence;

import android.os.Bundle;

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
