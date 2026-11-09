#include "train.h"

#include <cmath>
#include <vector>

namespace train {

namespace {

const Col INTERIOR = {226, 226, 218, 255};
const Col EXTERIOR = {186, 190, 196, 255};
const Col NAVY = {20, 52, 120, 255};
const Col DARK = {40, 42, 46, 255};

struct Open {
    float z0, z1, y0, y1;
};

// Side wall with rectangular openings. `sx` is -1 (left) or +1 (right).
void sideWall(MB& mb, float sx, float zFrom, float zTo, const std::vector<Open>& opens) {
    float xi = sx * HALF_IN, xo = sx * HALF_OUT;
    float top = FLOOR + CEIL;
    auto panel = [&](float z0, float z1, float y0, float y1) {
        if (z1 - z0 < 1e-4f || y1 - y0 < 1e-4f) return;
        mb.quad({xi, y0, z0}, {xi, y0, z1}, {xi, y1, z1}, {xi, y1, z0}, T_WHITE, INTERIOR);
        // Exterior: stainless steel with the navy band of Line 1 below the windows.
        float band0 = FLOOR + 0.55f, band1 = FLOOR + 0.85f;
        auto ext = [&](float a, float b, Col c) {
            if (b - a < 1e-4f) return;
            mb.quad({xo, a, z0}, {xo, a, z1}, {xo, b, z1}, {xo, b, z0}, T_METAL, c, 0.5f);
        };
        float a = y0, b = y1;
        ext(a, b < band0 ? b : band0, EXTERIOR);
        ext(a > band0 ? a : band0, b < band1 ? b : band1, NAVY);
        ext(a > band1 ? a : band1, b, EXTERIOR);
    };
    float z = zFrom;
    for (const Open& o : opens) {
        panel(z, o.z0, FLOOR, top);
        panel(o.z0, o.z1, FLOOR, o.y0);
        panel(o.z0, o.z1, o.y1, top);
        // reveals
        Col rv = scale(INTERIOR, 0.75f);
        mb.quad({xi, o.y0, o.z0}, {xo, o.y0, o.z0}, {xo, o.y1, o.z0}, {xi, o.y1, o.z0}, T_WHITE, rv);
        mb.quad({xi, o.y0, o.z1}, {xo, o.y0, o.z1}, {xo, o.y1, o.z1}, {xi, o.y1, o.z1}, T_WHITE, rv);
        mb.quad({xi, o.y1, o.z0}, {xo, o.y1, o.z0}, {xo, o.y1, o.z1}, {xi, o.y1, o.z1}, T_WHITE, rv);
        if (o.y0 > FLOOR + 0.01f)
            mb.quad({xi, o.y0, o.z0}, {xo, o.y0, o.z0}, {xo, o.y0, o.z1}, {xi, o.y0, o.z1}, T_WHITE, rv);
        z = o.z1;
    }
    panel(z, zTo, FLOOR, top);
    // skirt below the floor and the roof edge
    mb.quad({xo, 0.25f, zFrom}, {xo, 0.25f, zTo}, {xo, FLOOR, zTo}, {xo, FLOOR, zFrom}, T_WHITE, gray(0.2f));
    mb.quad({xo, top, zFrom}, {xo, top, zTo}, {sx * 1.1f, top + 0.4f, zTo}, {sx * 1.1f, top + 0.4f, zFrom}, T_METAL,
            EXTERIOR, 0.5f);
}

// One sliding door leaf with a window, centred on zc, in the wall plane.
void doorLeaf(MB& mb, float sx, float zc) {
    float x = sx * (HALF_IN + 0.05f), h = DOOR_HALF / 2;
    float z0 = zc - h, z1 = zc + h, y0 = FLOOR, y1 = FLOOR + DOOR_H;
    float wz0 = z0 + 0.09f, wz1 = z1 - 0.09f, wy0 = FLOOR + 0.95f, wy1 = FLOOR + 1.7f;
    Col c = rgb(0.80f, 0.82f, 0.84f);
    auto q = [&](float a0, float a1, float b0, float b1) {
        mb.quad({x, b0, a0}, {x, b0, a1}, {x, b1, a1}, {x, b1, a0}, T_METAL, c, 0.5f);
    };
    q(z0, z1, y0, wy0);
    q(z0, z1, wy1, y1);
    q(z0, wz0, wy0, wy1);
    q(wz1, z1, wy0, wy1);
    // rubber edge
    mb.quad({x - 0.012f * sx, y0, z0}, {x - 0.012f * sx, y0, z0 + 0.03f}, {x - 0.012f * sx, y1, z0 + 0.03f},
            {x - 0.012f * sx, y1, z0}, T_WHITE, gray(0.1f));
    mb.quad({x - 0.012f * sx, y0, z1 - 0.03f}, {x - 0.012f * sx, y0, z1}, {x - 0.012f * sx, y1, z1},
            {x - 0.012f * sx, y1, z1 - 0.03f}, T_WHITE, gray(0.1f));
}

void endWall(MB& mb, float z, float faceDir) {
    // Wall across the car with the gangway opening (|x| < 0.45, 1.95 m high).
    float top = FLOOR + CEIL, gy = FLOOR + 1.95f, g = 0.45f;
    Col c = scale(INTERIOR, 0.94f);
    for (float dz : {0.f, 0.06f * faceDir}) {
        float zz = z + dz;
        mb.quad({-HALF_IN, FLOOR, zz}, {-g, FLOOR, zz}, {-g, top, zz}, {-HALF_IN, top, zz}, T_WHITE, c);
        mb.quad({g, FLOOR, zz}, {HALF_IN, FLOOR, zz}, {HALF_IN, top, zz}, {g, top, zz}, T_WHITE, c);
        mb.quad({-g, gy, zz}, {g, gy, zz}, {g, top, zz}, {-g, top, zz}, T_WHITE, c);
    }
}

void bench(MB& mb, float sx, float z0, float z1) {
    Col seat = rgb(0.22f, 0.36f, 0.72f), frame = gray(0.75f);
    float xw = sx * HALF_IN, xf = sx * (HALF_IN - 0.5f);
    float lo = xw < xf ? xw : xf, hi = xw < xf ? xf : xw;
    mb.box({lo, FLOOR + 0.33f, z0}, {hi, FLOOR + 0.44f, z1}, T_SEAT, seat, 0.5f);
    float bx0 = sx > 0 ? xw - 0.09f : xw, bx1 = sx > 0 ? xw : xw + 0.09f;
    mb.box({bx0, FLOOR + 0.44f, z0}, {bx1, FLOOR + 0.92f, z1}, T_SEAT, seat, 0.5f);
    // heater box under the seat
    float hx0 = sx > 0 ? xw - 0.3f : xw, hx1 = sx > 0 ? xw : xw + 0.3f;
    mb.box({hx0, FLOOR, z0 + 0.05f}, {hx1, FLOOR + 0.33f, z1 - 0.05f}, T_METAL, gray(0.55f));
    // end partitions and grab poles
    for (float z : {z0, z1}) {
        if (fabsf(z) > 9.5f) continue;  // against the end wall
        mb.box({lo, FLOOR, z - 0.015f}, {hi, FLOOR + 1.15f, z + 0.015f}, T_WHITE, frame);
        mb.box({xf - 0.018f, FLOOR, z - 0.018f}, {xf + 0.018f, FLOOR + CEIL, z + 0.018f}, T_METAL, gray(0.85f));
    }
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

void buildBody(MB& mb) {
    float top = FLOOR + CEIL;
    // floor, ceiling, ceiling lights
    mb.quad({-HALF_IN, FLOOR, -HALF_LEN}, {HALF_IN, FLOOR, -HALF_LEN}, {HALF_IN, FLOOR, HALF_LEN},
            {-HALF_IN, FLOOR, HALF_LEN}, T_CARFLOOR, rgb(0.62f, 0.64f, 0.68f), 0.6f);
    mb.quad({-HALF_IN, top, -HALF_LEN}, {HALF_IN, top, -HALF_LEN}, {HALF_IN, top, HALF_LEN}, {-HALF_IN, top, HALF_LEN},
            T_WHITE, gray(0.86f));
    for (float x : {-0.55f, 0.55f})
        for (float z = -9.f; z < 8.5f; z += 2.4f)
            mb.quad({x - 0.09f, top - 0.02f, z}, {x + 0.09f, top - 0.02f, z}, {x + 0.09f, top - 0.02f, z + 1.6f},
                    {x - 0.09f, top - 0.02f, z + 1.6f}, T_WHITE, gray(1));
    // roof and underframe (seen from neighbouring cars on curves)
    mb.quad({-1.1f, top + 0.4f, -HALF_LEN}, {1.1f, top + 0.4f, -HALF_LEN}, {1.1f, top + 0.4f, HALF_LEN},
            {-1.1f, top + 0.4f, HALF_LEN}, T_METAL, gray(0.6f));
    std::vector<Open> opens = carOpenings();
    for (float sx : {-1.f, 1.f}) {
        sideWall(mb, sx, -HALF_LEN, HALF_LEN, opens);
        bench(mb, sx, -6.35f, -3.25f);
        bench(mb, sx, -1.55f, 1.55f);
        bench(mb, sx, 3.25f, 6.35f);
        bench(mb, sx, -9.6f, -8.05f);
        bench(mb, sx, 8.05f, 9.6f);
        // handrail along the car
        mb.box({sx * 0.78f - 0.015f, FLOOR + 1.9f, -9.5f}, {sx * 0.78f + 0.015f, FLOOR + 1.93f, 9.5f}, T_METAL,
               gray(0.9f));
        // door headers: passenger information displays
        for (int d = 0; d < 4; d++) {
            float x = sx * (HALF_IN - 0.012f);
            mb.quad({x, FLOOR + 1.95f, DOOR_Z[d] - 0.55f}, {x, FLOOR + 1.95f, DOOR_Z[d] + 0.55f},
                    {x, FLOOR + 2.2f, DOOR_Z[d] + 0.55f}, {x, FLOOR + 2.2f, DOOR_Z[d] - 0.55f}, T_WHITE, gray(0.03f));
        }
        // route map board above the middle window
        float x = sx * (HALF_IN - 0.012f);
        mb.quad({x, FLOOR + 1.86f, -1.05f}, {x, FLOOR + 1.86f, 1.05f}, {x, FLOOR + 2.2f, 1.05f}, {x, FLOOR + 2.2f, -1.05f},
                T_WHITE, gray(0.98f));
    }
    // right-hand doors stay closed: bake their leaves into the body
    for (int d = 0; d < 4; d++) {
        doorLeaf(mb, 1.f, DOOR_Z[d] - DOOR_HALF / 2);
        doorLeaf(mb, 1.f, DOOR_Z[d] + DOOR_HALF / 2);
    }
    endWall(mb, -HALF_LEN, 1.f);
    endWall(mb, HALF_LEN, -1.f);
    // boards on the front end wall: information (right) and notice (left)
    float zb = -HALF_LEN + 0.075f;
    mb.quad({0.52f, FLOOR + 0.95f, zb}, {1.38f, FLOOR + 0.95f, zb}, {1.38f, FLOOR + 1.85f, zb}, {0.52f, FLOOR + 1.85f, zb},
            T_WHITE, gray(0.04f));
    mb.quad({-1.38f, FLOOR + 0.95f, zb}, {-0.52f, FLOOR + 0.95f, zb}, {-0.52f, FLOOR + 1.85f, zb},
            {-1.38f, FLOOR + 1.85f, zb}, T_WHITE, gray(0.97f));
    // gangway to the next car
    float g = 0.45f, z0 = HALF_LEN, z1 = PITCH - HALF_LEN;
    mb.quad({-g, FLOOR, z0}, {g, FLOOR, z0}, {g, FLOOR, z1}, {-g, FLOOR, z1}, T_CARFLOOR, gray(0.4f));
    mb.quad({-g, FLOOR + 1.95f, z0}, {g, FLOOR + 1.95f, z0}, {g, FLOOR + 1.95f, z1}, {-g, FLOOR + 1.95f, z1}, T_WHITE,
            gray(0.25f));
    for (float x : {-g, g})
        mb.quad({x, FLOOR, z0}, {x, FLOOR, z1}, {x, FLOOR + 1.95f, z1}, {x, FLOOR + 1.95f, z0}, T_WHITE, gray(0.3f));
}

void buildCab(MB& mb) {
    float zr = -HALF_LEN, zf = -CAB_FRONT, top = FLOOR + CEIL;
    mb.quad({-HALF_IN, FLOOR, zf}, {HALF_IN, FLOOR, zf}, {HALF_IN, FLOOR, zr}, {-HALF_IN, FLOOR, zr}, T_CARFLOOR,
            gray(0.38f), 0.6f);
    mb.quad({-HALF_IN, top, zf}, {HALF_IN, top, zf}, {HALF_IN, top, zr}, {-HALF_IN, top, zr}, T_WHITE, gray(0.55f));
    std::vector<Open> side = {{-11.25f, -10.2f, FLOOR + 0.95f, FLOOR + 1.85f}};
    sideWall(mb, -1.f, zf, zr, side);
    sideWall(mb, 1.f, zf, zr, side);
    // front wall around the windscreen
    float wy0 = FLOOR + 0.98f, wy1 = FLOOR + 2.0f, wx = 1.3f;
    Col c = gray(0.5f);
    mb.quad({-HALF_OUT, 0.25f, zf}, {HALF_OUT, 0.25f, zf}, {HALF_OUT, wy0, zf}, {-HALF_OUT, wy0, zf}, T_WHITE, c);
    mb.quad({-HALF_OUT, wy1, zf}, {HALF_OUT, wy1, zf}, {HALF_OUT, top, zf}, {-HALF_OUT, top, zf}, T_WHITE, c);
    mb.quad({-HALF_OUT, wy0, zf}, {-wx, wy0, zf}, {-wx, wy1, zf}, {-HALF_OUT, wy1, zf}, T_WHITE, c);
    mb.quad({wx, wy0, zf}, {HALF_OUT, wy0, zf}, {HALF_OUT, wy1, zf}, {wx, wy1, zf}, T_WHITE, c);
    // driver's desk
    mb.box({-HALF_IN, FLOOR, zf + 0.02f}, {HALF_IN, FLOOR + 0.82f, zf + 0.55f}, T_METAL, gray(0.3f));
    mb.quad({-HALF_IN, FLOOR + 0.82f, zf + 0.55f}, {HALF_IN, FLOOR + 0.82f, zf + 0.55f}, {HALF_IN, FLOOR + 0.97f, zf + 0.2f},
            {-HALF_IN, FLOOR + 0.97f, zf + 0.2f}, T_WHITE, gray(0.16f));
    // instrument panel (text is drawn on it every frame)
    mb.quad({-1.2f, FLOOR + 0.845f, zf + 0.53f}, {-0.3f, FLOOR + 0.845f, zf + 0.53f}, {-0.3f, FLOOR + 0.96f, zf + 0.26f},
            {-1.2f, FLOOR + 0.96f, zf + 0.26f}, T_WHITE, gray(0.02f));
    // master controller and seat
    mb.box({0.35f, FLOOR + 0.82f, zf + 0.3f}, {0.43f, FLOOR + 1.0f, zf + 0.38f}, T_METAL, gray(0.7f));
    mb.box({-0.95f, FLOOR + 0.42f, zf + 0.85f}, {-0.45f, FLOOR + 0.5f, zf + 1.3f}, T_SEAT, gray(0.25f), 0.5f);
    mb.box({-0.75f, FLOOR, zf + 1.0f}, {-0.65f, FLOOR + 0.42f, zf + 1.1f}, T_METAL, gray(0.4f));
}

void buildRearCap(MB& mb) {
    float z = HALF_LEN + 0.01f, g = 0.45f;
    mb.quad({-g, FLOOR, z}, {g, FLOOR, z}, {g, FLOOR + 1.95f, z}, {-g, FLOOR + 1.95f, z}, T_METAL, gray(0.72f), 0.5f);
    mb.box({-0.3f, FLOOR + 1.0f, z - 0.015f}, {0.3f, FLOOR + 1.6f, z - 0.005f}, T_WHITE, gray(0.12f));
}

void buildNotice(MB& tx) {
    // Controls, on the white board left of the front gangway.
    V3 r = {1, 0, 0}, u = {0, 1, 0};
    float z = -HALF_LEN + 0.085f, x = -1.33f, y = FLOOR + 1.74f;
    Col ink = gray(0.1f);
    addText(tx, "조작 방법", {x, y, z}, r, u, 0.075f, {20, 52, 120, 255});
    const char* lines[] = {"왼쪽 스틱  걷기",        "오른쪽 스틱  방향 돌리기", "A  운전실 / 객실 이동",
                           "B  배속 바꾸기",         "X  다음 역으로 건너뛰기",  "Y  자동 / 수동 운전",
                           "수동 운전 중:",          "  오른쪽 트리거  가속",    "  왼쪽 트리거  제동"};
    y -= 0.105f;
    for (const char* l : lines) {
        addText(tx, l, {x, y, z}, r, u, 0.05f, ink);
        y -= 0.074f;
    }
}

}  // namespace

void Meshes::init() {
    MB mb;
    buildBody(mb);
    body.upload(mb);
    mb.clear();
    for (int d = 0; d < 4; d++) doorLeaf(mb, -1.f, DOOR_Z[d] - DOOR_HALF / 2);
    leafFront.upload(mb);
    mb.clear();
    for (int d = 0; d < 4; d++) doorLeaf(mb, -1.f, DOOR_Z[d] + DOOR_HALF / 2);
    leafRear.upload(mb);
    mb.clear();
    buildCab(mb);
    cab.upload(mb);
    mb.clear();
    buildRearCap(mb);
    rearCap.upload(mb);
    mb.clear();
    buildNotice(mb);
    staticText.upload(mb);
}

void Meshes::destroy() {
    body.destroy();
    leafFront.destroy();
    leafRear.destroy();
    cab.destroy();
    rearCap.destroy();
    staticText.destroy();
}

}  // namespace train
