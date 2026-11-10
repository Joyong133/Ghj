#include "world.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "track.h"
#include "train.h"

namespace {

const float RAIL_Y = 0.f;        // top of rail
const float BED_Y = -0.18f;      // track bed
const float PLAT_Y = (float)track::PLAT_Y;
const float PLAT_EDGE = (float)track::PLAT_EDGE;
const float PSD = (float)track::PSD_LAT;
const float PSD_H = 2.25f;       // height of the screen doors above the platform
const float TUN_W = 4.7f;        // tunnel half width between stations
const float TUN_H = 5.2f;
const float STA_W = (float)track::BACK_UNDERGROUND;
const float STA_H = 4.6f;
const float OPEN_W = (float)track::BACK_OPEN;
const float TO = (float)track::TRACK_OFFSET;
const float STEP = 5.f;          // spacing of cross sections
const int RINGS = 9;

const Col NAVY = {20, 52, 120, 255};  // Line 1 colour

const char* SHOPS[] = {"약국", "카페", "편의점", "부동산", "치킨", "분식", "미용실", "학원",
                       "세탁소", "꽃집", "안경", "빵집", "마트", "식당", "서점", "철물"};
const char* NOTICES[][2] = {{"발빠짐 주의", "열차와 승강장 사이가 넓습니다"},
                            {"안전선 안쪽에서", "기다려 주세요"},
                            {"뛰지 마세요", "닫히는 문에 주의하세요"},
                            {"먼저 내리고", "나중에 타세요"}};

struct Ring {
    V3 c;       // centreline, relative to the chunk origin
    V3 n, t;    // left normal and tangent
    double s;
};

uint32_t rnd(uint32_t& st) {
    st = st * 1664525u + 1013904223u;
    return st >> 8;
}
float rndf(uint32_t& st) { return (rnd(st) & 0xffff) / 65535.f; }
float hashf(int a, int b) {
    uint32_t h = (uint32_t)a * 374761393u + (uint32_t)b * 668265263u;
    h = (h ^ (h >> 13)) * 1274126177u;
    return ((h ^ (h >> 16)) & 0xffff) / 65535.f;
}

struct Builder {
    MB& mb;
    MB& gl;   // glass
    MB& cut;  // alpha-tested foliage
    MB& tx;   // text
    std::vector<Glow>& glows;
    Ring r[RINGS];
    double s0, ox, oz;
    // Frame of the station being built (straight track).
    V3 so, st, sn;

    V3 P(int j, float lat, float y, float along = 0) const {
        const Ring& g = r[j];
        return {g.c.x + g.n.x * lat + g.t.x * along, y, g.c.z + g.n.z * lat + g.t.z * along};
    }
    // Point in the station frame: `a` metres along the platform from its centre.
    V3 SP(float lat, float y, float a) const {
        return {so.x + sn.x * lat + st.x * a, y, so.z + sn.z * lat + st.z * a};
    }
    void setStation(int i) {
        double x, z, tx1, tz1;
        track::stationFrame(i, x, z, tx1, tz1);
        so = {(float)(x - ox), 0, (float)(z - oz)};
        st = {(float)tx1, 0, (float)tz1};
        sn = {(float)tz1, 0, (float)-tx1};
    }
    float vAt(int j, float tile) const { return (float)((fmod(s0, 120.0) + j * STEP) / tile); }

    // Surface swept between ring j and j+1 from (latA,yA) to (latB,yB).
    void strip(int j, float latA, float yA, float latB, float yB, float layer, Col c0, Col c1, float uA = 0,
               float uB = 1, float vTile = 2.f) {
        mb.quad(P(j, latA, yA), P(j, latB, yB), P(j + 1, latB, yB), P(j + 1, latA, yA), uA, vAt(j, vTile), uB,
                vAt(j + 1, vTile), layer, c0, c0, c1, c1);
    }
    void strip(int j, float latA, float yA, float latB, float yB, float layer, Col c, float uScale = 2.f,
               float vTile = 2.f) {
        float len = sqrtf((latB - latA) * (latB - latA) + (yB - yA) * (yB - yA));
        strip(j, latA, yA, latB, yB, layer, c, c, 0, len / uScale, vTile);
    }
    // Square column standing on ring j.
    void pillar(int j, float lat, float half, float y0, float y1, float layer, Col c, float along = 0) {
        mb.obox(P(j, lat, 0, along), r[j].n, r[j].t, half, y0, y1, half, layer, c, 1.f);
    }

    void rails(int j, bool slab) {
        Col web = rgb(0.30f, 0.22f, 0.17f);
        for (int side = -1; side <= 1; side += 2) {
            float tc = side * TO;
            float g = slab ? 0.62f : 0.8f;
            strip(j, tc - 1.4f, BED_Y + 0.01f, tc + 1.4f, BED_Y + 0.01f, slab ? T_SLAB : T_TRACK, gray(g), gray(g), 0, 1,
                  2.4f);
            for (int rl = -1; rl <= 1; rl += 2) {
                float x = tc + rl * 0.7175f;
                mb.gloss = 0.9f;
                strip(j, x - 0.035f, RAIL_Y, x + 0.035f, RAIL_Y, T_WHITE, gray(0.62f));
                mb.gloss = 0.1f;
                strip(j, x - 0.035f, BED_Y, x - 0.035f, RAIL_Y, T_WHITE, web);
                strip(j, x + 0.035f, BED_Y, x + 0.035f, RAIL_Y, T_WHITE, web);
                mb.gloss = 0;
            }
        }
    }

    // ------------------------------------------------------------ stations

    // Station name board on a platform wall. side = +1 for the left wall.
    void sign(int side, float wallLat, float yc, int stn, float a) {
        V3 right = side > 0 ? st : st * -1.f;
        V3 up = {0, 1, 0};
        V3 in = sn * (float)-side;  // towards the tracks
        V3 c = SP(wallLat, yc, a);
        const float W = 3.2f, H = 1.0f;
        V3 f0 = c + in * 0.04f;
        mb.gloss = 0.3f;
        mb.quad(f0 - right * (W / 2 + 0.05f) - up * (H / 2 + 0.05f), f0 + right * (W / 2 + 0.05f) - up * (H / 2 + 0.05f),
                f0 + right * (W / 2 + 0.05f) + up * (H / 2 + 0.05f), f0 - right * (W / 2 + 0.05f) + up * (H / 2 + 0.05f),
                T_METAL, gray(0.35f));
        mb.gloss = UNLIT;
        V3 b0 = c + in * 0.06f;
        mb.quad(b0 - right * (W / 2) - up * (H / 2), b0 + right * (W / 2) - up * (H / 2),
                b0 + right * (W / 2) + up * (H / 2), b0 - right * (W / 2) + up * (H / 2), T_WHITE, gray(0.96f));
        V3 b1 = c + in * 0.09f - up * (H / 2 - 0.11f);
        mb.quad(b1 - right * (W / 2) - up * 0.11f, b1 + right * (W / 2) - up * 0.11f, b1 + right * (W / 2) + up * 0.11f,
                b1 - right * (W / 2) + up * 0.11f, T_WHITE, NAVY);
        mb.gloss = 0;
        V3 t0 = c + in * 0.12f;
        const track::Station& S = track::ST[stn];
        addText(tx, S.ko, t0 + up * 0.02f, right, up, 0.36f, gray(0.08f), 1);
        addText(tx, S.en, t0 - up * 0.21f, right, up, 0.12f, gray(0.25f), 1);
        // line badge with the station number
        addRect(tx, t0 - right * (W / 2 - 0.3f) + up * 0.3f, right, up, 0.42f, 0.2f, NAVY);
        char num[16];
        snprintf(num, sizeof(num), "%d", S.number);
        addText(tx, num, t0 - right * (W / 2 - 0.3f) + up * 0.25f, right, up, 0.13f, gray(1), 1);
        // Neighbouring stations: the one further along the route is on the
        // viewer's right when looking at the left wall.
        int rightSt = stn + side, leftSt = stn - side;
        char buf[64];
        if (leftSt >= 0 && leftSt < track::N) {
            snprintf(buf, sizeof(buf), "< %s", track::ST[leftSt].ko);
            addText(tx, buf, t0 - right * (W / 2 - 0.1f) - up * (H / 2 - 0.06f), right, up, 0.12f, gray(1), 0);
        }
        if (rightSt >= 0 && rightSt < track::N) {
            snprintf(buf, sizeof(buf), "%s >", track::ST[rightSt].ko);
            addText(tx, buf, t0 + right * (W / 2 - 0.1f) - up * (H / 2 - 0.06f), right, up, 0.12f, gray(1), 2);
        }
    }

