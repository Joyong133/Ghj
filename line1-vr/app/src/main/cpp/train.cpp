#include "train.h"

#include <cmath>
#include <vector>

namespace train {

namespace {

const Col INTERIOR = {232, 232, 224, 255};
const Col EXTERIOR = {196, 200, 206, 255};
const Col NAVY = {20, 52, 120, 255};
const Col GLASS = {150, 190, 200, 46};

struct Open {
    float z0, z1, y0, y1;
};

// Side wall with rectangular openings. `sx` is -1 (left) or +1 (right).
void sideWall(MB& mb, MB& gl, float sx, float zFrom, float zTo, const std::vector<Open>& opens) {
    float xi = sx * HALF_IN, xo = sx * HALF_OUT;
    float top = FLOOR + CEIL;
    auto panel = [&](float z0, float z1, float y0, float y1) {
        if (z1 - z0 < 1e-4f || y1 - y0 < 1e-4f) return;
        mb.gloss = 0.12f;
        mb.quad({xi, y0, z0}, {xi, y0, z1}, {xi, y1, z1}, {xi, y1, z0}, T_WHITE, INTERIOR);
        // Exterior: stainless steel with the navy band of Line 1 below the windows.
        mb.gloss = 0.45f;
        float band0 = FLOOR + 0.55f, band1 = FLOOR + 0.85f;
        auto ext = [&](float a, float b, Col c) {
            if (b - a < 1e-4f) return;
            mb.quad({xo, a, z0}, {xo, a, z1}, {xo, b, z1}, {xo, b, z0}, T_METAL, c, 0.5f);
        };
        float a = y0, b = y1;
        ext(a, b < band0 ? b : band0, EXTERIOR);
        ext(a > band0 ? a : band0, b < band1 ? b : band1, NAVY);
        ext(a > band1 ? a : band1, b, EXTERIOR);
        mb.gloss = 0;
    };
    float z = zFrom;
    for (const Open& o : opens) {
        panel(z, o.z0, FLOOR, top);
        panel(o.z0, o.z1, FLOOR, o.y0);
        panel(o.z0, o.z1, o.y1, top);
        // reveals
        Col rv = scale(INTERIOR, 0.8f);
        mb.quad({xi, o.y0, o.z0}, {xo, o.y0, o.z0}, {xo, o.y1, o.z0}, {xi, o.y1, o.z0}, T_WHITE, rv);
        mb.quad({xi, o.y0, o.z1}, {xo, o.y0, o.z1}, {xo, o.y1, o.z1}, {xi, o.y1, o.z1}, T_WHITE, rv);
        mb.quad({xi, o.y1, o.z0}, {xo, o.y1, o.z0}, {xo, o.y1, o.z1}, {xi, o.y1, o.z1}, T_WHITE, rv);
        if (o.y0 > FLOOR + 0.01f) {
            mb.quad({xi, o.y0, o.z0}, {xo, o.y0, o.z0}, {xo, o.y0, o.z1}, {xi, o.y0, o.z1}, T_WHITE, rv);
            // window: glass and a dark rubber frame on the inside
            float xg = sx * (HALF_IN + 0.055f);
            gl.quad({xg, o.y0, o.z0}, {xg, o.y0, o.z1}, {xg, o.y1, o.z1}, {xg, o.y1, o.z0}, T_WHITE, GLASS);
            float xf = sx * (HALF_IN - 0.004f), w = 0.035f;
            Col fr = gray(0.14f);
            mb.quad({xf, o.y0 - w, o.z0 - w}, {xf, o.y0 - w, o.z1 + w}, {xf, o.y0, o.z1 + w}, {xf, o.y0, o.z0 - w}, T_WHITE, fr);
            mb.quad({xf, o.y1, o.z0 - w}, {xf, o.y1, o.z1 + w}, {xf, o.y1 + w, o.z1 + w}, {xf, o.y1 + w, o.z0 - w}, T_WHITE, fr);
            mb.quad({xf, o.y0, o.z0 - w}, {xf, o.y0, o.z0}, {xf, o.y1, o.z0}, {xf, o.y1, o.z0 - w}, T_WHITE, fr);
            mb.quad({xf, o.y0, o.z1}, {xf, o.y0, o.z1 + w}, {xf, o.y1, o.z1 + w}, {xf, o.y1, o.z1}, T_WHITE, fr);
        } else {
            // door sill with a yellow warning strip
            mb.quad({sx * (HALF_IN - 0.14f), FLOOR + 0.003f, o.z0}, {xo, FLOOR + 0.003f, o.z0}, {xo, FLOOR + 0.003f, o.z1},
                    {sx * (HALF_IN - 0.14f), FLOOR + 0.003f, o.z1}, T_WHITE, rgb(0.95f, 0.78f, 0.1f));
        }
        z = o.z1;
    }
    panel(z, zTo, FLOOR, top);
    // skirt below the floor and the roof edge
    mb.quad({xo, 0.3f, zFrom}, {xo, 0.3f, zTo}, {xo, FLOOR, zTo}, {xo, FLOOR, zFrom}, T_WHITE, gray(0.16f));
    mb.gloss = 0.4f;
    mb.quad({xo, top, zFrom}, {xo, top, zTo}, {sx * 1.1f, top + 0.4f, zTo}, {sx * 1.1f, top + 0.4f, zFrom}, T_METAL,
            EXTERIOR, 0.5f);
    mb.gloss = 0;
}

// One sliding door leaf with a window, centred on zc, in the wall plane.
void doorLeaf(MB& mb, MB& gl, float sx, float zc) {
    float x = sx * (HALF_IN + 0.05f), h = DOOR_HALF / 2;
    float z0 = zc - h, z1 = zc + h, y0 = FLOOR, y1 = FLOOR + DOOR_H;
    float wz0 = z0 + 0.09f, wz1 = z1 - 0.09f, wy0 = FLOOR + 0.95f, wy1 = FLOOR + 1.7f;
    Col c = rgb(0.82f, 0.84f, 0.86f);
    mb.gloss = 0.4f;
    auto q = [&](float a0, float a1, float b0, float b1) {
        mb.quad({x, b0, a0}, {x, b0, a1}, {x, b1, a1}, {x, b1, a0}, T_METAL, c, 0.5f);
    };
    q(z0, z1, y0, wy0);
    q(z0, z1, wy1, y1);
    q(z0, wz0, wy0, wy1);
    q(wz1, z1, wy0, wy1);
    mb.gloss = 0;
    gl.quad({x, wy0, wz0}, {x, wy0, wz1}, {x, wy1, wz1}, {x, wy1, wz0}, T_WHITE, GLASS);
    // rubber edges, inside and outside
    for (float dx : {-0.012f, 0.012f}) {
        float xx = x + dx;
        mb.quad({xx, y0, z0}, {xx, y0, z0 + 0.03f}, {xx, y1, z0 + 0.03f}, {xx, y1, z0}, T_WHITE, gray(0.1f));
        mb.quad({xx, y0, z1 - 0.03f}, {xx, y0, z1}, {xx, y1, z1}, {xx, y1, z1 - 0.03f}, T_WHITE, gray(0.1f));
        mb.quad({xx, wy0 - 0.03f, wz0 - 0.03f}, {xx, wy0 - 0.03f, wz1 + 0.03f}, {xx, wy0, wz1 + 0.03f}, {xx, wy0, wz0 - 0.03f},
                T_WHITE, gray(0.1f));
        mb.quad({xx, wy1, wz0 - 0.03f}, {xx, wy1, wz1 + 0.03f}, {xx, wy1 + 0.03f, wz1 + 0.03f}, {xx, wy1 + 0.03f, wz0 - 0.03f},
                T_WHITE, gray(0.1f));
    }
}

void endWall(MB& mb, float z, float faceDir) {
    // Wall across the car with the gangway opening (|x| < 0.45, 1.95 m high).
    float top = FLOOR + CEIL, gy = FLOOR + 1.95f, g = 0.45f;
    Col c = scale(INTERIOR, 0.97f);
    mb.gloss = 0.1f;
    for (float dz : {0.f, 0.06f * faceDir}) {
        float zz = z + dz;
        mb.quad({-HALF_IN, FLOOR, zz}, {-g, FLOOR, zz}, {-g, top, zz}, {-HALF_IN, top, zz}, T_WHITE, c);
        mb.quad({g, FLOOR, zz}, {HALF_IN, FLOOR, zz}, {HALF_IN, top, zz}, {g, top, zz}, T_WHITE, c);
        mb.quad({-g, gy, zz}, {g, gy, zz}, {g, top, zz}, {-g, top, zz}, T_WHITE, c);
    }
    // door frame
    float z1 = z + 0.06f * faceDir;
    Col fr = gray(0.55f);
    mb.gloss = 0.5f;
    for (float x : {-g, g}) mb.quad({x, FLOOR, z}, {x, FLOOR, z1}, {x, gy, z1}, {x, gy, z}, T_METAL, fr, 0.5f);
    mb.quad({-g, gy, z}, {g, gy, z}, {g, gy, z1}, {-g, gy, z1}, T_METAL, fr, 0.5f);
    mb.gloss = 0;
}

void bench(MB& mb, float sx, float z0, float z1, Col seat) {
    Col frame = gray(0.8f);
    float xw = sx * HALF_IN, xf = sx * (HALF_IN - 0.5f);
    float lo = xw < xf ? xw : xf, hi = xw < xf ? xf : xw;
    mb.box({lo, FLOOR + 0.33f, z0}, {hi, FLOOR + 0.44f, z1}, T_SEAT, seat, 0.5f);
    float bx0 = sx > 0 ? xw - 0.09f : xw, bx1 = sx > 0 ? xw : xw + 0.09f;
    mb.box({bx0, FLOOR + 0.44f, z0}, {bx1, FLOOR + 0.92f, z1}, T_SEAT, seat, 0.5f);
    // seat divisions
    int seats = (int)((z1 - z0) / 0.44f + 0.5f);
    for (int k = 1; k < seats; k++) {
        float z = z0 + (z1 - z0) * k / seats;
        mb.box({lo, FLOOR + 0.441f, z - 0.006f}, {hi, FLOOR + 0.446f, z + 0.006f}, T_WHITE, scale(seat, 0.55f));
    }
    // heater box under the seat
    float hx0 = sx > 0 ? xw - 0.3f : xw, hx1 = sx > 0 ? xw : xw + 0.3f;
    mb.gloss = 0.3f;
    mb.box({hx0, FLOOR, z0 + 0.05f}, {hx1, FLOOR + 0.33f, z1 - 0.05f}, T_METAL, gray(0.6f));
    // end partitions and grab poles
    for (float z : {z0, z1}) {
        if (fabsf(z) > 9.5f) continue;  // against the end wall
        mb.gloss = 0.2f;
        mb.box({lo, FLOOR, z - 0.015f}, {hi, FLOOR + 1.15f, z + 0.015f}, T_WHITE, frame);
        mb.gloss = 0.9f;
        mb.box({xf - 0.018f, FLOOR, z - 0.018f}, {xf + 0.018f, FLOOR + CEIL, z + 0.018f}, T_METAL, gray(0.9f));
    }
    // luggage rack
    if (fabsf(z0) < 8.f && fabsf(z1) < 8.f) {
        mb.gloss = 0.9f;
        for (int k = 0; k < 4; k++) {
            float x = sx * (HALF_IN - 0.06f - 0.1f * k);
            mb.box({x - 0.008f, FLOOR + 1.77f, z0 + 0.1f}, {x + 0.008f, FLOOR + 1.786f, z1 - 0.1f}, T_METAL, gray(0.9f));
        }
        for (float z : {z0 + 0.1f, (z0 + z1) / 2, z1 - 0.1f}) {
            float xa = sx * HALF_IN, xb = sx * (HALF_IN - 0.38f);
            mb.box({xa < xb ? xa : xb, FLOOR + 1.75f, z - 0.01f}, {xa < xb ? xb : xa, FLOOR + 1.77f, z + 0.01f}, T_METAL,
                   gray(0.8f));
        }
    }
    mb.gloss = 0;
    // hanging straps
    for (float z = z0 + 0.25f; z < z1 - 0.1f; z += 0.5f) {
        if (fabsf(z) > 8.f) continue;  // keep the boards on the end wall clear
        float x = sx * 0.78f;
        mb.box({x - 0.008f, FLOOR + 1.70f, z - 0.012f}, {x + 0.008f, FLOOR + 1.9f, z + 0.012f}, T_WHITE, gray(0.9f));
        mb.box({x - 0.01f, FLOOR + 1.65f, z - 0.045f}, {x + 0.01f, FLOOR + 1.70f, z + 0.045f}, T_WHITE,
               rgb(0.85f, 0.85f, 0.8f));
    }
}

std::vector<Open> carOpenings() {
    std::vector<Open> o;
    const float wy0 = FLOOR + 0.85f, wy1 = FLOOR + 1.8f;
    o.push_back({-9.3f, -8.3f, wy0, wy1});
    for (int d = 0; d < 4; d++) {
        o.push_back({DOOR_Z[d] - DOOR_HALF, DOOR_Z[d] + DOOR_HALF, FLOOR, FLOOR + DOOR_H});
        if (d < 3) o.push_back({DOOR_Z[d] + 2.4f - 1.1f, DOOR_Z[d] + 2.4f + 1.1f, wy0, wy1});
    }
    o.push_back({8.3f, 9.3f, wy0, wy1});
    return o;
}

void buildBody(MB& mb, MB& gl) {
    float top = FLOOR + CEIL;
    // floor, ceiling, light strips and the air-conditioning grille
    mb.gloss = 0.2f;
    mb.quad({-HALF_IN, FLOOR, -HALF_LEN}, {HALF_IN, FLOOR, -HALF_LEN}, {HALF_IN, FLOOR, HALF_LEN},
            {-HALF_IN, FLOOR, HALF_LEN}, T_CARFLOOR, rgb(0.60f, 0.63f, 0.68f), 0.6f);
    mb.gloss = 0;
    mb.quad({-HALF_IN, top, -HALF_LEN}, {HALF_IN, top, -HALF_LEN}, {HALF_IN, top, HALF_LEN}, {-HALF_IN, top, HALF_LEN},
            T_CEILING, gray(1), 1.2f);
    mb.quad({-0.16f, top - 0.012f, -9.4f}, {0.16f, top - 0.012f, -9.4f}, {0.16f, top - 0.012f, 9.4f},
            {-0.16f, top - 0.012f, 9.4f}, T_PANEL, gray(0.5f), 0.4f);
    mb.gloss = UNLIT;
    for (float x : {-0.6f, 0.6f})
        mb.quad({x - 0.07f, top - 0.015f, -9.5f}, {x + 0.07f, top - 0.015f, -9.5f}, {x + 0.07f, top - 0.015f, 9.5f},
                {x - 0.07f, top - 0.015f, 9.5f}, T_WHITE, gray(1));
    mb.gloss = 0;
    // roof with air-conditioning units, and the underframe
    mb.gloss = 0.3f;
    mb.quad({-1.1f, top + 0.4f, -HALF_LEN}, {1.1f, top + 0.4f, -HALF_LEN}, {1.1f, top + 0.4f, HALF_LEN},
            {-1.1f, top + 0.4f, HALF_LEN}, T_METAL, gray(0.62f));
    for (float z : {-4.5f, 4.5f}) mb.box({-0.9f, top + 0.4f, z - 1.6f}, {0.9f, top + 0.64f, z + 1.6f}, T_METAL, gray(0.7f));
    mb.gloss = 0;
    mb.box({-1.4f, 0.3f, -9.6f}, {1.4f, FLOOR - 0.02f, 9.6f}, T_WHITE, gray(0.1f));
    std::vector<Open> opens = carOpenings();
    Col blue = rgb(0.20f, 0.36f, 0.74f), priority = rgb(0.80f, 0.42f, 0.25f);
    for (float sx : {-1.f, 1.f}) {
        sideWall(mb, gl, sx, -HALF_LEN, HALF_LEN, opens);
        bench(mb, sx, -6.35f, -3.25f, blue);
        bench(mb, sx, -1.55f, 1.55f, blue);
        bench(mb, sx, 3.25f, 6.35f, blue);
        bench(mb, sx, -9.6f, -8.05f, priority);
        bench(mb, sx, 8.05f, 9.6f, priority);
        // handrail along the car
        mb.gloss = 0.9f;
        mb.box({sx * 0.78f - 0.015f, FLOOR + 1.9f, -9.5f}, {sx * 0.78f + 0.015f, FLOOR + 1.93f, 9.5f}, T_METAL,
               gray(0.92f));
        for (float z = -9.f; z <= 9.f; z += 2.f)
            mb.box({sx * 0.78f - 0.01f, FLOOR + 1.93f, z - 0.01f}, {sx * 0.78f + 0.01f, top, z + 0.01f}, T_METAL, gray(0.9f));
        mb.gloss = 0;
        // door headers: passenger information displays
        float x = sx * (HALF_IN - 0.012f);
        for (int d = 0; d < 4; d++)
            mb.quad({x, FLOOR + 1.95f, DOOR_Z[d] - 0.55f}, {x, FLOOR + 1.95f, DOOR_Z[d] + 0.55f},
                    {x, FLOOR + 2.2f, DOOR_Z[d] + 0.55f}, {x, FLOOR + 2.2f, DOOR_Z[d] - 0.55f}, T_WHITE, gray(0.03f));
        // boards above the windows: route map in the middle, notices at the sides
        mb.gloss = UNLIT;
        mb.quad({x, FLOOR + 1.86f, -1.05f}, {x, FLOOR + 1.86f, 1.05f}, {x, FLOOR + 2.2f, 1.05f}, {x, FLOOR + 2.2f, -1.05f},
                T_WHITE, gray(0.98f));
        for (float zc : {-4.8f, 4.8f})
            mb.quad({x, FLOOR + 1.88f, zc - 1.0f}, {x, FLOOR + 1.88f, zc + 1.0f}, {x, FLOOR + 2.18f, zc + 1.0f},
                    {x, FLOOR + 2.18f, zc - 1.0f}, T_WHITE, zc < 0 ? rgb(1.f, 0.86f, 0.9f) : rgb(0.86f, 0.94f, 1.f));
        mb.gloss = 0;
    }
    // right-hand doors stay closed: their leaves are part of the body
    for (int d = 0; d < 4; d++) {
        doorLeaf(mb, gl, 1.f, DOOR_Z[d] - DOOR_HALF / 2);
        doorLeaf(mb, gl, 1.f, DOOR_Z[d] + DOOR_HALF / 2);
    }
    endWall(mb, -HALF_LEN, 1.f);
    endWall(mb, HALF_LEN, -1.f);
    // boards on the front end wall: information (right) and notice (left)
    float zb = -HALF_LEN + 0.075f;
    mb.gloss = UNLIT;
    mb.quad({0.52f, FLOOR + 0.95f, zb}, {1.38f, FLOOR + 0.95f, zb}, {1.38f, FLOOR + 1.85f, zb}, {0.52f, FLOOR + 1.85f, zb},
            T_WHITE, gray(0.04f));
    mb.quad({-1.38f, FLOOR + 0.95f, zb}, {-0.52f, FLOOR + 0.95f, zb}, {-0.52f, FLOOR + 1.85f, zb},
            {-1.38f, FLOOR + 1.85f, zb}, T_WHITE, gray(0.97f));
    mb.gloss = 0;
    // emergency equipment on the rear end wall
    mb.gloss = 0.4f;
    mb.box({0.95f, FLOOR + 0.9f, HALF_LEN - 0.16f}, {1.2f, FLOOR + 1.45f, HALF_LEN - 0.07f}, T_WHITE, rgb(0.8f, 0.1f, 0.1f));
    mb.box({-1.25f, FLOOR + 1.2f, HALF_LEN - 0.12f}, {-0.9f, FLOOR + 1.6f, HALF_LEN - 0.07f}, T_WHITE, rgb(0.9f, 0.75f, 0.1f));
    mb.gloss = 0;
}

void buildGangway(MB& mb) {
    float g = 0.45f, z0 = HALF_LEN, z1 = PITCH - HALF_LEN;
    mb.quad({-g, FLOOR, z0}, {g, FLOOR, z0}, {g, FLOOR, z1}, {-g, FLOOR, z1}, T_METAL, gray(0.45f), 0.3f);
    mb.quad({-g, FLOOR + 1.95f, z0}, {g, FLOOR + 1.95f, z0}, {g, FLOOR + 1.95f, z1}, {-g, FLOOR + 1.95f, z1}, T_WHITE,
            gray(0.3f));
    // bellows: folded sides, inside and outside
    for (float sx : {-1.f, 1.f}) {
        int folds = 5;
        for (int k = 0; k < folds; k++) {
            float a = z0 + (z1 - z0) * k / folds, b = z0 + (z1 - z0) * (k + 0.5f) / folds, c = z0 + (z1 - z0) * (k + 1) / folds;
            for (float x : {g, 1.3f}) {
                float xa = sx * x, xb = sx * (x + 0.05f);
                mb.quad({xa, FLOOR - 0.5f * (x > 1 ? 1 : 0), a}, {xb, FLOOR - 0.5f * (x > 1 ? 1 : 0), b}, {xb, FLOOR + 1.95f + (x > 1 ? 0.5f : 0), b},
                        {xa, FLOOR + 1.95f + (x > 1 ? 0.5f : 0), a}, T_WHITE, gray(0.22f));
                mb.quad({xb, FLOOR - 0.5f * (x > 1 ? 1 : 0), b}, {xa, FLOOR - 0.5f * (x > 1 ? 1 : 0), c}, {xa, FLOOR + 1.95f + (x > 1 ? 0.5f : 0), c},
                        {xb, FLOOR + 1.95f + (x > 1 ? 0.5f : 0), b}, T_WHITE, gray(0.16f));
            }
        }
    }
    mb.quad({-1.3f, FLOOR + 2.45f, z0}, {1.3f, FLOOR + 2.45f, z0}, {1.3f, FLOOR + 2.45f, z1}, {-1.3f, FLOOR + 2.45f, z1},
            T_WHITE, gray(0.18f));
}

void buildCab(MB& mb, MB& gl) {
    float zr = -HALF_LEN, zf = -CAB_FRONT, top = FLOOR + CEIL;
    mb.gloss = 0.15f;
    mb.quad({-HALF_IN, FLOOR, zf}, {HALF_IN, FLOOR, zf}, {HALF_IN, FLOOR, zr}, {-HALF_IN, FLOOR, zr}, T_CARFLOOR,
            gray(0.4f), 0.6f);
    mb.gloss = 0;
    mb.quad({-HALF_IN, top, zf}, {HALF_IN, top, zf}, {HALF_IN, top, zr}, {-HALF_IN, top, zr}, T_WHITE, gray(0.6f));
    mb.gloss = 0.3f;
    mb.quad({-1.1f, top + 0.4f, zf}, {1.1f, top + 0.4f, zf}, {1.1f, top + 0.4f, zr}, {-1.1f, top + 0.4f, zr}, T_METAL,
            gray(0.62f));
    mb.gloss = 0;
    mb.box({-1.4f, 0.3f, zf + 0.1f}, {1.4f, FLOOR - 0.02f, zr}, T_WHITE, gray(0.1f));
    std::vector<Open> side = {{-11.25f, -10.2f, FLOOR + 0.95f, FLOOR + 1.85f}};
    sideWall(mb, gl, -1.f, zf, zr, side);
    sideWall(mb, gl, 1.f, zf, zr, side);
    // front: inside face, then the outer skin just ahead of it
    float wy0 = FLOOR + 0.94f, wy1 = FLOOR + 2.02f, wx = 1.32f;
    for (int outer = 0; outer <= 1; outer++) {
        float z = zf - outer * 0.02f;
        Col lower = outer ? NAVY : gray(0.3f), upper = outer ? gray(0.07f) : gray(0.3f), post = outer ? EXTERIOR : gray(0.3f);
        mb.gloss = outer ? 0.45f : 0.1f;
        if (outer) {
            mb.quad({-HALF_OUT, 0.3f, z}, {HALF_OUT, 0.3f, z}, {HALF_OUT, FLOOR + 0.3f, z}, {-HALF_OUT, FLOOR + 0.3f, z}, T_WHITE,
                    gray(0.14f));
            mb.quad({-HALF_OUT, FLOOR + 0.3f, z}, {HALF_OUT, FLOOR + 0.3f, z}, {HALF_OUT, wy0, z}, {-HALF_OUT, wy0, z}, T_METAL,
                    lower, 0.5f);
        } else {
            mb.quad({-HALF_OUT, FLOOR, z}, {HALF_OUT, FLOOR, z}, {HALF_OUT, wy0, z}, {-HALF_OUT, wy0, z}, T_WHITE, lower);
        }
        mb.quad({-HALF_OUT, wy1, z}, {HALF_OUT, wy1, z}, {HALF_OUT, top + (outer ? 0.4f : 0), z},
                {-HALF_OUT, top + (outer ? 0.4f : 0), z}, T_WHITE, upper);
        mb.quad({-HALF_OUT, wy0, z}, {-wx, wy0, z}, {-wx, wy1, z}, {-HALF_OUT, wy1, z}, T_METAL, post, 0.5f);
        mb.quad({wx, wy0, z}, {HALF_OUT, wy0, z}, {HALF_OUT, wy1, z}, {wx, wy1, z}, T_METAL, post, 0.5f);
        mb.gloss = 0;
    }
    gl.quad({-wx, wy0, zf - 0.01f}, {wx, wy0, zf - 0.01f}, {wx, wy1, zf - 0.01f}, {-wx, wy1, zf - 0.01f}, T_WHITE,
            {150, 190, 200, 30});
    // lamp housings and coupler
    for (float x : {-1.02f, 1.02f})
        mb.quad({x - 0.26f, FLOOR + 0.38f, zf - 0.025f}, {x + 0.26f, FLOOR + 0.38f, zf - 0.025f},
                {x + 0.26f, FLOOR + 0.74f, zf - 0.025f}, {x - 0.26f, FLOOR + 0.74f, zf - 0.025f}, T_WHITE, gray(0.05f));
    mb.gloss = 0.4f;
    mb.box({-0.22f, 0.55f, zf - 0.45f}, {0.22f, 0.9f, zf}, T_METAL, gray(0.3f));
    mb.gloss = 0;
    // driver's desk
    mb.gloss = 0.3f;
    mb.box({-HALF_IN, FLOOR, zf + 0.02f}, {HALF_IN, FLOOR + 0.82f, zf + 0.55f}, T_METAL, gray(0.3f));
    mb.gloss = 0;
    mb.quad({-HALF_IN, FLOOR + 0.82f, zf + 0.55f}, {HALF_IN, FLOOR + 0.82f, zf + 0.55f}, {HALF_IN, FLOOR + 0.97f, zf + 0.2f},
            {-HALF_IN, FLOOR + 0.97f, zf + 0.2f}, T_WHITE, gray(0.16f));
    // instrument panel (text is drawn on it every frame)
    mb.gloss = UNLIT;
    mb.quad({-1.2f, FLOOR + 0.845f, zf + 0.53f}, {-0.3f, FLOOR + 0.845f, zf + 0.53f}, {-0.3f, FLOOR + 0.96f, zf + 0.26f},
            {-1.2f, FLOOR + 0.96f, zf + 0.26f}, T_WHITE, gray(0.02f));
    // rows of indicator lamps and switches
    for (int k = 0; k < 8; k++) {
        float x = -0.15f + k * 0.11f;
        Col c = k % 3 == 0 ? rgb(0.2f, 0.9f, 0.3f) : k % 3 == 1 ? rgb(0.95f, 0.7f, 0.1f) : rgb(0.85f, 0.15f, 0.1f);
        mb.quad({x, FLOOR + 0.90f, zf + 0.40f}, {x + 0.05f, FLOOR + 0.90f, zf + 0.40f}, {x + 0.05f, FLOOR + 0.922f, zf + 0.35f},
                {x, FLOOR + 0.922f, zf + 0.35f}, T_WHITE, c);
    }
    mb.gloss = 0.5f;
    // master controller, brake handle and seat
    mb.box({0.95f, FLOOR + 0.82f, zf + 0.3f}, {1.03f, FLOOR + 1.02f, zf + 0.38f}, T_METAL, gray(0.75f));
    mb.box({0.9f, FLOOR + 1.0f, zf + 0.26f}, {1.08f, FLOOR + 1.05f, zf + 0.42f}, T_WHITE, gray(0.08f));
    mb.box({-0.22f, FLOOR + 0.84f, zf + 0.42f}, {-0.18f, FLOOR + 0.98f, zf + 0.46f}, T_METAL, gray(0.75f));
    mb.gloss = 0;
    mb.box({-0.95f, FLOOR + 0.42f, zf + 0.85f}, {-0.45f, FLOOR + 0.5f, zf + 1.3f}, T_SEAT, gray(0.25f), 0.5f);
    mb.box({-0.95f, FLOOR + 0.5f, zf + 1.25f}, {-0.45f, FLOOR + 1.0f, zf + 1.3f}, T_SEAT, gray(0.25f), 0.5f);
    mb.box({-0.75f, FLOOR, zf + 1.0f}, {-0.65f, FLOOR + 0.42f, zf + 1.1f}, T_METAL, gray(0.4f));
}

void buildLamps(MB& head, MB& tail) {
    float z = -CAB_FRONT - 0.03f;
    head.gloss = tail.gloss = UNLIT;
    for (float x : {-1.02f, 1.02f}) {
        head.quad({x - 0.2f, FLOOR + 0.52f, z}, {x + 0.2f, FLOOR + 0.52f, z}, {x + 0.2f, FLOOR + 0.7f, z},
                  {x - 0.2f, FLOOR + 0.7f, z}, T_WHITE, rgb(1, 0.98f, 0.9f));
        tail.quad({x - 0.2f, FLOOR + 0.41f, z}, {x + 0.2f, FLOOR + 0.41f, z}, {x + 0.2f, FLOOR + 0.5f, z},
                  {x - 0.2f, FLOOR + 0.5f, z}, T_WHITE, rgb(1, 0.1f, 0.08f));
    }
}

void buildPanto(MB& mb) {
    // Single-arm pantograph on the roof, reaching the contact wire at 5.3 m.
    float base = FLOOR + CEIL + 0.4f, wire = 5.28f, z = -6.f;
    mb.gloss = 0.5f;
    Col c = gray(0.25f);
    mb.box({-0.6f, base, z - 0.9f}, {0.6f, base + 0.12f, z + 0.9f}, T_METAL, gray(0.4f));
    float mid = (base + wire) / 2 + 0.1f;
    // lower and upper arm as slanted bars
    auto bar = [&](float y0, float z0, float y1, float z1) {
        for (float x : {-0.03f, 0.03f})
            mb.quad({x, y0 - 0.03f, z0}, {x, y0 + 0.03f, z0}, {x, y1 + 0.03f, z1}, {x, y1 - 0.03f, z1}, T_METAL, c, 0.5f);
        mb.quad({-0.03f, y0 + 0.03f, z0}, {0.03f, y0 + 0.03f, z0}, {0.03f, y1 + 0.03f, z1}, {-0.03f, y1 + 0.03f, z1}, T_METAL, c,
                0.5f);
    };
    bar(base + 0.12f, z + 0.7f, mid, z - 0.6f);
    bar(mid, z - 0.6f, wire - 0.06f, z + 0.1f);
    mb.box({-0.85f, wire - 0.07f, z + 0.02f}, {0.85f, wire - 0.02f, z + 0.18f}, T_METAL, gray(0.3f));
    mb.gloss = 0;
}

void buildNotice(MB& tx) {
    // Controls, on the white board left of the front gangway.
    V3 r = {1, 0, 0}, u = {0, 1, 0};
    float z = -HALF_LEN + 0.085f, x = -1.33f, y = FLOOR + 1.755f;
    Col ink = gray(0.1f);
    addText(tx, "조작 방법", {x, y, z}, r, u, 0.066f, NAVY);
    const char* lines[] = {"왼쪽 스틱  걷기",         "오른쪽 스틱  방향 돌리기", "A  운전실 / 객실 (밖에서는 다시 타기)",
                           "B  배속 바꾸기",          "X  다음 역으로 건너뛰기",  "Y  자동 / 수동 운전",
                           "수동: 오른쪽 트리거 가속", "         왼쪽 트리거 제동",  "역에서 문이 열리면 걸어서",
                           "승강장으로 나갈 수 있습니다", "밖에 있는 동안 열차가 기다립니다"};
    y -= 0.09f;
    int k = 0;
    for (const char* l : lines) {
        addText(tx, l, {x, y, z}, r, u, 0.041f, k >= 8 ? NAVY : ink);
        y -= 0.066f;
        k++;
    }
    // Notices above the windows either side of the route map.
    for (float sx : {-1.f, 1.f}) {
        V3 right = {0, 0, sx}, up = {0, 1, 0};
        float xx = sx * (HALF_IN - 0.02f);
        addText(tx, "자리를 양보해 주세요", {xx, FLOOR + 2.03f, -4.8f}, right, up, 0.085f, rgb(0.75f, 0.2f, 0.4f), 1);
        addText(tx, "임산부 · 어르신 · 몸이 불편한 분", {xx, FLOOR + 1.93f, -4.8f}, right, up, 0.045f, gray(0.25f), 1);
        addText(tx, "문에 기대지 마세요", {xx, FLOOR + 2.03f, 4.8f}, right, up, 0.085f, NAVY, 1);
        addText(tx, "닫히는 문에 가방이 끼지 않게 주의하세요", {xx, FLOOR + 1.93f, 4.8f}, right, up, 0.045f, gray(0.25f), 1);
    }
}

void buildDest(MB& tx, const char* name) {
    // On the black band above the windscreen, read from in front of the train.
    V3 right = {-1, 0, 0}, up = {0, 1, 0};
    float z = -CAB_FRONT - 0.035f;
    addText(tx, name, {0.15f, FLOOR + 2.085f, z}, right, up, 0.15f, {255, 176, 32, 255}, 1);
    addRect(tx, {0.82f, FLOOR + 2.135f, z}, right, up, 0.17f, 0.17f, NAVY);
    addText(tx, "1", {0.82f, FLOOR + 2.085f, z}, right, up, 0.14f, gray(1), 1);
}

}  // namespace

void Meshes::init() {
    MB mb, gl;
    buildBody(mb, gl);
    body.upload(mb);
    bodyGlass.upload(gl);
    mb.clear();
    buildGangway(mb);
    gangway.upload(mb);
    mb.clear();
    gl.clear();
    for (int d = 0; d < 4; d++) doorLeaf(mb, gl, -1.f, DOOR_Z[d] - DOOR_HALF / 2);
    leafFront.upload(mb);
    leafFrontGlass.upload(gl);
    mb.clear();
    gl.clear();
    for (int d = 0; d < 4; d++) doorLeaf(mb, gl, -1.f, DOOR_Z[d] + DOOR_HALF / 2);
    leafRear.upload(mb);
    leafRearGlass.upload(gl);
    mb.clear();
    gl.clear();
    buildCab(mb, gl);
    cab.upload(mb);
    cabGlass.upload(gl);
    MB h, t;
    buildLamps(h, t);
    headLights.upload(h);
    tailLights.upload(t);
    mb.clear();
    buildPanto(mb);
    panto.upload(mb);
    mb.clear();
    buildNotice(mb);
    staticText.upload(mb);
    mb.clear();
    buildDest(mb, "광운대");
    destText[0].upload(mb);
    mb.clear();
    buildDest(mb, "서울역");
    destText[1].upload(mb);
}

void Meshes::destroy() {
    for (Mesh* m : {&body, &bodyGlass, &gangway, &leafFront, &leafFrontGlass, &leafRear, &leafRearGlass, &cab, &cabGlass,
                    &headLights, &tailLights, &panto, &staticText, &destText[0], &destText[1]})
        m->destroy();
}

}  // namespace train
