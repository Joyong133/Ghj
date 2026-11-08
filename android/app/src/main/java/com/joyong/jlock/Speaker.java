package com.joyong.jlock;

import android.content.Context;
import android.speech.tts.TextToSpeech;

import java.util.Locale;

/** Japanese text-to-speech using the device's TTS engine. */
final class Speaker implements TextToSpeech.OnInitListener {
    private final TextToSpeech tts;
    private boolean ready;

    Speaker(Context c) { tts = new TextToSpeech(c.getApplicationContext(), this); }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) return;
        int r = tts.setLanguage(Locale.JAPANESE);
        ready = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
        tts.setSpeechRate(0.9f);
    }

    boolean isReady() { return ready; }

    void speak(String text) {
        if (ready && text != null && !text.isEmpty()) {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "jlock");
        }
    }

    void shutdown() { tts.shutdown(); }
}