    // Vertical quad in the station frame on the plane `lat`, from a0 to a1.
    void sq(MB& m, float lat, float a0, float a1, float y0, float y1, float layer, Col c, float uv = 1.f) {
        m.quad(SP(lat, y0, a0), SP(lat, y0, a1), SP(lat, y1, a1), SP(lat, y1, a0), layer, c, uv);
    }

    void psdFixed(int sd, float a0, float a1) {
        float L = sd * PSD;
        mb.gloss = 0.5f;
        sq(mb, L, a0, a1, PLAT_Y, PLAT_Y + 0.35f, T_METAL, gray(0.62f), 0.5f);
        mb.obox(SP(L, 0, (a0 + a1) / 2), st, sn, (a1 - a0) / 2, PLAT_Y + 1.05f, PLAT_Y + 1.1f, 0.025f, T_METAL, gray(0.7f));
        if (a1 - a0 > 2.6f)
            mb.obox(SP(L, 0, (a0 + a1) / 2), st, sn, 0.03f, PLAT_Y + 0.35f, PLAT_Y + PSD_H, 0.04f, T_METAL, gray(0.6f));
        mb.gloss = 0;
        sq(gl, L, a0, a1, PLAT_Y + 0.35f, PLAT_Y + PSD_H, T_WHITE, rgb(0.75f, 0.9f, 0.95f, 0.13f));
    }

