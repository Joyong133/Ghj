// Small float matrix helpers (column-major, OpenGL conventions).
#pragma once
#include <cmath>
#include <cstring>

struct V3 {
    float x, y, z;
};
inline V3 operator+(V3 a, V3 b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
inline V3 operator-(V3 a, V3 b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
inline V3 operator*(V3 a, float s) { return {a.x * s, a.y * s, a.z * s}; }

struct M4 {
    float m[16];
};

inline M4 m4Identity() {
    M4 r;
    memset(r.m, 0, sizeof(r.m));
    r.m[0] = r.m[5] = r.m[10] = r.m[15] = 1.f;
    return r;
}
inline M4 m4Mul(const M4& a, const M4& b) {
    M4 r;
    for (int c = 0; c < 4; c++)
        for (int row = 0; row < 4; row++) {
            float s = 0;
            for (int k = 0; k < 4; k++) s += a.m[k * 4 + row] * b.m[c * 4 + k];
            r.m[c * 4 + row] = s;
        }
    return r;
}
inline M4 m4Translate(float x, float y, float z) {
    M4 r = m4Identity();
    r.m[12] = x;
    r.m[13] = y;
    r.m[14] = z;
    return r;
}
// Rotation about +Y. Local forward (-Z) turns towards -X for positive angles.
inline M4 m4RotY(float a) {
    M4 r = m4Identity();
    float c = cosf(a), s = sinf(a);
    r.m[0] = c;
    r.m[2] = -s;
    r.m[8] = s;
    r.m[10] = c;
    return r;
}
inline M4 m4RotX(float a) {
    M4 r = m4Identity();
    float c = cosf(a), s = sinf(a);
    r.m[5] = c;
    r.m[6] = s;
    r.m[9] = -s;
    r.m[10] = c;
    return r;
}
// Inverse of a rigid transform (rotation + translation only).
inline M4 m4InvRigid(const M4& a) {
    M4 r = m4Identity();
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++) r.m[j * 4 + i] = a.m[i * 4 + j];
    for (int i = 0; i < 3; i++)
        r.m[12 + i] = -(r.m[i] * a.m[12] + r.m[4 + i] * a.m[13] + r.m[8 + i] * a.m[14]);
    return r;
}
inline V3 m4Point(const M4& a, V3 p) {
    return {a.m[0] * p.x + a.m[4] * p.y + a.m[8] * p.z + a.m[12],
            a.m[1] * p.x + a.m[5] * p.y + a.m[9] * p.z + a.m[13],
            a.m[2] * p.x + a.m[6] * p.y + a.m[10] * p.z + a.m[14]};
}
inline V3 m4Dir(const M4& a, V3 p) {
    return {a.m[0] * p.x + a.m[4] * p.y + a.m[8] * p.z, a.m[1] * p.x + a.m[5] * p.y + a.m[9] * p.z,
            a.m[2] * p.x + a.m[6] * p.y + a.m[10] * p.z};
}
// Asymmetric projection from the tangents of the half angles (left/down are negative).
inline M4 m4Proj(float tanL, float tanR, float tanU, float tanD, float n, float f) {
    M4 r;
    memset(r.m, 0, sizeof(r.m));
    float w = tanR - tanL, h = tanU - tanD;
    r.m[0] = 2.f / w;
    r.m[5] = 2.f / h;
    r.m[8] = (tanR + tanL) / w;
    r.m[9] = (tanU + tanD) / h;
    r.m[10] = -(f + n) / (f - n);
    r.m[11] = -1.f;
    r.m[14] = -(2.f * f * n) / (f - n);
    return r;
}
