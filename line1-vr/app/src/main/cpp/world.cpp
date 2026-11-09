#include "world.h"

#include <cmath>
#include <cstdio>

#include "track.h"

namespace {

const float RAIL_Y = 0.f;        // top of rail
const float BED_Y = -0.18f;      // track bed
const float PLAT_Y = 1.10f;      // platform surface
const float PLAT_EDGE = 3.72f;   // platform edge, from the route centreline
const float TUN_W = 4.7f;        // tunnel half width between stations
const float TUN_H = 5.2f;
const float STA_W = 9.2f;        // tunnel half width in stations
const float STA_H = 4.6f;
const float OPEN_PLAT_W = 8.7f;  // back of an open-air platform
const float STEP = 5.f;          // spacing of cross sections
const int RINGS = 9;

const Col NAVY = {20, 52, 120, 255};  // Line 1 colour

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

struct Builder {
    MB& mb;
    MB& tx;
    Ring r[RINGS];
    double s0;

    V3 P(int j, float lat, float y, float along = 0) const {
        const Ring& g = r[j];
        return {g.c.x + g.n.x * lat + g.t.x * along, y, g.c.z + g.n.z * lat + g.t.z * along};
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
        V3 a = P(j, lat - half, y0, along - half), b = P(j, lat + half, y0, along - half);
        V3 d = P(j, lat - half, y0, along + half), e = P(j, lat + half, y0, along + half);
        auto up = [&](V3 p) { return V3{p.x, y1, p.z}; };
        Col side = scale(c, 0.8f);
        mb.quad(a, b, up(b), up(a), layer, c);
        mb.quad(d, e, up(e), up(d), layer, c);
        mb.quad(a, d, up(d), up(a), layer, side);
        mb.quad(b, e, up(e), up(b), layer, side);
    }

    void rails(int j, bool slab) {
        Col steel = gray(0.62f), web = rgb(0.30f, 0.22f, 0.17f);
        for (int side = -1; side <= 1; side += 2) {
            float tc = side * (float)track::TRACK_OFFSET;
            strip(j, tc - 1.4f, BED_Y + 0.01f, tc + 1.4f, BED_Y + 0.01f, slab ? T_SLAB : T_TRACK, gray(slab ? 0.5f : 0.75f),
                  gray(slab ? 0.5f : 0.75f), 0, 1, 2.4f);
            for (int rl = -1; rl <= 1; rl += 2) {
                float x = tc + rl * 0.7175f;
                strip(j, x - 0.035f, RAIL_Y, x + 0.035f, RAIL_Y, T_WHITE, steel);
                strip(j, x - 0.035f, BED_Y, x - 0.035f, RAIL_Y, T_WHITE, web);
                strip(j, x + 0.035f, BED_Y, x + 0.035f, RAIL_Y, T_WHITE, web);
            }
        }
    }