    void stationItems(int stn) {
        setStation(stn);
        double S = track::stationS(stn);
        bool ug = track::underground(S);
        float back = ug ? STA_W : OPEN_W;
        auto in = [&](double a) {
            double s = S + a;
            return s >= s0 - 1e-6 && s < s0 + World::CHUNK - 1e-6;
        };
        V3 up = {0, 1, 0};
        std::vector<float> doors = platformDoors();
        for (int sd = -1; sd <= 1; sd += 2) {
            float L = sd * PSD;
            V3 faceRight = st * (float)-sd;        // text on a surface seen from the platform, looking at the track
            V3 wallRight = st * (float)sd;         // text on the back wall
            // --- platform screen doors
            if (in(-track::STATION_HALF)) psdFixed(sd, -(float)track::STATION_HALF, doors[0] - 0.95f);
            for (size_t i = 0; i < doors.size(); i++) {
                float a = doors[i];
                if (!in(a)) continue;
                float next = i + 1 < doors.size() ? doors[i + 1] - 0.95f : (float)track::STATION_HALF;
                psdFixed(sd, a + 0.95f, next);
                mb.gloss = 0.5f;
                for (float e : {-0.95f, 0.95f})
                    mb.obox(SP(L, 0, a + e), st, sn, 0.05f, PLAT_Y, PLAT_Y + PSD_H, 0.07f, T_METAL, gray(0.5f));
                mb.gloss = 0;
                // door number: car - door, counted from the front of the train
                int carIdx = 0, doorIdx = 0;
                float best = 1e9f;
                for (int c = 0; c < train::CARS; c++)
                    for (int d = 0; d < 4; d++) {
                        float pa = sd * (90.f - 20.f * c - train::DOOR_Z[d]);
                        if (fabsf(pa - a) < best) {
                            best = fabsf(pa - a);
                            carIdx = c;
                            doorIdx = d;
                        }
                    }
                char buf[32];
                snprintf(buf, sizeof(buf), "%d-%d", carIdx + 1, doorIdx + 1);
                addText(tx, buf, SP(L + sd * 0.125f, PLAT_Y + PSD_H + 0.1f, a), faceRight, up, 0.13f, gray(1), 1);
            }
            // --- benches against the back wall
            for (float a : {-82.f, -42.f, -2.f, 38.f, 78.f}) {
                if (!in(a)) continue;
                mb.obox(SP(sd * (back - 0.3f), 0, a), st, sn, 1.2f, PLAT_Y + 0.40f, PLAT_Y + 0.46f, 0.22f, T_WOOD, gray(1), 0.6f);
                mb.obox(SP(sd * (back - 0.07f), 0, a), st, sn, 1.2f, PLAT_Y + 0.52f, PLAT_Y + 0.86f, 0.025f, T_WOOD, gray(1), 0.6f);
                mb.gloss = 0.5f;
                for (float e : {-1.0f, 1.0f}) {
                    mb.obox(SP(sd * (back - 0.3f), 0, a + e), st, sn, 0.03f, PLAT_Y, PLAT_Y + 0.40f, 0.2f, T_METAL, gray(0.4f));
                    mb.obox(SP(sd * (back - 0.07f), 0, a + e), st, sn, 0.03f, PLAT_Y + 0.4f, PLAT_Y + 0.86f, 0.03f, T_METAL, gray(0.4f));
                }
                mb.gloss = 0;
            }
            // --- vending machines
            int vi = 0;
            for (float a : {-22.f, 58.f}) {
                vi++;
                if (!in(a)) continue;
                Col body = vi == 1 ? rgb(0.75f, 0.12f, 0.12f) : rgb(0.12f, 0.3f, 0.7f);
                mb.gloss = 0.4f;
                mb.obox(SP(sd * (back - 0.42f), 0, a), st, sn, 0.55f, PLAT_Y, PLAT_Y + 1.85f, 0.38f, T_WHITE, body);
                mb.gloss = UNLIT;
                float fl = sd * (back - 0.815f);
                sq(mb, fl, a - 0.45f, a + 0.45f, PLAT_Y + 0.75f, PLAT_Y + 1.7f, T_WHITE, rgb(0.95f, 0.97f, 1.f));
                mb.gloss = 0;
                sq(mb, fl - sd * 0.005f, a - 0.4f, a + 0.4f, PLAT_Y + 0.2f, PLAT_Y + 0.45f, T_WHITE, gray(0.08f));
                // rows of cans
                for (int row = 0; row < 3; row++)
                    for (int k = 0; k < 6; k++) {
                        float ca = a - 0.375f + k * 0.15f, cy = PLAT_Y + 0.85f + row * 0.28f;
                        Col cc = rgb(0.3f + 0.7f * hashf(k, row + vi), 0.3f + 0.7f * hashf(k + 7, row), 0.3f + 0.7f * hashf(row, k + 3));
                        mb.gloss = UNLIT;
                        sq(mb, fl - sd * 0.006f, ca - 0.045f, ca + 0.045f, cy, cy + 0.2f, T_WHITE, cc);
                        mb.gloss = 0;
                    }
            }
            // --- fire hose cabinet
            for (float a : {-53.5f, 53.5f}) {
                if (!in(a)) continue;
                mb.gloss = 0.3f;
                mb.obox(SP(sd * (back - 0.09f), 0, a), st, sn, 0.35f, PLAT_Y + 0.45f, PLAT_Y + 1.35f, 0.09f, T_WHITE, rgb(0.8f, 0.1f, 0.1f));
                mb.gloss = 0;
                addText(tx, "소화전", SP(sd * (back - 0.2f), PLAT_Y + 1.12f, a), wallRight, up, 0.11f, gray(1), 1);
            }
            // --- safety notices in light boxes on the wall
            int ni = 0;
            for (float a = -90.f; a <= 90.f; a += 20.f, ni++) {
                if (!in(a)) continue;
                const char** lines = NOTICES[(ni + stn + (sd > 0 ? 0 : 2)) % 4];
                Col bg = ni % 3 == 0 ? rgb(0.98f, 0.86f, 0.2f) : ni % 3 == 1 ? rgb(0.88f, 0.94f, 1.f) : rgb(0.85f, 0.96f, 0.88f);
                float wl = sd * back, yc = PLAT_Y + 1.6f;
                mb.gloss = 0.4f;
                mb.obox(SP(wl - sd * 0.04f, 0, a), st, sn, 1.0f, yc - 0.65f, yc + 0.65f, 0.04f, T_METAL, gray(0.3f));
                mb.gloss = UNLIT;
                sq(mb, wl - sd * 0.085f, a - 0.94f, a + 0.94f, yc - 0.59f, yc + 0.59f, T_WHITE, bg);
                mb.gloss = 0;
                V3 o = SP(wl - sd * 0.1f, yc, a);
                addText(tx, lines[0], o + up * 0.1f, wallRight, up, 0.2f, gray(0.08f), 1);
                addText(tx, lines[1], o - up * 0.2f, wallRight, up, 0.105f, gray(0.15f), 1);
                addRect(tx, o - up * 0.42f, wallRight, up, 1.6f, 0.03f, NAVY);
            }
            // --- hanging direction boards across the platform
            for (float a : {-65.f, -25.f, 15.f, 55.f}) {
                if (!in(a)) continue;
                float y0 = PLAT_Y + 2.32f, y1 = PLAT_Y + 2.74f, lc = sd * 6.0f;
                float top = ug ? STA_H : 4.55f;
                mb.gloss = 0.3f;
                mb.obox(SP(lc, 0, a), sn, st, 0.95f, y0, y1, 0.035f, T_WHITE, rgb(0.07f, 0.1f, 0.2f));
                for (float e : {-0.75f, 0.75f}) mb.obox(SP(lc + e, 0, a), sn, st, 0.012f, y1, top, 0.012f, T_METAL, gray(0.5f));
                mb.gloss = 0;
                int nextSt = stn + sd;
                char buf[64];
                for (int face = -1; face <= 1; face += 2) {
                    // face = -1: seen when looking along the route (+t)
                    V3 right = sn * (float)face;
                    V3 o = SP(lc, y0, a + face * 0.045f);
                    addRect(tx, o - right * 0.72f + up * 0.21f, right, up, 0.26f, 0.26f, NAVY);
                    addText(tx, "1", o - right * 0.72f + up * 0.13f, right, up, 0.2f, gray(1), 1);
                    addText(tx, sd > 0 ? "광운대 방면" : "서울역 방면", o - right * 0.5f + up * 0.2f, right, up, 0.15f, gray(1), 0);
                    if (nextSt >= 0 && nextSt < track::N) {
                        snprintf(buf, sizeof(buf), "다음 역  %s", track::ST[nextSt].ko);
                        addText(tx, buf, o - right * 0.5f + up * 0.05f, right, up, 0.085f, rgb(1, 0.8f, 0.3f), 0);
                    } else {
                        addText(tx, "이 역이 종착역입니다", o - right * 0.5f + up * 0.05f, right, up, 0.085f, rgb(1, 0.8f, 0.3f), 0);
                    }
                }
            }
        }
        // --- starting signals just beyond the platform ends
        for (int dir = -1; dir <= 1; dir += 2) {
            float a = dir * ((float)track::STATION_HALF + 2.5f);
            if (!in(a)) continue;
            float lat = dir * (ug ? 4.42f : 5.0f);
            float y0 = ug ? 2.4f : 3.3f;
            mb.gloss = 0.3f;
            mb.obox(SP(lat, 0, a), st, sn, 0.1f, y0, y0 + 0.75f, 0.17f, T_WHITE, gray(0.06f));
            if (!ug) mb.obox(SP(lat, 0, a), st, sn, 0.05f, BED_Y, y0, 0.05f, T_METAL, gray(0.4f));
            float fa = a - dir * 0.105f;
            mb.gloss = UNLIT;
            auto lamp = [&](float y, Col c) {
                mb.quad(SP(lat - 0.08f, y - 0.08f, fa), SP(lat + 0.08f, y - 0.08f, fa), SP(lat + 0.08f, y + 0.08f, fa),
                        SP(lat - 0.08f, y + 0.08f, fa), T_GLOW, c, 0.16f);
            };
            lamp(y0 + 0.55f, rgb(0.25f, 0.03f, 0.03f));
            lamp(y0 + 0.2f, rgb(0.2f, 1.f, 0.45f));
            mb.gloss = 0;
            glows.push_back({SP(lat, y0 + 0.2f, fa - dir * 0.03f), rgb(0.1f, 0.8f, 0.3f), 1.3f});
        }
    }

    // Platform floor, edge and the fixed top of the screen doors.
    void platform(int j, float backLat, float topY) {
        for (int side = -1; side <= 1; side += 2) {
            float sd = (float)side;
            strip(j, sd * PLAT_EDGE, BED_Y, sd * PLAT_EDGE, PLAT_Y, T_CONCRETE, gray(0.5f));
            mb.gloss = 0.25f;
            strip(j, sd * PLAT_EDGE, PLAT_Y, sd * 4.25f, PLAT_Y, T_PLATFORM, gray(0.82f), 2.f, 2.f);
            strip(j, sd * 4.65f, PLAT_Y, sd * backLat, PLAT_Y, T_PLATFORM, gray(0.82f), 2.f, 2.f);
            mb.gloss = 0;
            strip(j, sd * 4.25f, PLAT_Y, sd * 4.65f, PLAT_Y, T_TACTILE, gray(1), 0.4f, 0.4f);
            // screen door header and the panel above it
            mb.gloss = 0.4f;
            strip(j, sd * PSD, PLAT_Y + PSD_H, sd * PSD, PLAT_Y + PSD_H + 0.34f, T_METAL, gray(0.28f), 0.5f, 0.5f);
            strip(j, sd * (PSD + 0.1f), PLAT_Y + PSD_H, sd * (PSD + 0.1f), PLAT_Y + PSD_H + 0.34f, T_METAL, gray(0.28f), 0.5f, 0.5f);
            strip(j, sd * PSD, PLAT_Y + PSD_H, sd * (PSD + 0.1f), PLAT_Y + PSD_H, T_METAL, gray(0.2f), 0.5f, 0.5f);
            mb.gloss = 0;
            if (topY > PLAT_Y + PSD_H + 0.4f)
                strip(j, sd * (PSD + 0.05f), PLAT_Y + PSD_H + 0.34f, sd * (PSD + 0.05f), topY, T_METAL, gray(0.7f), 1.f, 1.f);
        }
    }

