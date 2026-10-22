#!/usr/bin/env python3
"""차내 안내방송 음성 생성기 (오프라인 TTS: sherpa-onnx).

  godot --headless -s tools/dump_routes.gd -- /tmp/routes.json
  python3 tools/gen_voice.py /tmp/routes.json assets/voice

모델 (GitHub k2-fsa/sherpa-onnx releases, tts-models):
  한국어 여성: vits-mimic3-ko_KO-kss_low
  영어 여성:   vits-piper-en_US-amy-medium
기본 위치는 ~/tts-models (TTS_MODELS 환경변수로 변경).

파일 이름은 ASCII 로: assets/voice/<line>/<md5(역명)[:10]>_<종류>.ogg
announcer.gd 가 같은 규칙으로 경로를 계산한다.
  종류: next_ko, next_en, last_ko, last_en (이 열차의 종착역일 때), arr_ko
공통: common/door_close.ogg, common/terminal_ko.ogg, common/terminal_en.ogg,
      <line>/dest_<md5(행선)>.ogg (회차 후 "이 열차는 ○○행 열차입니다")
"""
import hashlib
import json
import os
import sys

import numpy as np
import sherpa_onnx
import soundfile as sf

MODELS = os.environ.get("TTS_MODELS", os.path.expanduser("~/tts-models"))
RATE = 22050

# ---------------------------------------------------------------- 발음/문장
KO_DIGITS = {"1": "일", "2": "이", "3": "삼", "4": "사", "5": "오", "6": "육", "7": "칠", "8": "팔", "9": "구"}

TR_KO = {
    "경의중앙": "경의중앙선", "수인분당": "수인분당선", "신분당": "신분당선", "공항": "공항철도",
    "우이신설": "우이신설선", "신림": "신림선", "의정부": "의정부 경전철", "인천1": "인천 일호선",
    "인천2": "인천 이호선", "KTX": "케이티엑스", "서해": "서해선", "GTX-A": "지티엑스 에이",
    "경춘": "경춘선", "경강": "경강선", "용인": "용인 경전철", "SRT": "에스알티",
}
TR_EN = {
    "경의중앙": "the Gyeongui-Jungang Line", "수인분당": "the Suin-Bundang Line", "신분당": "the Shinbundang Line",
    "공항": "the Airport Railroad", "우이신설": "the Ui-Sinseol Line", "신림": "the Sillim Line",
    "의정부": "the Uijeongbu Light Rail", "인천1": "Incheon Line 1", "인천2": "Incheon Line 2", "KTX": "the KTX",
    "서해": "the Seohae Line", "GTX-A": "the GTX-A", "경춘": "the Gyeongchun Line", "경강": "the Gyeonggang Line",
    "용인": "the Yongin EverLine", "SRT": "the SRT",
}


def ko_name(n: str) -> str:
    """역명 속 숫자를 한글로 (종로3가 → 종로 삼가)."""
    out = ""
    for ch in n:
        if ch in KO_DIGITS:
            out += " " + KO_DIGITS[ch]
        else:
            out += ch
    return out.strip()


def tr_ko(t: str) -> str:
    if t.isdigit():
        return KO_DIGITS[t] + "호선"
    return TR_KO.get(t, t)


def tr_en(t: str) -> str:
    if t.isdigit():
        return "Line " + t
    return TR_EN.get(t, t)


def has_batchim(word: str) -> int:
    """마지막 글자의 받침: 0 없음, 1 있음, 2 ㄹ받침."""
    c = word.strip()[-1]
    code = ord(c) - 0xAC00
    if code < 0 or code > 11171:
        return 0
    jong = code % 28
    if jong == 0:
        return 0
    return 2 if jong == 8 else 1


def josa_euro(word: str) -> str:
    return word + ("으로" if has_batchim(word) == 1 else "로")


def en_list(items):
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