    // Station name board on a platform wall. side = +1 for the left wall.
    void sign(int j, int side, float wallLat, float yc, int st) {
        V3 right = side > 0 ? r[j].t : r[j].t * -1.f;
        V3 up = {0, 1, 0};
        V3 in = r[j].n * (float)-side;  // towards the tracks
        V3 c = P(j, wallLat, yc);
        const float W = 3.2f, H = 1.0f;
        V3 b0 = c + in * 0.06f;
        mb.quad(b0 - right * (W / 2) - up * (H / 2), b0 + right * (W / 2) - up * (H / 2),
                b0 + right * (W / 2) + up * (H / 2), b0 - right * (W / 2) + up * (H / 2), T_WHITE, gray(0.97f));
        V3 b1 = c + in * 0.09f - up * (H / 2 - 0.11f);
        mb.quad(b1 - right * (W / 2) - up * 0.11f, b1 + right * (W / 2) - up * 0.11f, b1 + right * (W / 2) + up * 0.11f,
                b1 - right * (W / 2) + up * 0.11f, T_WHITE, NAVY);
        V3 t0 = c + in * 0.12f;
        const track::Station& S = track::ST[st];
        addText(tx, S.ko, t0 + up * 0.02f, right, up, 0.36f, gray(0.08f), 1);
        addText(tx, S.en, t0 - up * 0.21f, right, up, 0.12f, gray(0.25f), 1);
        char num[16];
        snprintf(num, sizeof(num), "%d", S.number);
        addText(tx, num, t0 - right * (W / 2 - 0.12f) + up * 0.28f, right, up, 0.14f, NAVY, 0);
        // Neighbouring stations: the one further along the route is on the
        // viewer's right when looking at the left wall.
        int rightSt = st + side, leftSt = st - side;
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

    void platform(int j, float backLat, float tileBright) {
        for (int side = -1; side <= 1; side += 2) {
            float sd = (float)side;
            strip(j, sd * PLAT_EDGE, BED_Y, sd * PLAT_EDGE, PLAT_Y, T_CONCRETE, gray(0.45f));
            strip(j, sd * PLAT_EDGE, PLAT_Y, sd * 4.15f, PLAT_Y, T_PLATFORM, gray(tileBright), 2.f, 2.f);
            strip(j, sd * 4.15f, PLAT_Y, sd * 4.6f, PLAT_Y, T_WHITE, rgb(0.95f, 0.78f, 0.1f));
            strip(j, sd * 4.6f, PLAT_Y, sd * backLat, PLAT_Y, T_PLATFORM, gray(tileBright), 2.f, 2.f);
        }
    }

    void tunnelSegment(int j) {
        auto lamp = [&](int k) { return fmod(fabs(r[k].s), 10.0) < 0.1; };
        Col w0 = gray(lamp(j) ? 0.55f : 0.20f), w1 = gray(lamp(j + 1) ? 0.55f : 0.20f);
        Col f0 = gray(lamp(j) ? 0.36f : 0.2f), f1 = gray(lamp(j + 1) ? 0.36f : 0.2f);
        float to = (float)track::TRACK_OFFSET;
        strip(j, -TUN_W, BED_Y, -to - 1.4f, BED_Y, T_CONCRETE, f0, f1, 0, 0.6f);
        strip(j, -to + 1.4f, BED_Y, to - 1.4f, BED_Y, T_CONCRETE, f0, f1, 0, 0.7f);
        strip(j, to + 1.4f, BED_Y, TUN_W, BED_Y, T_CONCRETE, f0, f1, 0, 0.6f);
        rails(j, true);
        for (int side = -1; side <= 1; side += 2) {
            float sd = (float)side;
            strip(j, sd * TUN_W, BED_Y, sd * TUN_W, TUN_H, T_CONCRETE, w0, w1, 0, 2.7f);
            // cable runs
            strip(j, sd * (TUN_W - 0.08f), 1.25f, sd * (TUN_W - 0.08f), 1.33f, T_WHITE, gray(0.05f));
            strip(j, sd * (TUN_W - 0.08f), 1.50f, sd * (TUN_W - 0.08f), 1.58f, T_WHITE, gray(0.05f));
            if (lamp(j))
                mb.quad(P(j, sd * (TUN_W - 0.07f), 2.75f, -0.6f), P(j, sd * (TUN_W - 0.07f), 2.75f, 0.6f),
                        P(j, sd * (TUN_W - 0.07f), 2.88f, 0.6f), P(j, sd * (TUN_W - 0.07f), 2.88f, -0.6f), T_WHITE,
                        rgb(1, 0.97f, 0.85f));
        }
        strip(j, -TUN_W, TUN_H, TUN_W, TUN_H, T_CONCRETE, scale(f0, 0.7f), scale(f1, 0.7f), 0, 4.7f);
        pillar(j, 0, 0.2f, BED_Y, TUN_H, T_CONCRETE, gray(lamp(j) ? 0.45f : 0.3f));
    }

    void tunnelStation(int j, int st) {
        strip(j, -PLAT_EDGE, BED_Y, -(float)track::TRACK_OFFSET - 1.4f, BED_Y, T_CONCRETE, gray(0.4f));
        strip(j, -(float)track::TRACK_OFFSET + 1.4f, BED_Y, (float)track::TRACK_OFFSET - 1.4f, BED_Y, T_CONCRETE,
              gray(0.4f));
        strip(j, (float)track::TRACK_OFFSET + 1.4f, BED_Y, PLAT_EDGE, BED_Y, T_CONCRETE, gray(0.4f));
        rails(j, true);
        platform(j, STA_W, 0.85f);
        double rel = r[j].s - track::stationS(st);
        bool tens = fmod(fabs(rel), 10.0) < 0.1;
        for (int side = -1; side <= 1; side += 2) {
            float sd = (float)side;
            strip(j, sd * STA_W, PLAT_Y, sd * STA_W, STA_H, T_TILE, rgb(0.9f, 0.88f, 0.82f), 2.f, 2.f);
            strip(j, sd * (STA_W - 0.03f), 3.45f, sd * (STA_W - 0.03f), 3.62f, T_WHITE, NAVY);
            if (tens) pillar(j, sd * 6.6f, 0.3f, PLAT_Y, STA_H, T_TILE, gray(0.88f));
            // ceiling light panels
            for (float lat : {5.0f, 7.8f})
                mb.quad(P(j, sd * (lat - 0.15f), STA_H - 0.05f, 1.2f), P(j, sd * (lat + 0.15f), STA_H - 0.05f, 1.2f),
                        P(j, sd * (lat + 0.15f), STA_H - 0.05f, 3.8f), P(j, sd * (lat - 0.15f), STA_H - 0.05f, 3.8f),
                        T_WHITE, rgb(1, 1, 0.95f));
            if (fabs(fmod(fabs(rel), 20.0) - 5.0) < 0.1 && fabs(rel) < 100) sign(j, side, sd * STA_W, 2.55f, st);
        }
        strip(j, -STA_W, STA_H, STA_W, STA_H, T_CONCRETE, gray(0.62f), 3.f, 3.f);
        pillar(j, 0, 0.22f, BED_Y, STA_H, T_TILE, gray(0.8f));
    }

    void ground(int j) {
        Col gc = rgb(0.56f, 0.58f, 0.55f);
        for (int side = -1; side <= 1; side += 2) {
            float sd = (float)side;
            strip(j, sd * 5.5f, BED_Y - 0.02f, sd * 250.f, BED_Y - 0.02f, T_GROUND, gc, 6.f, 6.f);
        }
        strip(j, -5.5f, BED_Y, -(float)track::TRACK_OFFSET - 1.4f, BED_Y, T_BALLAST, gray(0.72f), 1.5f, 1.5f);
        strip(j, -(float)track::TRACK_OFFSET + 1.4f, BED_Y, (float)track::TRACK_OFFSET - 1.4f, BED_Y, T_BALLAST,
              gray(0.72f), 1.5f, 1.5f);
        strip(j, (float)track::TRACK_OFFSET + 1.4f, BED_Y, 5.5f, BED_Y, T_BALLAST, gray(0.72f), 1.5f, 1.5f);
        rails(j, false);
        // overhead wires
        for (int side = -1; side <= 1; side += 2) {
            float tc = side * (float)track::TRACK_OFFSET;
            strip(j, tc - 0.025f, 5.3f, tc + 0.025f, 5.3f, T_WHITE, gray(0.12f));
            strip(j, tc - 0.02f, 6.2f, tc + 0.02f, 6.2f, T_WHITE, gray(0.12f));
        }
    }

    void openSegment(int j, double mid) {
        ground(j);
        if (mid < track::CUT_END) {
            // retaining walls of the ramp out of the tunnel
            auto h = [&](double s) {
                double t = (s - track::PORTAL) / (track::CUT_END - track::PORTAL);
                return (float)(TUN_H + (2.0 - TUN_H) * (t < 0 ? 0 : t > 1 ? 1 : t));
            };
            for (int side = -1; side <= 1; side += 2) {
                float l = side * 5.0f;
                mb.quad(P(j, l, BED_Y), P(j + 1, l, BED_Y), P(j + 1, l, h(r[j + 1].s)), P(j, l, h(r[j].s)), T_CONCRETE,
                        gray(0.6f), 2.f);
            }
        } else {
            for (int side = -1; side <= 1; side += 2)
                strip(j, side * 6.2f, BED_Y, side * 6.2f, 1.9f, T_TILE, rgb(0.74f, 0.77f, 0.75f), 2.f, 2.f);
        }
        if (j == 0 && mid >= track::CUT_END) gantry(j, 5.4f);
    }

    void gantry(int j, float lat) {
        Col c = gray(0.42f);
        pillar(j, -lat, 0.12f, BED_Y, 7.4f, T_METAL, c);
        pillar(j, lat, 0.12f, BED_Y, 7.4f, T_METAL, c);
        mb.quad(P(j, -lat, 6.95f, -0.08f), P(j, lat, 6.95f, -0.08f), P(j, lat, 7.2f, -0.08f), P(j, -lat, 7.2f, -0.08f),
                T_METAL, c);
        mb.quad(P(j, -lat, 6.95f, 0.08f), P(j, lat, 6.95f, 0.08f), P(j, lat, 7.2f, 0.08f), P(j, -lat, 7.2f, 0.08f),
                T_METAL, c);
        mb.quad(P(j, -lat, 6.95f, -0.08f), P(j, lat, 6.95f, -0.08f), P(j, lat, 6.95f, 0.08f), P(j, -lat, 6.95f, 0.08f),
                T_METAL, scale(c, 0.7f));
    }

    void openStation(int j, int st) {
        ground(j);
        platform(j, OPEN_PLAT_W, 0.8f);
        double rel = r[j].s - track::stationS(st);
        bool tens = fmod(fabs(rel), 10.0) < 0.1;
        for (int side = -1; side <= 1; side += 2) {
            float sd = (float)side;
            strip(j, sd * OPEN_PLAT_W, BED_Y, sd * OPEN_PLAT_W, 3.3f, T_TILE, rgb(0.82f, 0.86f, 0.88f), 2.f, 2.f);
            // canopy: underside and fascia
            strip(j, sd * 3.5f, 4.45f, sd * 9.0f, 4.75f, T_METAL, rgb(0.78f, 0.80f, 0.82f), 2.f, 2.f);
            strip(j, sd * 3.5f, 4.45f, sd * 3.5f, 4.7f, T_WHITE, NAVY);
            if (tens) pillar(j, sd * 6.4f, 0.14f, PLAT_Y, 4.6f, T_METAL, gray(0.7f));
            if (fabs(fmod(fabs(rel), 20.0) - 5.0) < 0.1 && fabs(rel) < 100) sign(j, side, sd * OPEN_PLAT_W, 2.5f, st);
        }
        if (j == 0) gantry(j, 9.3f);
    }

    // End wall where the cross section changes at ring j.
    void headwall(int j, float in, float out, float y0, float y1, float lintelFrom, Col c) {
        for (int side = -1; side <= 1; side += 2)
            mb.quad(P(j, side * in, y0), P(j, side * out, y0), P(j, side * out, y1), P(j, side * in, y1), T_CONCRETE, c,
                    2.f);
        if (lintelFrom < y1)
            mb.quad(P(j, -in, lintelFrom), P(j, in, lintelFrom), P(j, in, y1), P(j, -in, y1), T_CONCRETE, c, 2.f);
    }

    void buildings(int k) {
        uint32_t st = (uint32_t)k * 2654435761u + 12345u;
        for (int side = -1; side <= 1; side += 2) {
            int count = 1 + rnd(st) % 3;
            for (int b = 0; b < count; b++) {
                int j = rnd(st) % (RINGS - 1);
                float lat = 16.f + rndf(st) * rndf(st) * 190.f;
                float w = 14.f + rndf(st) * 30.f, d = 12.f + rndf(st) * 16.f;
                bool tower = rndf(st) < 0.3f;
                float h = tower ? 38.f + rndf(st) * 30.f : 6.f + rndf(st) * 16.f;
                float tint = rndf(st);
                Col base = tint < 0.33f ? rgb(0.92f, 0.9f, 0.84f) : tint < 0.66f ? rgb(0.8f, 0.82f, 0.86f)
                                                                                  : rgb(0.86f, 0.74f, 0.66f);
                float l0 = side * lat, l1 = side * (lat + d);
                float y0 = BED_Y - 0.02f;
                V3 a = P(j, l0, y0, -w / 2), b2 = P(j, l0, y0, w / 2), c = P(j, l1, y0, w / 2), e = P(j, l1, y0, -w / 2);
                auto up = [&](V3 p) { return V3{p.x, y0 + h, p.z}; };
                float fu = w / 12.8f, fd = d / 12.8f, fv = h / 12.f;
                auto wall = [&](V3 p, V3 q, float uu, float shade) {
                    Col cc = scale(base, shade);
                    mb.quad(p, q, up(q), up(p), 0, fv, uu, 0, T_FACADE, cc, cc, cc, cc);
                };
                wall(a, b2, fu, 0.95f);
                wall(c, e, fu, 0.7f);
                wall(b2, c, fd, 0.82f);
                wall(e, a, fd, 0.82f);
                mb.quad(up(a), up(b2), up(c), up(e), T_CONCRETE, gray(0.45f), 4.f);
            }
        }
    }
};

}  // namespace

static void buildChunk(int k, Chunk& ch) {
    MB mb, tx;
    Builder B{mb, tx};
    B.s0 = k * World::CHUNK;
    double ox, oz, tx0, tz0;
    track::pose(B.s0, 0, ox, oz, tx0, tz0);
    ch.ox = ox;
    ch.oz = oz;
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
                B.headwall(j, TUN_W, STA_W, BED_Y, STA_H, TUN_H, gray(0.5f));
                B.mb.quad(B.P(j, -TUN_W, STA_H), B.P(j, TUN_W, STA_H), B.P(j, TUN_W, TUN_H), B.P(j, -TUN_W, TUN_H),
                          T_CONCRETE, gray(0.4f), 2.f);
            }
        } else {
            if (st >= 0)
                B.openStation(j, st);
            else
                B.openSegment(j, mid);
            if (s - STEP * 0.5 < track::PORTAL)  // tunnel mouth
                B.headwall(j, TUN_W, 18.f, BED_Y, 7.6f, TUN_H, gray(0.66f));
        }
    }
    // Close the far end of the tunnel behind Seoul Station.
    if (k == World::firstChunk())
        B.mb.quad(B.P(0, -TUN_W, BED_Y), B.P(0, TUN_W, BED_Y), B.P(0, TUN_W, TUN_H), B.P(0, -TUN_W, TUN_H), T_WHITE,
                  gray(0.01f));
    if (B.s0 >= track::CUT_END - 1) B.buildings(k);
    ch.mesh.upload(mb);
    if (!tx.i.empty()) ch.text.upload(tx);
}