    void tunnelStation(int j, int stn) {
        strip(j, -PLAT_EDGE, BED_Y, -TO - 1.4f, BED_Y, T_CONCRETE, gray(0.35f));
        strip(j, -TO + 1.4f, BED_Y, TO - 1.4f, BED_Y, T_CONCRETE, gray(0.35f));
        strip(j, TO + 1.4f, BED_Y, PLAT_EDGE, BED_Y, T_CONCRETE, gray(0.35f));
        rails(j, true);
        platform(j, STA_W, STA_H);
        double rel = r[j].s - track::stationS(stn);
        bool tens = fmod(fabs(rel), 10.0) < 0.1;
        for (int side = -1; side <= 1; side += 2) {
            float sd = (float)side;
            mb.gloss = 0.35f;
            strip(j, sd * STA_W, PLAT_Y + 1.0f, sd * STA_W, STA_H, T_TILE, rgb(0.94f, 0.92f, 0.86f), 2.f, 2.f);
            strip(j, sd * STA_W, PLAT_Y, sd * STA_W, PLAT_Y + 1.0f, T_TILE, rgb(0.42f, 0.5f, 0.66f), 2.f, 2.f);
            mb.gloss = 0;
            strip(j, sd * (STA_W - 0.03f), 3.5f, sd * (STA_W - 0.03f), 3.66f, T_WHITE, NAVY);
            if (tens) {
                mb.gloss = 0.35f;
                pillar(j, sd * 6.6f, 0.3f, PLAT_Y, STA_H, T_TILE, gray(0.92f));
                mb.gloss = 0;
                pillar(j, sd * 6.6f, 0.33f, PLAT_Y, PLAT_Y + 0.12f, T_METAL, gray(0.35f));
            }
            // continuous light lines in the ceiling
            mb.gloss = UNLIT;
            for (float lat : {5.3f, 7.9f})
                mb.quad(P(j, sd * (lat - 0.13f), STA_H - 0.03f, 0.25f), P(j, sd * (lat + 0.13f), STA_H - 0.03f, 0.25f),
                        P(j, sd * (lat + 0.13f), STA_H - 0.03f, 4.75f), P(j, sd * (lat - 0.13f), STA_H - 0.03f, 4.75f),
                        T_WHITE, rgb(1, 1, 0.96f));
            mb.gloss = 0;
            if (fabs(fmod(fabs(rel), 20.0) - 5.0) < 0.1 && fabs(rel) < 100) {
                setStation(stn);
                sign(side, sd * STA_W, PLAT_Y + 2.45f, stn, (float)rel);
            }
            // ceiling over the platform; the trackway is darker
            strip(j, sd * (PSD + 0.05f), STA_H, sd * STA_W, STA_H, T_CEILING, gray(0.92f), 2.4f, 2.4f);
        }
        strip(j, -PSD - 0.05f, STA_H, PSD + 0.05f, STA_H, T_CONCRETE, gray(0.3f), 3.f, 3.f);
        pillar(j, 0, 0.22f, BED_Y, STA_H, T_CONCRETE, gray(0.6f));
    }

    // ------------------------------------------------------------ tunnel

    void tunnelSegment(int j) {
        auto lamp = [&](int k) { return fmod(fabs(r[k].s), 10.0) < 0.1; };
        Col w0 = gray(lamp(j) ? 0.66f : 0.25f), w1 = gray(lamp(j + 1) ? 0.66f : 0.25f);
        Col f0 = gray(lamp(j) ? 0.42f : 0.24f), f1 = gray(lamp(j + 1) ? 0.42f : 0.24f);
        const float LEDGE = TUN_W - 0.7f;
        strip(j, -LEDGE, BED_Y, -TO - 1.4f, BED_Y, T_CONCRETE, f0, f1, 0, 0.3f);
        strip(j, -TO + 1.4f, BED_Y, TO - 1.4f, BED_Y, T_CONCRETE, f0, f1, 0, 0.7f);
        strip(j, TO + 1.4f, BED_Y, LEDGE, BED_Y, T_CONCRETE, f0, f1, 0, 0.3f);
        rails(j, true);
        for (int side = -1; side <= 1; side += 2) {
            float sd = (float)side;
            // walkway ledge
            strip(j, sd * LEDGE, BED_Y, sd * LEDGE, 0.32f, T_CONCRETE, f0, f1, 0, 0.25f);
            strip(j, sd * LEDGE, 0.32f, sd * TUN_W, 0.32f, T_CONCRETE, f0, f1, 0, 0.35f);
            strip(j, sd * TUN_W, 0.32f, sd * TUN_W, TUN_H, T_CONCRETE, w0, w1, 0, 2.4f);
            // cable runs on brackets
            for (float y : {1.25f, 1.42f, 1.59f})
                strip(j, sd * (TUN_W - 0.09f), y, sd * (TUN_W - 0.09f), y + 0.07f, T_WHITE, gray(0.04f));
            mb.obox(P(j, sd * (TUN_W - 0.06f), 0, 2.5f), r[j].t, r[j].n, 0.03f, 1.2f, 1.7f, 0.06f, T_METAL, gray(0.3f));
            // rib of the tunnel lining at every ring
            Col rib = gray(lamp(j) ? 0.7f : 0.3f);
            mb.obox(P(j, sd * (TUN_W - 0.04f), 0), r[j].t, r[j].n, 0.14f, 0.32f, TUN_H, 0.04f, T_CONCRETE, rib);
            if (lamp(j)) {
                mb.obox(P(j, sd * (TUN_W - 0.07f), 0), r[j].t, r[j].n, 0.68f, 2.70f, 2.93f, 0.05f, T_METAL, gray(0.25f));
                mb.gloss = UNLIT;
                float l = sd * (TUN_W - 0.125f);
                mb.quad(P(j, l, 2.75f, -0.62f), P(j, l, 2.75f, 0.62f), P(j, l, 2.88f, 0.62f), P(j, l, 2.88f, -0.62f), T_WHITE,
                        rgb(1, 0.97f, 0.85f));
                mb.gloss = 0;
            }
            // kilometre post every 100 m
            if (fmod(fabs(r[j].s), 100.0) < 0.1 && r[j].s >= 0) {
                V3 right = side > 0 ? r[j].t : r[j].t * -1.f, up = {0, 1, 0}, inw = r[j].n * (float)-side;
                V3 c = P(j, sd * (TUN_W - 0.02f), 2.0f, 1.2f) + inw * 0.03f;
                mb.gloss = UNLIT;
                mb.quad(c - right * 0.36f - up * 0.14f, c + right * 0.36f - up * 0.14f, c + right * 0.36f + up * 0.14f,
                        c - right * 0.36f + up * 0.14f, T_WHITE, gray(0.9f));
                mb.gloss = 0;
                char buf[24];
                int m = (int)llround(r[j].s);
                snprintf(buf, sizeof(buf), "%dk%03d", m / 1000, m % 1000);
                addText(tx, buf, c + inw * 0.02f - up * 0.06f, right, up, 0.16f, gray(0.05f), 1);
            }
        }
        strip(j, -TUN_W, TUN_H, TUN_W, TUN_H, T_CONCRETE, scale(f0, 0.8f), scale(f1, 0.8f), 0, 4.7f);
        mb.obox(P(j, 0, 0), r[j].n, r[j].t, TUN_W, TUN_H - 0.05f, TUN_H, 0.14f, T_CONCRETE, gray(lamp(j) ? 0.5f : 0.25f));
        // row of columns between the two tracks, with a continuous plinth
        pillar(j, 0, 0.2f, BED_Y, TUN_H, T_CONCRETE, gray(lamp(j) ? 0.6f : 0.36f));
        strip(j, -0.25f, BED_Y, -0.25f, 0.1f, T_CONCRETE, f0, f1, 0, 0.2f);
        strip(j, 0.25f, BED_Y, 0.25f, 0.1f, T_CONCRETE, f0, f1, 0, 0.2f);
        strip(j, -0.25f, 0.1f, 0.25f, 0.1f, T_CONCRETE, f0, f1, 0, 0.2f);
    }

