package com.ghj.questblack;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** 자막 글자를 가운데 정렬된 그림(RGBA)으로 그립니다. */
final class CaptionImage {
    static final int WIDTH = 1024;
    static final int HEIGHT = 384;

    private static final int PADDING = 32;
    private static final float MAX_TEXT_PX = 60f;
    private static final float MIN_TEXT_PX = 34f;

    private final Bitmap bitmap = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888);
    private final Canvas canvas = new Canvas(bitmap);
    private final ByteBuffer buffer = ByteBuffer.allocateDirect(WIDTH * HEIGHT * 4).order(ByteOrder.nativeOrder());
    private final TextPaint paint = new TextPaint(TextPaint.ANTI_ALIAS_FLAG);

    CaptionImage() {
        paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
    }

    /**
     * 글자를 그려서 RGBA 버퍼로 돌려줍니다. dim=true면 안내 문구용으로 흐리게 그립니다.
     * 글자가 길면 줄을 나누고, 그래도 넘치면 글자 크기를 줄입니다.
     */
    ByteBuffer render(String text, boolean dim) {
        bitmap.eraseColor(Color.TRANSPARENT);
        if (text != null && !text.isEmpty()) {
            paint.setColor(dim ? 0xFF8A8A95 : 0xFFE8E8E8);
            int width = WIDTH - PADDING * 2;
            StaticLayout layout = null;
            for (float size = MAX_TEXT_PX; size >= MIN_TEXT_PX; size -= 4f) {
                paint.setTextSize(size);
                layout = StaticLayout.Builder.obtain(text, 0, text.length(), paint, width)
                        .setAlignment(Layout.Alignment.ALIGN_CENTER)
                        .setLineSpacing(0f, 1.15f)
                        .setIncludePad(false)
                        .build();
                if (layout.getHeight() <= HEIGHT - PADDING) break;
            }
            canvas.save();
            float top = Math.max(0f, (HEIGHT - layout.getHeight()) / 2f);
            canvas.translate(PADDING, top);
            canvas.clipRect(-PADDING, -top, WIDTH, HEIGHT - top);
            layout.draw(canvas);
            canvas.restore();
        }
        buffer.rewind();
        bitmap.copyPixelsToBuffer(buffer); // ARGB_8888 → 메모리 순서 R,G,B,A (미리 곱한 알파)
        buffer.rewind();
        return buffer;
    }
}
