package com.ghj.aireplace;

import java.util.ArrayList;
import java.util.List;

/**
 * 개발자 AI 대체 확률 추정 모델 (로지스틱 모형).
 *
 * <p>각 요인을 0~1 로 정규화한 뒤 중립값(0.5)과의 차이에 가중치를 곱해 로짓에 더하고,
 * 시그모이드로 확률을 구한다. 가중치와 국가별 기본값은 공개 자료의 경향을 바탕으로 한
 * <b>가정</b>이며, 실측 예측이 아니다.
 */
public final class RiskModel {

    private RiskModel() {}

    // ── 국가 ─────────────────────────────────────────────────────────────

    public enum Country {
        KR("한국", "🇰🇷",
                0.64, "생성형 AI 업무 도입이 빠르고 대기업·스타트업 모두 코딩 에이전트 확산",
                0.38, "주니어 공급은 많고 시니어는 부족 — 신입 채용 축소 압력이 큼",
                0.52, "정규직 보호는 있으나 프리랜서·SI 외주 비중이 높음"),
        JP("일본", "🇯🇵",
                0.46, "도입은 늘고 있으나 보수적인 의사결정·레거시 시스템으로 속도가 느림",
                0.82, "경제산업성 추산 2030년 IT 인력 최대 약 79만 명 부족 — 대체보다 보완 수요",
                0.74, "종신고용 관행·해고 규제가 강해 급격한 인력 감축이 어려움");

        public final String label;
        public final String flag;
        public final double adoption;
        public final String adoptionNote;
        public final double shortage;
        public final String shortageNote;
        public final double protection;
        public final String protectionNote;

        Country(String label, String flag,
                double adoption, String adoptionNote,
                double shortage, String shortageNote,
                double protection, String protectionNote) {
            this.label = label;
            this.flag = flag;
            this.adoption = adoption;
            this.adoptionNote = adoptionNote;
            this.shortage = shortage;
            this.shortageNote = shortageNote;
            this.protection = protection;
            this.protectionNote = protectionNote;
        }
    }

    // ── 사용자 선택 항목 ─────────────────────────────────────────────────

    public static final String[] ROLES = {
            "전체 평균", "프론트엔드", "백엔드", "모바일 앱", "QA/테스트",
            "SI/유지보수", "데이터/ML", "인프라/DevOps", "임베디드", "게임"
    };
    /** 직군별 AI 노출도 (반복적·명세 기반 업무 비중이 클수록 높음). */
    static final double[] ROLE_EXPOSURE = {
            0.60, 0.70, 0.60, 0.62, 0.85,
            0.78, 0.45, 0.48, 0.35, 0.52
    };

    public static final String[] SENIORITY = {"신입 (0~2년)", "중급 (3~7년)", "시니어 (8년+)"};
    static final double[] SENIORITY_LOGIT = {0.65, 0.0, -0.75};

    public static final String[] HORIZON = {"3년 내", "5년 내", "10년 내"};
    static final double[] HORIZON_LOGIT = {-0.70, 0.0, 0.90};

    // ── 가중치 ───────────────────────────────────────────────────────────

    static final double W_AI = 3.2;
    static final double W_ADOPTION = 1.6;
    static final double W_EXPOSURE = 1.8;
    static final double W_NEWS = 1.2;
    static final double W_SHORTAGE = -1.3;
    static final double W_PROTECTION = -0.8;
    /** 글로벌 AI 성능 뉴스 모멘텀이 성능 가정치를 최대 ±6%p 움직인다. */
    static final double MOMENTUM_SPAN = 0.06;
    static final double BASE_LOGIT = -1.75;

    // ── 입력/출력 ────────────────────────────────────────────────────────

    public static final class Inputs {
        /** AI 코딩 성능 가정치 (SWE-bench Verified 류 해결률, 0~100). */
        public int aiPerformance = 80;
        /** 글로벌 AI 성능 뉴스 모멘텀, -1~1. */
        public double aiMomentum = 0;
        /** 국가별 실시간 뉴스 위협 지수, -1~1. */
        public double newsKr = 0;
        public double newsJp = 0;
        public int role = 0;
        public int seniority = 1;
        public int horizon = 1;