    // ------------------------------------------------------------ open air

    // Which side of the line the road runs on changes from one station to the next.
    static int roadSide(double s) {
        int n = 0;
        for (int i = 0; i < track::N; i++)
            if (track::stationS(i) < s) n++;
        return n % 2 ? 1 : -1;
    }

    void tree(V3 base, float h, uint32_t& seed) {
        float tw = 0.12f + h * 0.012f;
        mb.obox(base, {1, 0, 0}, {0, 0, 1}, tw, base.y, base.y + h * 0.45f, tw, T_WOOD, rgb(0.5f, 0.42f, 0.36f));
        float w = h * (0.34f + 0.1f * rndf(seed)), y0 = base.y + h * 0.28f, y1 = base.y + h;
        float ang = rndf(seed) * 3.14159f;
        Col c = gray(0.85f + 0.15f * rndf(seed));
        cut.gloss = UNLIT;  // shading is in the texture; the three planes must match
        for (int k = 0; k < 3; k++) {
            float a = ang + k * 1.0472f;
            V3 d = {cosf(a) * w, 0, sinf(a) * w};
            cut.quad({base.x - d.x, y0, base.z - d.z}, {base.x + d.x, y0, base.z + d.z}, {base.x + d.x, y1, base.z + d.z},
                     {base.x - d.x, y1, base.z - d.z}, 0, 1, 1, 0, T_FOLIAGE, c, c, c, c);
        }
    }

    void ground(int j, bool station) {
        float y = BED_Y - 0.02f;
        double mid = r[j].s + STEP * 0.5;
        int rs = roadSide(mid);
        uint32_t seed = (uint32_t)llround(r[j].s) * 2654435761u + 77u;
        for (int side = -1; side <= 1; side += 2) {
            float sd = (float)side;
            float from = station ? OPEN_W : 5.5f;
            if (side == rs) {
                if (!station) strip(j, sd * 5.5f, y, sd * 6.2f, y, T_GRASS, gray(0.9f), 3.f, 3.f);
                strip(j, sd * (station ? from : 6.2f), y, sd * 9.f, y, T_GROUND, gray(0.85f), 3.f, 3.f);
                strip(j, sd * 9.f, y, sd * 21.f, y, T_ROAD, gray(1), gray(1), 0, 1, 12.f);
                strip(j, sd * 21.f, y + 0.12f, sd * 24.5f, y + 0.12f, T_GROUND, gray(0.85f), 3.f, 3.f);
                strip(j, sd * 21.f, y, sd * 21.f, y + 0.12f, T_CONCRETE, gray(0.7f));
                strip(j, sd * 24.5f, y, sd * 250.f, y, T_GROUND, rgb(0.66f, 0.67f, 0.64f), 6.f, 6.f);
                // street trees and lamp posts on the far pavement
                if (fmod(fabs(r[j].s), 10.0) < 0.1) {
                    tree(P(j, sd * 22.2f, y + 0.12f, 2.f), 5.5f + 2.5f * rndf(seed), seed);
                    if (fmod(fabs(r[j].s), 40.0) < 0.1) {
                        mb.gloss = 0.4f;
                        pillar(j, sd * 21.5f, 0.07f, y, 7.5f, T_METAL, gray(0.45f), 6.f);
                        mb.obox(P(j, sd * 20.6f, 0, 6.f), r[j].n, r[j].t, 0.9f, 7.42f, 7.5f, 0.06f, T_METAL, gray(0.45f));
                        mb.gloss = 0;
                    }
                }
            } else {
                strip(j, sd * from, y, sd * 16.f, y, T_GRASS, gray(0.9f), 3.f, 3.f);
                strip(j, sd * 16.f, y, sd * 18.5f, y, T_GROUND, gray(0.85f), 3.f, 3.f);
                strip(j, sd * 18.5f, y, sd * 250.f, y, T_GROUND, rgb(0.66f, 0.67f, 0.64f), 6.f, 6.f);
                for (int k = 0; k < 2; k++) {
                    float lat = 7.6f + rndf(seed) * 7.5f, al = rndf(seed) * 5.f, h = 5.f + 4.f * rndf(seed);
                    if (station && lat < OPEN_W + 1.8f) continue;
                    if (rndf(seed) < 0.75f) tree(P(j, sd * lat, y, al), h, seed);
                }
            }
        }
        strip(j, -5.5f, BED_Y, -TO - 1.4f, BED_Y, T_BALLAST, gray(0.8f), 1.5f, 1.5f);
        strip(j, -TO + 1.4f, BED_Y, TO - 1.4f, BED_Y, T_BALLAST, gray(0.8f), 1.5f, 1.5f);
        strip(j, TO + 1.4f, BED_Y, 5.5f, BED_Y, T_BALLAST, gray(0.8f), 1.5f, 1.5f);
        rails(j, false);
        // overhead wires
        for (int side = -1; side <= 1; side += 2) {
            float tc = side * TO;
            strip(j, tc - 0.02f, 5.3f, tc + 0.02f, 5.3f, T_WHITE, gray(0.1f));
            strip(j, tc - 0.015f, 6.2f, tc + 0.015f, 6.2f, T_WHITE, gray(0.1f));
        }
        // droppers between the two wires
        for (int side = -1; side <= 1; side += 2)
            mb.obox(P(j, side * TO, 0, 2.5f), r[j].n, r[j].t, 0.008f, 5.3f, 6.2f, 0.008f, T_WHITE, gray(0.1f));
    }

    void gantry(int j, float lat) {
        Col c = gray(0.5f);
        mb.gloss = 0.3f;
        pillar(j, -lat, 0.13f, BED_Y, 7.5f, T_METAL, c);
        pillar(j, lat, 0.13f, BED_Y, 7.5f, T_METAL, c);
        mb.obox(P(j, 0, 0), r[j].n, r[j].t, lat, 6.95f, 7.07f, 0.07f, T_METAL, c);
        mb.obox(P(j, 0, 0), r[j].n, r[j].t, lat, 7.38f, 7.5f, 0.07f, T_METAL, c);
        // lattice between the two chords, and the wire supports
        int n = (int)(lat * 2 / 0.9f);
        for (int k = 0; k <= n; k++) {
            float l = -lat + k * (2 * lat / n);
            mb.obox(P(j, l, 0), r[j].n, r[j].t, 0.025f, 7.07f, 7.38f, 0.025f, T_METAL, c);
        }
        for (int side = -1; side <= 1; side += 2) {
            mb.obox(P(j, side * TO, 0), r[j].n, r[j].t, 0.03f, 6.2f, 6.95f, 0.03f, T_METAL, c);
            mb.obox(P(j, side * TO, 0), r[j].n, r[j].t, 0.05f, 6.45f, 6.7f, 0.05f, T_WHITE, rgb(0.55f, 0.3f, 0.2f));
        }
        mb.gloss = 0;
    }