def key(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()[:10]


def with_yeok(nm: str) -> str:
    """'서울역' 처럼 이미 '역'으로 끝나면 '역'을 붙이지 않는다."""
    return nm if nm.endswith("역") else nm + "역"


def sentences(line: int, st: dict, last: bool):
    nm = ko_name(st["ko"])
    nmy = with_yeok(nm)
    door = "오른쪽" if st["kind"] == "I" else "왼쪽"
    door_en = "right" if st["kind"] == "I" else "left"
    tr = [t for t in st["tr"] if t != str(line)]
    if last:
        ko = f"이번 역은 이 열차의 종착역인 {nmy}입니다. 내리실 문은 {door}입니다."
    else:
        ko = f"이번 역은 {nm}, {nmy}입니다. 내리실 문은 {door}입니다."
    if tr:
        names = [tr_ko(t) for t in tr]
        ko += f" {', '.join(names[:-1]) + ', ' if len(names) > 1 else ''}{josa_euro(names[-1])} 갈아타실 고객께서는 이번 역에서 내리시기 바랍니다."
    en = f"This stop is {st['en']}"
    en += ", the final stop of this train." if last else "."
    if tr:
        en += f" You can transfer to {en_list([tr_en(t) for t in tr])}."
    en += f" The doors are on your {door_en}."
    arr = f"잠시 후, {nm}, {nmy}에 도착합니다."
    return ko, en, arr


# ---------------------------------------------------------------- 음향 처리
def biquad(x, b, a):
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
        x2, x1 = x1, x[i]
        y2, y1 = y1, v
        y[i] = v
    return y


def _coef(kind, f0, q=0.707):
    w = 2 * np.pi * f0 / RATE
    al = np.sin(w) / (2 * q)
    c = np.cos(w)
    if kind == "hp":
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    else:
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    a = [1 + al, -2 * c, 1 - al]
    return [v / a[0] for v in b], [1.0, a[1] / a[0], a[2] / a[0]]


def lfilter(x, kind, f0):
    try:
        from scipy.signal import lfilter as lf  # 빠른 경로
        b, a = _coef(kind, f0)
        return lf(b, a, x)
    except ImportError:
        b, a = _coef(kind, f0)
        return biquad(x, b, a)


_rng = np.random.default_rng(7)
_ir = None


def pa_process(s: np.ndarray) -> np.ndarray:
    """차내 스피커 느낌: 대역 제한 + 짧은 잔향 + 무음 정리 + 음량 정규화."""
    global _ir
    s = s.astype(np.float64)
    # 앞뒤 무음 자르기
    thr = 0.01 * np.max(np.abs(s))
    nz = np.where(np.abs(s) > thr)[0]
    if len(nz):
        s = s[max(0, nz[0] - 400): nz[-1] + 1600]
    s = lfilter(s, "hp", 140.0)
    s = lfilter(s, "lp", 7500.0)
    if _ir is None:
        n = int(0.28 * RATE)
        t = np.arange(n) / RATE
        _ir = _rng.standard_normal(n) * np.exp(-t * 30.0) * 0.0045
        _ir[0] = 1.0
    s = np.convolve(s, _ir)[: len(s) + int(0.15 * RATE)]
    # RMS 기준 정규화 후 피크 제한
    rms = np.sqrt(np.mean(s ** 2)) + 1e-9
    s = s * (0.11 / rms)
    peak = np.max(np.abs(s))
    if peak > 0.92:
        s = s * (0.92 / peak)
    fade = int(0.01 * RATE)
    s[:fade] *= np.linspace(0, 1, fade)
    s[-fade:] *= np.linspace(1, 0, fade)
    return s.astype(np.float32)


# ---------------------------------------------------------------- TTS
def make_tts(name, model):
    d = os.path.join(MODELS, name)
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=os.path.join(d, model), tokens=os.path.join(d, "tokens.txt"),
                data_dir=os.path.join(d, "espeak-ng-data")),
            num_threads=max(1, (os.cpu_count() or 2) - 1)))
    return sherpa_onnx.OfflineTts(cfg)


ASR_DIR = os.path.join(MODELS, "sherpa-onnx-zipformer-korean-2024-06-24")


def _norm(t: str) -> str:
    """비교용: 공백/문장부호 제거, 숫자는 한자어 읽기로."""
    out = ""
    for ch in t:
        if ch in KO_DIGITS:
            out += KO_DIGITS[ch]
        elif ch.isalnum():
            out += ch
    return out