        public double news(Country c) {
            return c == Country.KR ? newsKr : newsJp;
        }
    }

    public static final class Factor {
        public final String name;
        public final String value;
        public final String note;
        /** 로짓 기여도 (+ 는 위험 증가). */
        public final double contribution;

        Factor(String name, String value, String note, double contribution) {
            this.name = name;
            this.value = value;
            this.note = note;
            this.contribution = contribution;
        }
    }

    public static final class Result {
        public final Country country;
        public final double probability;
        public final List<Factor> factors;

        Result(Country country, double probability, List<Factor> factors) {
            this.country = country;
            this.probability = probability;
            this.factors = factors;
        }

        public int percent() {
            return (int) Math.round(probability * 100);
        }
    }

    // ── 계산 ─────────────────────────────────────────────────────────────

    public static double effectiveAi(Inputs in) {
        return clamp(in.aiPerformance / 100.0 + MOMENTUM_SPAN * clamp(in.aiMomentum, -1, 1), 0, 1);
    }

    public static Result compute(Country c, Inputs in) {
        int role = clampIdx(in.role, ROLES.length);
        int sen = clampIdx(in.seniority, SENIORITY.length);
        int hor = clampIdx(in.horizon, HORIZON.length);
        double ai = effectiveAi(in);
        double news = clamp(in.news(c), -1, 1);
        double exposure = ROLE_EXPOSURE[role];

        List<Factor> f = new ArrayList<>();
        f.add(new Factor("AI 코딩 성능", pct(ai),
                "가정치 " + in.aiPerformance + "% " + signedPp(MOMENTUM_SPAN * clamp(in.aiMomentum, -1, 1))
                        + " (글로벌 AI 뉴스 반영)",
                W_AI * (ai - 0.5)));
        f.add(new Factor("AI 도입 속도", pct(c.adoption), c.adoptionNote,
                W_ADOPTION * (c.adoption - 0.5)));
        f.add(new Factor("직무 노출도", pct(exposure), ROLES[role] + " 업무 중 자동화 가능 비중 추정",
                W_EXPOSURE * (exposure - 0.5)));
        f.add(new Factor("실시간 뉴스 지수", String.format(java.util.Locale.US, "%+.2f", news),
                "최근 2주 " + c.label + " 기사 헤드라인 키워드 분석",
                W_NEWS * news));
        f.add(new Factor("인력 부족도", pct(c.shortage), c.shortageNote,
                W_SHORTAGE * (c.shortage - 0.5)));
        f.add(new Factor("고용 보호", pct(c.protection), c.protectionNote,
                W_PROTECTION * (c.protection - 0.5)));
        f.add(new Factor("경력", SENIORITY[sen], "경력이 짧을수록 정형화된 업무 비중이 큼",
                SENIORITY_LOGIT[sen]));
        f.add(new Factor("기간", HORIZON[hor], "기간이 길수록 기술·제도 변화 누적",
                HORIZON_LOGIT[hor]));

        double logit = BASE_LOGIT;
        for (Factor x : f) logit += x.contribution;
        return new Result(c, sigmoid(logit), f);
    }

    public static String level(double p) {
        if (p < 0.20) return "낮음";
        if (p < 0.40) return "보통";
        if (p < 0.60) return "높음";
        return "매우 높음";
    }

    // ── 유틸 ─────────────────────────────────────────────────────────────

    static double sigmoid(double x) {
        return 1.0 / (1.0 + Math.exp(-x));
    }

    static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static int clampIdx(int i, int n) {
        return Math.max(0, Math.min(n - 1, i));
    }

    private static String pct(double v) {
        return Math.round(v * 100) + "%";
    }

    private static String signedPp(double v) {
        long pp = Math.round(v * 100);
        return (pp >= 0 ? "+" : "") + pp + "%p";
    }
}
