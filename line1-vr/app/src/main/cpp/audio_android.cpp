#include <aaudio/AAudio.h>

#include <atomic>
#include <cmath>

#include "audio.h"

namespace {

AAudioStream* gStream = nullptr;
std::atomic<float> gSpeed{0}, gTunnel{1};
std::atomic<int> gChime{0}, gJoint{0};

struct Synth {
    uint32_t rng = 12345;
    float low = 0, low2 = 0;     // filtered noise
    float level = 0;             // smoothed loudness
    float motorPhase = 0;
    int seenChime = 0, seenJoint = 0;
    float chimeT = -1, jointT = -1;
    float jointPhase = 0;
    int rate = 48000;

    float noise() {
        rng = rng * 1664525u + 1013904223u;
        return ((rng >> 9) & 0x7fff) / 16384.f - 1.f;
    }

    float sample() {
        float speed = gSpeed.load(std::memory_order_relaxed);
        float tunnel = gTunnel.load(std::memory_order_relaxed);
        float target = speed / 22.f;
        level += (target - level) * 0.0002f;

        // Rolling rumble: low-passed noise, brighter and louder in the tunnel.
        float n = noise();
        float cut = 0.02f + 0.05f * level + 0.03f * tunnel;
        low += (n - low) * cut;
        low2 += (low - low2) * 0.25f;
        float rumble = low2 * level * (1.6f + 1.4f * tunnel);

        // Traction motor whine.
        motorPhase += (90.f + speed * 22.f) / rate;
        if (motorPhase > 1) motorPhase -= 1;
        float motor = sinf(motorPhase * 6.2831853f) * 0.025f * fminf(level * 3.f, 1.f) * (1.f - 0.6f * level);

        // Rail joint: two short thumps.
        int j = gJoint.load(std::memory_order_relaxed);
        if (j != seenJoint) {
            seenJoint = j;
            jointT = 0;
        }
        float joint = 0;
        if (jointT >= 0) {
            float gap = 0.09f;
            for (int k = 0; k < 2; k++) {
                float t = jointT - k * gap;
                if (t >= 0) joint += sinf(t * 6.2831853f * 70.f) * expf(-t * 40.f) * 0.35f;
            }
            jointT += 1.f / rate;
            if (jointT > 0.5f) jointT = -1;
        }

        // Door chime: two notes.
        int c = gChime.load(std::memory_order_relaxed);
        if (c != seenChime) {
            seenChime = c;
            chimeT = 0;
        }
        float chime = 0;
        if (chimeT >= 0) {
            float f = chimeT < 0.35f ? 880.f : 698.46f;
            float t = chimeT < 0.35f ? chimeT : chimeT - 0.35f;
            chime = sinf(chimeT * 6.2831853f * f) * expf(-t * 5.f) * 0.18f;
            chimeT += 1.f / rate;
            if (chimeT > 0.9f) chimeT = -1;
        }

        float out = rumble + motor + joint * fminf(level * 4.f, 1.f) + chime;
        if (out > 1) out = 1;
        if (out < -1) out = -1;
        return out;
    }
};
Synth gSynth;

aaudio_data_callback_result_t onAudio(AAudioStream* stream, void*, void* data, int32_t frames) {
    float* out = (float*)data;
    int ch = AAudioStream_getChannelCount(stream);
    for (int i = 0; i < frames; i++) {
        float s = gSynth.sample();
        for (int c = 0; c < ch; c++) *out++ = s;
    }
    return AAUDIO_CALLBACK_RESULT_CONTINUE;
}

}  // namespace

void audioStart() {
    if (gStream) return;
    AAudioStreamBuilder* b = nullptr;
    if (AAudio_createStreamBuilder(&b) != AAUDIO_OK) return;
    AAudioStreamBuilder_setFormat(b, AAUDIO_FORMAT_PCM_FLOAT);
    AAudioStreamBuilder_setChannelCount(b, 2);
    AAudioStreamBuilder_setPerformanceMode(b, AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);
    AAudioStreamBuilder_setDataCallback(b, onAudio, nullptr);
    if (AAudioStreamBuilder_openStream(b, &gStream) == AAUDIO_OK) {
        gSynth.rate = AAudioStream_getSampleRate(gStream);
        if (AAudioStream_requestStart(gStream) != AAUDIO_OK) {
            AAudioStream_close(gStream);
            gStream = nullptr;
        }
    } else {
        gStream = nullptr;
    }
    AAudioStreamBuilder_delete(b);
}

void audioStop() {
    if (!gStream) return;
    AAudioStream_requestStop(gStream);
    AAudioStream_close(gStream);
    gStream = nullptr;
}

void audioUpdate(const AudioState& s) {
    gSpeed.store(s.speed, std::memory_order_relaxed);
    gTunnel.store(s.tunnel ? 1.f : 0.f, std::memory_order_relaxed);
    gChime.store(s.chimeCount, std::memory_order_relaxed);
    gJoint.store((int)(s.distance / 25.0), std::memory_order_relaxed);  // 25 m rails
}