    void openSegment(int j, double mid) {
        ground(j, false);
        if (mid < track::CUT_END) {
            // retaining walls of the ramp out of the tunnel
            auto h = [&](double s) {
                double t = (s - track::PORTAL) / (track::CUT_END - track::PORTAL);
                return (float)(TUN_H + (2.0 - TUN_H) * (t < 0 ? 0 : t > 1 ? 1 : t));
            };
            for (int side = -1; side <= 1; side += 2) {
                float l = side * 5.0f;
                mb.quad(P(j, l, BED_Y), P(j + 1, l, BED_Y), P(j + 1, l, h(r[j + 1].s)), P(j, l, h(r[j].s)), T_CONCRETE,
                        gray(0.8f), 2.f);
                mb.quad(P(j, l, h(r[j].s)), P(j + 1, l, h(r[j + 1].s)), P(j + 1, l + side * 0.5f, h(r[j + 1].s)),
                        P(j, l + side * 0.5f, h(r[j].s)), T_CONCRETE, gray(0.7f), 2.f);
            }
        } else {
            for (int side = -1; side <= 1; side += 2) {
                strip(j, side * 6.2f, BED_Y, side * 6.2f, 0.7f, T_CONCRETE, gray(0.8f), 2.f, 2.f);
                strip(j, side * 6.2f, 0.7f, side * 6.2f, 2.3f, T_PANEL, gray(1), 1.6f, 5.f);
                mb.obox(P(j, side * 6.2f, 0), r[j].t, r[j].n, 0.06f, BED_Y, 2.4f, 0.08f, T_METAL, gray(0.45f));
            }
        }
        if (j == 0 && mid >= track::CUT_END) gantry(j, 5.4f);
    }

    void openStation(int j, int stn) {
        ground(j, true);
        platform(j, OPEN_W, 0);
        double rel = r[j].s - track::stationS(stn);
        bool tens = fmod(fabs(rel), 10.0) < 0.1;
        for (int side = -1; side <= 1; side += 2) {
            float sd = (float)side;
            strip(j, sd * OPEN_W, BED_Y, sd * OPEN_W, PLAT_Y + 0.9f, T_CONCRETE, gray(0.85f), 2.f, 2.f);
            strip(j, sd * OPEN_W, PLAT_Y + 0.9f, sd * OPEN_W, PLAT_Y + 2.5f, T_PANEL, gray(1), 1.6f, 5.f);
            // canopy: underside, roof and fascia
            mb.gloss = UNLIT;  // lit from below by the platform, not by the sky
            strip(j, sd * 3.3f, 4.5f, sd * 9.1f, 4.85f, T_CEILING, gray(0.7f), 2.4f, 2.4f);
            mb.gloss = 0.2f;
            strip(j, sd * 3.3f, 4.62f, sd * 9.1f, 4.97f, T_METAL, gray(0.6f), 2.f, 2.f);
            strip(j, sd * 3.3f, 4.5f, sd * 3.3f, 4.62f, T_WHITE, NAVY);
            mb.gloss = 0;
            if (tens) {
                mb.gloss = 0.4f;
                pillar(j, sd * 6.6f, 0.12f, PLAT_Y, 4.7f, T_METAL, gray(0.78f));
                mb.obox(P(j, sd * 6.2f, 0), r[j].n, r[j].t, 2.7f, 4.5f, 4.62f, 0.06f, T_METAL, gray(0.7f));
                mb.gloss = 0;
            }
            // light fittings under the canopy
            mb.gloss = UNLIT;
            mb.quad(P(j, sd * 5.7f, 4.6f, 1.6f), P(j, sd * 5.9f, 4.6f, 1.6f), P(j, sd * 5.9f, 4.6f, 3.4f),
                    P(j, sd * 5.7f, 4.6f, 3.4f), T_WHITE, rgb(1, 1, 0.95f));
            mb.gloss = 0;
            if (fabs(fmod(fabs(rel), 20.0) - 5.0) < 0.1 && fabs(rel) < 100) {
                setStation(stn);
                sign(side, sd * OPEN_W, PLAT_Y + 1.75f, stn, (float)rel);
            }
        }
        if (j == 0) gantry(j, 8.45f);
    }

    // End wall where the cross section changes at ring j.
    void headwall(int j, float in, float out, float y0, float y1, float lintelFrom, Col c) {
        for (int side = -1; side <= 1; side += 2)
            mb.quad(P(j, side * in, y0), P(j, side * out, y0), P(j, side * out, y1), P(j, side * in, y1), T_CONCRETE, c,
                    2.f);
        if (lintelFrom < y1)
            mb.quad(P(j, -in, lintelFrom), P(j, in, lintelFrom), P(j, in, y1), P(j, -in, y1), T_CONCRETE, c, 2.f);
    }

    // kind: 0 apartment slab, 1 office tower, 2 brick low-rise with a shop
    void building(int side, float along, float lat, float w, float d, float h, int kind, uint32_t& seed) {
        int j = (int)(along / STEP);
        if (j > RINGS - 2) j = RINGS - 2;
        float al = along - j * STEP;
        float l0 = side * lat, l1 = side * (lat + d);
        float y0 = BED_Y - 0.02f;
        V3 a = P(j, l0, y0, al - w / 2), b = P(j, l0, y0, al + w / 2), c = P(j, l1, y0, al + w / 2), e = P(j, l1, y0, al - w / 2);
        auto up = [&](V3 p, float hh) { return V3{p.x, y0 + hh, p.z}; };
        float tint = rndf(seed);
        Col base = gray(1);
        float layer = T_FACADE_APT, tu = 12.f, tv = 12.f;
        if (kind == 0) {
            base = tint < 0.5f ? rgb(0.96f, 0.94f, 0.9f) : rgb(0.9f, 0.93f, 0.96f);
        } else if (kind == 1) {
            layer = T_FACADE_OFFICE;
            tu = 9.f;
            tv = 21.6f;
            base = tint < 0.5f ? rgb(0.85f, 0.95f, 1.f) : rgb(1.f, 0.95f, 0.88f);
        } else {
            layer = T_FACADE_BRICK;
            tu = 9.f;
            tv = 9.f;
            base = tint < 0.4f ? gray(1) : tint < 0.7f ? rgb(0.9f, 0.9f, 0.95f) : rgb(1.f, 0.9f, 0.8f);
        }
        mb.gloss = kind == 1 ? 0.6f : 0.05f;
        auto wall = [&](V3 p, V3 q, float len, float lyr) {
            mb.quad(p, q, up(q, h), up(p, h), 0, 0, len / tu, h / tv, lyr, base, base, base, base);
        };
        wall(a, b, w, layer);
        wall(c, e, w, layer);
        // gable ends of an apartment slab are plain
        wall(b, c, d, kind == 0 ? (float)T_CONCRETE : layer);
        wall(e, a, d, kind == 0 ? (float)T_CONCRETE : layer);
        mb.gloss = 0;
        mb.quad(up(a, h), up(b, h), up(c, h), up(e, h), T_CONCRETE, gray(0.55f), 4.f);
        // roof-top structures
        V3 ctr = P(j, (l0 + l1) / 2, 0, al);
        if (kind != 2) {
            mb.obox(ctr, r[j].t, r[j].n, w * 0.12f, y0 + h, y0 + h + 3.2f, d * 0.3f, T_CONCRETE, scale(base, 0.9f), 3.f);
            mb.obox(ctr, r[j].t, r[j].n, w / 2, y0 + h, y0 + h + 0.9f, d / 2, T_CONCRETE, scale(base, 0.85f), 3.f);
        } else {
            V3 tk = P(j, (l0 + l1) / 2, 0, al + w * 0.2f);
            mb.obox(tk, r[j].t, r[j].n, 1.0f, y0 + h, y0 + h + 1.6f, 1.0f, T_WHITE, rgb(0.95f, 0.8f, 0.2f));
        }
        V3 right = side > 0 ? r[j].t : r[j].t * -1.f, upv = {0, 1, 0}, inw = r[j].n * (float)-side;
        V3 face = P(j, l0, 0, al);
        if (kind == 2) {
            // shop sign above the ground floor, facing the railway
            int si = rnd(seed) % 16;
            Col sc[] = {rgb(0.1f, 0.45f, 0.25f), rgb(0.8f, 0.15f, 0.15f), rgb(0.1f, 0.3f, 0.7f), rgb(0.95f, 0.6f, 0.1f),
                        rgb(0.15f, 0.15f, 0.18f)};
            Col sg = sc[rnd(seed) % 5];
            V3 o = face + inw * 0.2f;
            float sw = w * 0.5f - 0.6f;
            mb.gloss = UNLIT;
            mb.quad(V3{o.x, y0 + 3.0f, o.z} - right * sw, V3{o.x, y0 + 3.0f, o.z} + right * sw,
                    V3{o.x, y0 + 4.0f, o.z} + right * sw, V3{o.x, y0 + 4.0f, o.z} - right * sw, T_WHITE, sg);
            mb.gloss = 0;
            V3 to = face + inw * 0.24f;
            addText(tx, SHOPS[si], {to.x, y0 + 3.22f, to.z}, right, upv, 0.62f, gray(1), 1);
        } else if (kind == 0) {
            // building number painted near the top
            char buf[16];
            snprintf(buf, sizeof(buf), "%d", 101 + (int)(rnd(seed) % 12));
            V3 to = face + inw * 0.05f + right * (w * 0.5f - 4.5f);
            addText(tx, buf, {to.x, y0 + h - 5.2f, to.z}, right, upv, 3.0f, rgb(0.25f, 0.35f, 0.55f), 1);
        }
    }

