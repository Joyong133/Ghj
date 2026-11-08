package com.ghj.questblack;

import android.app.Activity;

import java.nio.ByteBuffer;

/** C++(OpenXR) 쪽과 주고받는 함수들. */
final class NativeBridge {
    static {
        System.loadLibrary("questblack");
    }

    private NativeBridge() {
    }

    /** VR 검은 화면을 시작합니다. 자막 판의 너비(미터)를 함께 넘깁니다. */
    static native void start(Activity activity, float captionWidthMeters);

    static native void stop();

    /** RGBA(미리 곱한 알파) 자막 그림. visible=false면 자막 판을 숨깁니다. */
    static native void setCaption(ByteBuffer rgba, int width, int height, boolean visible);

    static native void setCaptionWidth(float meters);

    /** 컨트롤러 트리거를 두 번 눌렀거나 시스템이 종료를 요청했으면 true (한 번만). */
    static native boolean consumeExitRequest();

    /** 0 준비 중, 1 실행 중, -1 실패 */
    static native int status();
}