int World::firstChunk() { return (int)ceil(track::S_MIN / CHUNK) + 1; }

void World::init() {
    // Sky dome, distant hills and a ground disc, all centred on the viewer.
    MB mb;
    const int SEG = 48;
    const float R = 2600.f;
    Col horizon = rgb(0.80f, 0.87f, 0.94f), zenith = rgb(0.30f, 0.52f, 0.86f), hill = rgb(0.52f, 0.62f, 0.70f);
    Col groundNear = rgb(0.50f, 0.52f, 0.50f);
    uint32_t st = 99;
    float prevH = 120;
    float hs[SEG + 1];
    for (int i = 0; i < SEG; i++) {
        prevH = prevH * 0.5f + (60.f + rndf(st) * 320.f) * 0.5f;
        hs[i] = prevH;
    }
    hs[SEG] = hs[0];
    for (int i = 0; i < SEG; i++) {
        float a0 = i * 2 * (float)M_PI / SEG, a1 = (i + 1) * 2 * (float)M_PI / SEG;
        V3 p0 = {cosf(a0), 0, sinf(a0)}, p1 = {cosf(a1), 0, sinf(a1)};
        auto at = [&](V3 p, float rad, float y) { return V3{p.x * rad, y, p.z * rad}; };
        mb.quad(at(p0, R, -30), at(p1, R, -30), at(p1, R, 500), at(p0, R, 500), 0, 0, 1, 1, T_WHITE, horizon, horizon,
                zenith, zenith);
        mb.quad(at(p0, R, 500), at(p1, R, 500), at(p1, R * 0.4f, 1500), at(p0, R * 0.4f, 1500), 0, 0, 1, 1, T_WHITE,
                zenith, zenith, zenith, zenith);
        mb.quad(at(p0, R * 0.4f, 1500), at(p1, R * 0.4f, 1500), {0, 1600, 0}, {0, 1600, 0}, 0, 0, 1, 1, T_WHITE, zenith,
                zenith, zenith, zenith);
        mb.quad(at(p0, R * 0.95f, -30), at(p1, R * 0.95f, -30), at(p1, R * 0.95f, hs[i + 1]), at(p0, R * 0.95f, hs[i]),
                0, 0, 1, 1, T_WHITE, horizon, horizon, hill, hill);
        mb.quad({0, -0.5f, 0}, {0, -0.5f, 0}, at(p1, 300, -0.5f), at(p0, 300, -0.5f), 0, 0, 1, 1, T_WHITE, groundNear,
                groundNear, groundNear, groundNear);
        mb.quad(at(p0, 300, -0.5f), at(p1, 300, -0.5f), at(p1, R, -0.5f), at(p0, R, -0.5f), 0, 0, 1, 1, T_WHITE,
                groundNear, groundNear, horizon, horizon);
    }
    sky.upload(mb);
}

void World::update(double s, int dir, int budget) {
    // More scenery ahead of the train than behind it.
    int lo = (int)floor((s - (dir > 0 ? 240.0 : 760.0)) / CHUNK), hi = (int)floor((s + (dir > 0 ? 760.0 : 240.0)) / CHUNK);
    int kMin = firstChunk(), kMax = (int)floor(track::S_MAX / CHUNK) - 2;
    if (lo < kMin) lo = kMin;
    if (hi > kMax) hi = kMax;
    for (auto it = chunks.begin(); it != chunks.end();) {
        if (it->first < lo - 2 || it->first > hi + 2) {
            it->second.mesh.destroy();
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
        c.second.text.destroy();
    }
    chunks.clear();
    sky.destroy();
}