    void buildings(int k) {
        uint32_t seed = (uint32_t)k * 2654435761u + 12345u;
        int rs = roadSide(s0 + 20);
        for (int side = -1; side <= 1; side += 2) {
            float near = side == rs ? 26.5f : 20.5f;
            // row of low buildings facing the line
            for (float al : {10.f, 30.f}) {
                float w = 11.f + rndf(seed) * 7.f, d = 9.f + rndf(seed) * 5.f, h = 6.f + 3.f * (float)(rnd(seed) % 4);
                if (rndf(seed) < 0.82f) building(side, al, near, w, d, h, 2, seed);
            }
            // apartment slabs and offices behind
            float w = 30.f + rndf(seed) * 8.f, lat = near + 28.f + rndf(seed) * 30.f;
            float pick = rndf(seed);
            if (pick < 0.45f)
                building(side, 20.f, lat, w, 13.f, 3.f * (float)(14 + rnd(seed) % 11), 0, seed);
            else if (pick < 0.7f)
                building(side, 20.f, lat, 20.f + rndf(seed) * 12.f, 20.f + rndf(seed) * 8.f, 3.6f * (float)(7 + rnd(seed) % 10), 1, seed);
            if (k % 2 == 0) {
                float lat2 = near + 95.f + rndf(seed) * 80.f;
                if (rndf(seed) < 0.6f)
                    building(side, 20.f, lat2, 44.f + rndf(seed) * 20.f, 14.f, 3.f * (float)(18 + rnd(seed) % 10), 0, seed);
                else
                    building(side, 20.f, lat2, 26.f, 26.f, 3.6f * (float)(12 + rnd(seed) % 14), 1, seed);
            }
        }
    }
};

}  // namespace

std::vector<float> platformDoors() {
    std::vector<float> a;
    for (int c = 0; c < train::CARS; c++)
        for (int d = 0; d < 4; d++) a.push_back(90.f - 20.f * c - train::DOOR_Z[d]);
    std::sort(a.begin(), a.end());
    return a;
}

static void buildChunk(int k, Chunk& ch) {
    MB mb, gl, cut, tx;
    Builder B{mb, gl, cut, tx, ch.glows};
    B.s0 = k * World::CHUNK;
    double ox, oz, tx0, tz0;
    track::pose(B.s0, 0, ox, oz, tx0, tz0);
    ch.ox = B.ox = ox;
    ch.oz = B.oz = oz;
    for (int j = 0; j < RINGS; j++) {
        double s = B.s0 + j * STEP, x, z, tx1, tz1;
        track::pose(s, 0, x, z, tx1, tz1);
        B.r[j].c = {(float)(x - ox), 0, (float)(z - oz)};
        B.r[j].t = {(float)tx1, 0, (float)tz1};
        B.r[j].n = {(float)tz1, 0, (float)-tx1};
        B.r[j].s = s;
    }
    ch.tunnel = B.s0 + 1 < track::PORTAL;
    for (int j = 0; j < RINGS - 1; j++) {
        double s = B.r[j].s, mid = s + STEP * 0.5;
        int st = track::stationAt(mid), stPrev = track::stationAt(s - STEP * 0.5);
        bool tunnel = mid < track::PORTAL;
        if (tunnel) {
            if (st >= 0)
                B.tunnelStation(j, st);
            else
                B.tunnelSegment(j);
            if ((st >= 0) != (stPrev >= 0)) {
                B.headwall(j, TUN_W, STA_W, BED_Y, STA_H, TUN_H, gray(0.6f));
                B.mb.quad(B.P(j, -TUN_W, STA_H), B.P(j, TUN_W, STA_H), B.P(j, TUN_W, TUN_H), B.P(j, -TUN_W, TUN_H),
                          T_CONCRETE, gray(0.45f), 2.f);
            }
        } else {
            if (st >= 0)
                B.openStation(j, st);
            else
                B.openSegment(j, mid);
            if (s - STEP * 0.5 < track::PORTAL)  // tunnel mouth
                B.headwall(j, TUN_W, 18.f, BED_Y, 7.6f, TUN_H, gray(0.85f));
            // end walls of an open-air platform
            if ((st >= 0) != (stPrev >= 0))
                for (int side = -1; side <= 1; side += 2)
                    B.mb.quad(B.P(j, side * PLAT_EDGE, BED_Y), B.P(j, side * OPEN_W, BED_Y),
                              B.P(j, side * OPEN_W, PLAT_Y + 1.2f), B.P(j, side * PLAT_EDGE, PLAT_Y + 1.2f), T_CONCRETE,
                              gray(0.8f), 2.f);
        }
    }
    // Furniture of the stations that reach into this chunk.
    for (int i = 0; i < track::N; i++) {
        double S = track::stationS(i);
        if (S + track::STATION_HALF + 5 >= B.s0 && S - track::STATION_HALF - 5 < B.s0 + World::CHUNK) B.stationItems(i);
    }
    // Close the far end of the tunnel behind Seoul Station.
    if (k == World::firstChunk())
        B.mb.quad(B.P(0, -TUN_W, BED_Y), B.P(0, TUN_W, BED_Y), B.P(0, TUN_W, TUN_H), B.P(0, -TUN_W, TUN_H), T_WHITE,
                  gray(0.01f));
    if (B.s0 >= track::CUT_END - 1) B.buildings(k);
    ch.mesh.upload(mb);
    if (!gl.i.empty()) ch.glass.upload(gl);
    if (!cut.i.empty()) ch.cut.upload(cut);
    if (!tx.i.empty()) ch.text.upload(tx);
}