class Voice:
    """한국어는 후보 여러 개를 만들어 음성인식(ASR)으로 가장 또렷한 것을 고른다."""

    def __init__(self):
        self.ko = make_tts("vits-mimic3-ko_KO-kss_low", "ko_KO-kss_low.onnx")
        self.en = make_tts("vits-piper-en_US-amy-medium", "en_US-amy-medium.onnx")
        self.asr = None
        if os.path.isdir(ASR_DIR):
            self.asr = sherpa_onnx.OfflineRecognizer.from_transducer(
                encoder=os.path.join(ASR_DIR, "encoder-epoch-99-avg-1.int8.onnx"),
                decoder=os.path.join(ASR_DIR, "decoder-epoch-99-avg-1.onnx"),
                joiner=os.path.join(ASR_DIR, "joiner-epoch-99-avg-1.int8.onnx"),
                tokens=os.path.join(ASR_DIR, "tokens.txt"), num_threads=2)
        self.report = []

    def _score(self, text, s):
        if self.asr is None:
            return 0.0
        import difflib
        st = self.asr.create_stream()
        st.accept_waveform(RATE, s)
        self.asr.decode_stream(st)
        return difflib.SequenceMatcher(None, _norm(text), _norm(st.result.text)).ratio()

    def _gen(self, eng, text, speed):
        a = eng.generate(text, sid=0, speed=speed)
        s = np.array(a.samples, dtype=np.float32)
        if a.sample_rate != RATE:
            idx = np.linspace(0, len(s) - 1, int(len(s) * RATE / a.sample_rate))
            s = np.interp(idx, np.arange(len(s)), s).astype(np.float32)
        return s

    def say(self, lang, text, path, speed):
        if os.path.exists(path):
            return
        if lang == "ko":
            best = None
            for sp in (speed, speed - 0.05, speed + 0.04):
                s = self._gen(self.ko, text, sp)
                sc = self._score(text, pa_process(s))
                if best is None or sc > best[0]:
                    best = (sc, s)
                if sc > 0.9 or self.asr is None:
                    break
            score, s = best
        else:
            s = self._gen(self.en, text, speed)
            score = 1.0
        dur = len(s) / RATE
        s = pa_process(s)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        sf.write(path, s, RATE, format="OGG", subtype="VORBIS", compression_level=0.85)
        self.report.append((path, text, dur, len(text), score))


def main():
    routes = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    v = Voice()
    done = set()
    terminals = set()
    for r in routes:
        if not r["loop"]:
            for st in (r["stations"][0], r["stations"][-1]):
                terminals.add((r["line"], st["ko"]))
    for r in routes:
        line = r["line"]
        for st in r["stations"]:
            k = (line, st["ko"])
            if k in done:
                continue
            done.add(k)
            base = os.path.join(out, str(line), key(st["ko"]))
            ko, en, arr = sentences(line, st, False)
            v.say("ko", ko, base + "_next_ko.ogg", 0.92)
            v.say("en", en, base + "_next_en.ogg", 0.95)
            v.say("ko", arr, base + "_arr_ko.ogg", 0.92)
            if k in terminals:
                ko2, en2, _ = sentences(line, st, True)
                v.say("ko", ko2, base + "_last_ko.ogg", 0.92)
                v.say("en", en2, base + "_last_en.ogg", 0.95)
        # 회차 후 행선 안내
        if r["loop"]:
            for d in ("외선순환", "내선순환"):
                v.say("ko", f"이 열차는 {d} 열차입니다.", os.path.join(out, str(line), "dest_" + key(d) + ".ogg"), 0.92)
        else:
            for st in (r["stations"][0], r["stations"][-1]):
                d = st["ko"] + "행"
                v.say("ko", f"이 열차는 {ko_name(st['ko'])}행 열차입니다.",
                      os.path.join(out, str(line), "dest_" + key(d) + ".ogg"), 0.92)
    com = os.path.join(out, "common")
    v.say("ko", "출입문을 닫습니다.", os.path.join(com, "door_close.ogg"), 0.92)
    v.say("ko", "이 열차의 종착역입니다. 내리실 때 잊으신 물건이 없는지 확인하시기 바랍니다. 감사합니다.",
          os.path.join(com, "terminal_ko.ogg"), 0.92)
    v.say("en", "This is the last stop. Please make sure you have all your belongings when you leave the train. Thank you.",
          os.path.join(com, "terminal_en.ogg"), 0.95)
    v.say("ko", "안전선 밖으로 한 걸음 물러서 주시기 바랍니다.", os.path.join(com, "step_back.ogg"), 0.92)

    # 품질 점검: 글자당 길이가 튀는 클립 (TTS 실패 의심)
    ko_scores = [r[4] for r in v.report if r[0].endswith("_ko.ogg")]
    if ko_scores:
        print(f"한국어 ASR 일치도: 평균 {np.mean(ko_scores):.2f}, 최저 {np.min(ko_scores):.2f}")
        worst = sorted([r for r in v.report if r[0].endswith("_ko.ogg")], key=lambda r: r[4])[:8]
        for w in worst:
            print("  낮음:", round(w[4], 2), w[1])
    rows = [(p, t, d / max(1, n)) for p, t, d, n, _ in v.report]
    if rows:
        ratios = np.array([x[2] for x in rows])
        med = float(np.median(ratios))
        bad = [x for x in rows if x[2] > med * 1.8 or x[2] < med * 0.45]
        print(f"생성 {len(rows)}개, 글자당 중앙값 {med:.3f}s, 이상치 {len(bad)}개")
        for b in bad[:20]:
            print("  의심:", b[0], b[1], round(b[2], 3))


if __name__ == "__main__":
    main()