int World::firstChunk() { return (int)ceil(track::S_MIN / CHUNK) + 1; }

// One sliding leaf of a platform screen door, on the plane x = -PSD.
static void psdLeaf(MB& mb, MB& gl, float a0, float a1) {
    float x = -PSD;
    // along the route is -z in the station frame
    auto q = [&](MB& m, float b0, float b1, float y0, float y1, float layer, Col c) {
        m.quad({x, y0, -b0}, {x, y0, -b1}, {x, y1, -b1}, {x, y1, -b0}, layer, c, 0.5f);
    };
    mb.gloss = 0.5f;
    q(mb, a0, a1, PLAT_Y, PLAT_Y + 0.3f, T_METAL, gray(0.66f));
    q(mb, a0, a1, PLAT_Y + PSD_H - 0.08f, PLAT_Y + PSD_H, T_METAL, gray(0.5f));
    q(mb, a0, a0 + 0.06f, PLAT_Y + 0.3f, PLAT_Y + PSD_H - 0.08f, T_METAL, gray(0.5f));
    q(mb, a1 - 0.06f, a1, PLAT_Y + 0.3f, PLAT_Y + PSD_H - 0.08f, T_METAL, gray(0.5f));
    mb.gloss = UNLIT;
    q(mb, a0 + 0.06f, a1 - 0.06f, PLAT_Y + 1.02f, PLAT_Y + 1.1f, T_WHITE, rgb(0.95f, 0.75f, 0.1f));
    mb.gloss = 0;
    q(gl, a0 + 0.06f, a1 - 0.06f, PLAT_Y + 0.3f, PLAT_Y + PSD_H - 0.08f, T_WHITE, rgb(0.75f, 0.9f, 0.95f, 0.13f));
}

void World::init() {
    // Sky dome centred on the viewer; the shader works from the view direction.
    MB mb;
    const int SEG = 48;
    const float R = 2600.f;
    Col w = gray(1);
    for (int i = 0; i < SEG; i++) {
        float a0 = i * 2 * (float)M_PI / SEG, a1 = (i + 1) * 2 * (float)M_PI / SEG;
        V3 p0 = {cosf(a0), 0, sinf(a0)}, p1 = {cosf(a1), 0, sinf(a1)};
        auto at = [&](V3 p, float rad, float y) { return V3{p.x * rad, y, p.z * rad}; };
        mb.quad(at(p0, R, -200), at(p1, R, -200), at(p1, R, 600), at(p0, R, 600), 0, 0, 1, 1, T_CLOUD, w, w, w, w);
        mb.quad(at(p0, R, 600), at(p1, R, 600), at(p1, R * 0.5f, 1700), at(p0, R * 0.5f, 1700), 0, 0, 1, 1, T_CLOUD, w, w,
                w, w);
        mb.quad(at(p0, R * 0.5f, 1700), at(p1, R * 0.5f, 1700), {0, 2000, 0}, {0, 2000, 0}, 0, 0, 1, 1, T_CLOUD, w, w, w,
                w);
    }
    skyDome.upload(mb);

    // Distant hills and a ground disc that fades into the horizon.
    mb.clear();
    mb.gloss = UNLIT;
    Col horizon = rgb(0.80f, 0.87f, 0.94f), hill = rgb(0.50f, 0.60f, 0.66f), hill2 = rgb(0.62f, 0.71f, 0.78f);
    Col groundNear = rgb(0.50f, 0.52f, 0.50f);
    uint32_t st = 99;
    float hs[SEG + 1], hs2[SEG + 1], prevH = 120;
    for (int i = 0; i < SEG; i++) {
        prevH = prevH * 0.5f + (60.f + rndf(st) * 330.f) * 0.5f;
        hs[i] = prevH;
        hs2[i] = 120.f + rndf(st) * 360.f;
    }
    hs[SEG] = hs[0];
    hs2[SEG] = hs2[0];
    for (int i = 0; i < SEG; i++) {
        float a0 = i * 2 * (float)M_PI / SEG, a1 = (i + 1) * 2 * (float)M_PI / SEG;
        V3 p0 = {cosf(a0), 0, sinf(a0)}, p1 = {cosf(a1), 0, sinf(a1)};
        auto at = [&](V3 p, float rad, float y) { return V3{p.x * rad, y, p.z * rad}; };
        mb.quad(at(p0, R * 0.97f, -30), at(p1, R * 0.97f, -30), at(p1, R * 0.97f, hs2[i + 1]), at(p0, R * 0.97f, hs2[i]),
                0, 0, 1, 1, T_WHITE, horizon, horizon, hill2, hill2);
        mb.quad(at(p0, R * 0.9f, -30), at(p1, R * 0.9f, -30), at(p1, R * 0.9f, hs[i + 1]), at(p0, R * 0.9f, hs[i]), 0, 0,
                1, 1, T_WHITE, horizon, horizon, hill, hill);
        mb.quad({0, -0.5f, 0}, {0, -0.5f, 0}, at(p1, 300, -0.5f), at(p0, 300, -0.5f), 0, 0, 1, 1, T_WHITE, groundNear,
                groundNear, groundNear, groundNear);
        mb.quad(at(p0, 300, -0.5f), at(p1, 300, -0.5f), at(p1, R, -0.5f), at(p0, R, -0.5f), 0, 0, 1, 1, T_WHITE,
                groundNear, groundNear, horizon, horizon);
    }
    scenery.upload(mb);

    MB la, lb, ga, gb;
    for (float a : platformDoors()) {
        psdLeaf(la, ga, a, a + 0.95f);   // slides towards +along (-z)
        psdLeaf(lb, gb, a - 0.95f, a);
    }
    psdLeafA.upload(la);
    psdLeafB.upload(lb);
    psdGlassA.upload(ga);
    psdGlassB.upload(gb);
}

void World::update(double s, int dir, int budget) {
    // More scenery ahead of the train than behind it.
    int lo = (int)floor((s - (dir > 0 ? 280.0 : 760.0)) / CHUNK), hi = (int)floor((s + (dir > 0 ? 760.0 : 280.0)) / CHUNK);
    int kMin = firstChunk(), kMax = (int)floor(track::S_MAX / CHUNK) - 2;
    if (lo < kMin) lo = kMin;
    if (hi > kMax) hi = kMax;
    for (auto it = chunks.begin(); it != chunks.end();) {
        if (it->first < lo - 2 || it->first > hi + 2) {
            it->second.mesh.destroy();
            it->second.glass.destroy();
            it->second.cut.destroy();
            it->second.text.destroy();
            it = chunks.erase(it);
        } else {
            ++it;
        }
    }
    // Nearest chunks first.
    int centre = (int)floor(s / CHUNK);
    for (int d = 0; d <= hi - lo && budget > 0; d++) {
        for (int sign = 1; sign >= -1 && budget > 0; sign -= 2) {
            int k = centre + d * sign;
            if (k < lo || k > hi || chunks.count(k)) continue;
            buildChunk(k, chunks[k]);
            budget--;
            if (d == 0) break;
        }
    }
}

void World::destroy() {
    for (auto& c : chunks) {
        c.second.mesh.destroy();
        c.second.glass.destroy();
        c.second.cut.destroy();
        c.second.text.destroy();
    }
    chunks.clear();
    skyDome.destroy();
    scenery.destroy();
    psdLeafA.destroy();
    psdLeafB.destroy();
    psdGlassA.destroy();
    psdGlassB.destroy();
}
