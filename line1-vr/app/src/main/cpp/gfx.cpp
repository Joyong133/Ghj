#include "gfx.h"

#include <cmath>
#include <cstdlib>
#include <cstring>
#include <string>

#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#include "font_data.h"
#include "stb_image.h"

Gfx gfx;

static uint8_t toByte(float v) {
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    return (uint8_t)(v * 255.f + 0.5f);
}
Col rgb(float r, float g, float b, float a) { return {toByte(r), toByte(g), toByte(b), toByte(a)}; }
Col scale(Col c, float f) { return rgb(c.r / 255.f * f, c.g / 255.f * f, c.b / 255.f * f, c.a / 255.f); }

static int8_t toS8(float v) {
    if (v < -1) v = -1;
    if (v > 1) v = 1;
    return (int8_t)lrintf(v * 127.f);
}

void MB::quad(V3 a, V3 b, V3 c, V3 d, float u0, float v0, float u1, float v1, float layer, Col ca, Col cb, Col cc,
              Col cd) {
    // Face normal; the shader turns it towards the viewer, so winding does not matter.
    V3 e1 = b - a, e2 = d - a;
    if (e1.x * e1.x + e1.y * e1.y + e1.z * e1.z < 1e-10f) e1 = c - a;
    V3 n = {e1.y * e2.z - e1.z * e2.y, e1.z * e2.x - e1.x * e2.z, e1.x * e2.y - e1.y * e2.x};
    float l = sqrtf(n.x * n.x + n.y * n.y + n.z * n.z);
    if (l < 1e-12f)
        n = {0, 1, 0};
    else
        n = n * (1.f / l);
    int8_t nx = toS8(n.x), ny = toS8(n.y), nz = toS8(n.z), g = toS8(gloss);
    uint32_t k = (uint32_t)v.size();
    v.push_back({a.x, a.y, a.z, u0, v0, layer, ca, nx, ny, nz, g});
    v.push_back({b.x, b.y, b.z, u1, v0, layer, cb, nx, ny, nz, g});
    v.push_back({c.x, c.y, c.z, u1, v1, layer, cc, nx, ny, nz, g});
    v.push_back({d.x, d.y, d.z, u0, v1, layer, cd, nx, ny, nz, g});
    i.insert(i.end(), {k, k + 1, k + 2, k, k + 2, k + 3});
}

static float dist(V3 a, V3 b) {
    V3 d = a - b;
    return sqrtf(d.x * d.x + d.y * d.y + d.z * d.z);
}

void MB::quad(V3 a, V3 b, V3 c, V3 d, float layer, Col col, float uvScale) {
    float w = dist(a, b) / uvScale, h = dist(b, c) / uvScale;
    quad(a, b, c, d, 0, 0, w, h, layer, col, col, col, col);
}

void MB::box(V3 mn, V3 mx, float layer, Col col, float uvScale) {
    quad({mn.x, mx.y, mn.z}, {mx.x, mx.y, mn.z}, {mx.x, mx.y, mx.z}, {mn.x, mx.y, mx.z}, layer, col, uvScale);
    quad({mn.x, mn.y, mn.z}, {mx.x, mn.y, mn.z}, {mx.x, mn.y, mx.z}, {mn.x, mn.y, mx.z}, layer, col, uvScale);
    quad({mn.x, mn.y, mn.z}, {mn.x, mn.y, mx.z}, {mn.x, mx.y, mx.z}, {mn.x, mx.y, mn.z}, layer, col, uvScale);
    quad({mx.x, mn.y, mn.z}, {mx.x, mn.y, mx.z}, {mx.x, mx.y, mx.z}, {mx.x, mx.y, mn.z}, layer, col, uvScale);
    quad({mn.x, mn.y, mn.z}, {mx.x, mn.y, mn.z}, {mx.x, mx.y, mn.z}, {mn.x, mx.y, mn.z}, layer, col, uvScale);
    quad({mn.x, mn.y, mx.z}, {mx.x, mn.y, mx.z}, {mx.x, mx.y, mx.z}, {mn.x, mx.y, mx.z}, layer, col, uvScale);
}

void MB::obox(V3 c, V3 r, V3 f, float hx, float y0, float y1, float hz, float layer, Col col, float uvScale) {
    auto P = [&](float sx, float y, float sz) {
        return V3{c.x + r.x * hx * sx + f.x * hz * sz, y, c.z + r.z * hx * sx + f.z * hz * sz};
    };
    quad(P(-1, y1, -1), P(1, y1, -1), P(1, y1, 1), P(-1, y1, 1), layer, col, uvScale);
    quad(P(-1, y0, -1), P(1, y0, -1), P(1, y0, 1), P(-1, y0, 1), layer, col, uvScale);
    quad(P(-1, y0, -1), P(1, y0, -1), P(1, y1, -1), P(-1, y1, -1), layer, col, uvScale);
    quad(P(-1, y0, 1), P(1, y0, 1), P(1, y1, 1), P(-1, y1, 1), layer, col, uvScale);
    quad(P(-1, y0, -1), P(-1, y0, 1), P(-1, y1, 1), P(-1, y1, -1), layer, col, uvScale);
    quad(P(1, y0, -1), P(1, y0, 1), P(1, y1, 1), P(1, y1, -1), layer, col, uvScale);
}

void Mesh::upload(const MB& mb, bool dynamic) {
    if (!vao) {
        glGenVertexArrays(1, &vao);
        glGenBuffers(1, &vbo);
        glGenBuffers(1, &ibo);
        glBindVertexArray(vao);
        glBindBuffer(GL_ARRAY_BUFFER, vbo);
        glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ibo);
        glEnableVertexAttribArray(0);
        glEnableVertexAttribArray(1);
        glEnableVertexAttribArray(2);
        glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(Vtx), (void*)0);
        glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(Vtx), (void*)12);
        glVertexAttribPointer(2, 4, GL_UNSIGNED_BYTE, GL_TRUE, sizeof(Vtx), (void*)24);
        glEnableVertexAttribArray(3);
        glVertexAttribPointer(3, 4, GL_BYTE, GL_TRUE, sizeof(Vtx), (void*)28);
    }
    glBindVertexArray(vao);
    glBindBuffer(GL_ARRAY_BUFFER, vbo);
    GLenum usage = dynamic ? GL_DYNAMIC_DRAW : GL_STATIC_DRAW;
    glBufferData(GL_ARRAY_BUFFER, mb.v.size() * sizeof(Vtx), mb.v.data(), usage);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ibo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, mb.i.size() * sizeof(uint32_t), mb.i.data(), usage);
    count = (int)mb.i.size();
    glBindVertexArray(0);
}
void Mesh::draw() const {
    if (!count) return;
    glBindVertexArray(vao);
    glDrawElements(GL_TRIANGLES, count, GL_UNSIGNED_INT, 0);
}
void Mesh::destroy() {
    if (vao) {
        glDeleteVertexArrays(1, &vao);
        glDeleteBuffers(1, &vbo);
        glDeleteBuffers(1, &ibo);
    }
    vao = vbo = ibo = 0;
    count = 0;
}

// ---------------------------------------------------------------- shaders

static const char* kVS = R"(#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aUV;
layout(location=2) in vec4 aCol;
layout(location=3) in vec4 aNrm;
uniform mat4 uVP;
uniform mat4 uModel;
uniform vec3 uEye;
uniform float uFogK;
out vec3 vUV;
out vec4 vCol;
out vec3 vPos;
out vec3 vNrm;
out float vGloss;
out float vFog;
void main() {
    vec4 w = uModel * vec4(aPos, 1.0);
    vPos = w.xyz;
    vNrm = mat3(uModel) * aNrm.xyz;
    vGloss = aNrm.w;
    vFog = exp(-distance(w.xyz, uEye) * uFogK);
    vCol = aCol;
    vUV = aUV;
    gl_Position = uVP * w;
}
)";

static const char* kFSHead = R"(#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform vec3 uEye;
uniform vec3 uFogCol;
uniform float uGamma;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform vec3 uSpecCol;
uniform vec3 uSpecDir;
uniform vec3 uHeadPos;
uniform vec3 uHeadDir;
uniform float uHeadPow;
uniform float uTime;
in vec3 vUV;
in vec4 vCol;
in vec3 vPos;
in vec3 vNrm;
in float vGloss;
in float vFog;
out vec4 oCol;
)";

// Lit, textured surfaces. CUTOUT adds an alpha test (foliage).
static const char* kFSWorldBody = R"(
void main() {
    vec4 t = texture(uTex, vUV);
#ifdef CUTOUT
    if (t.a < 0.5) discard;
#endif
    vec3 n = normalize(vNrm);
    vec3 v = normalize(uEye - vPos);
    if (dot(n, v) < 0.0) n = -n;
    vec3 light = mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5) + uSun * max(dot(n, uSunDir), 0.0);
    // train headlight
    vec3 l = vPos - uHeadPos;
    float ld = max(length(l), 0.01);
    l /= ld;
    float spot = smoothstep(0.80, 0.985, dot(l, uHeadDir)) * uHeadPow / (1.0 + ld * ld * 0.0006);
    light += vec3(1.0, 0.95, 0.85) * spot * (0.35 + 0.65 * max(dot(n, -l), 0.0));
    float lit = step(-0.5, vGloss);
    light = mix(vec3(1.0), light, lit);
    vec3 c = t.rgb * vCol.rgb * light;
    float g = max(vGloss, 0.0);
    vec3 r = reflect(-v, n);
    c += uSpecCol * (pow(max(dot(r, uSpecDir), 0.0), 48.0) * g);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0) * g;
    c = mix(c, mix(uAmbGround, uAmbSky, r.y * 0.5 + 0.5), fres * 0.45);
    c = mix(uFogCol, c, vFog);
    oCol = vec4(pow(c, vec3(uGamma)), 1.0);
}
)";

// Glass: mostly transparent, reflective at grazing angles.
static const char* kFSGlassBody = R"(
void main() {
    vec3 n = normalize(vNrm);
    vec3 v = normalize(uEye - vPos);
    if (dot(n, v) < 0.0) n = -n;
    vec3 r = reflect(-v, n);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 env = mix(uAmbGround, uAmbSky, r.y * 0.5 + 0.5) * 0.7;
    vec3 c = mix(vCol.rgb * 0.35, env, fres);
    float sp = pow(max(dot(r, uSpecDir), 0.0), 64.0);
    c += uSpecCol * sp;
    float a = clamp(mix(vCol.a, 0.85, fres) + sp, 0.0, 1.0);
    c = mix(uFogCol, c, vFog);
    oCol = vec4(pow(c, vec3(uGamma)), a);
}
)";

static const char* kFSText = R"(#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec3 uFogCol;
uniform float uGamma;
in vec3 vUV;
in vec4 vCol;
in float vFog;
out vec4 oCol;
void main() {
    float a = texture(uTex, vUV.xy).r * vCol.a;
    vec3 c = mix(uFogCol, vCol.rgb, vFog);
    oCol = vec4(pow(c, vec3(uGamma)), a);
}
)";

// Sky dome: gradient, sun and a cloud layer. The dome is centred on the eye.
static const char* kFSSkyBody = R"(
void main() {
    vec3 d = normalize(vPos - uEye);
    float h = max(d.y, 0.0);
    vec3 horizon = uFogCol;
    vec3 zenith = vec3(0.20, 0.42, 0.80);
    vec3 c = mix(horizon, zenith, pow(h, 0.5));
    float s = max(dot(d, uSunDir), 0.0);
    c += vec3(1.0, 0.9, 0.7) * (pow(s, 1500.0) * 4.0 + pow(s, 24.0) * 0.25);
    vec2 uv = d.xz / (d.y + 0.15) * 0.22 + vec2(uTime * 0.0012, 0.0);
    float cl = texture(uTex, vec3(uv, vUV.z)).r;
    float cl2 = texture(uTex, vec3(uv * 2.7 + 0.37, vUV.z)).r;
    float cover = smoothstep(0.50, 0.78, cl * 0.7 + cl2 * 0.3) * smoothstep(0.02, 0.22, d.y);
    vec3 cloud = mix(vec3(0.78, 0.82, 0.88), vec3(1.0), smoothstep(0.55, 0.9, cl));
    c = mix(c, cloud, cover * 0.92);
    oCol = vec4(pow(c, vec3(uGamma)), 1.0);
}
)";

// Untextured colour, used for the fade overlay.
static const char* kFSFlat = R"(#version 300 es
precision highp float;
in vec4 vCol;
out vec4 oCol;
void main() { oCol = vCol; }
)";

static GLuint compile(GLenum type, const std::string& src) {
    GLuint s = glCreateShader(type);
    const char* p = src.c_str();
    glShaderSource(s, 1, &p, nullptr);
    glCompileShader(s);
    GLint ok = 0;
    glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[1024];
        glGetShaderInfoLog(s, sizeof(log), nullptr, log);
        platformLog("shader compile failed: %s", log);
    }
    return s;
}

static bool makeProg(Prog& p, const std::string& fs) {
    p.id = glCreateProgram();
    glAttachShader(p.id, compile(GL_VERTEX_SHADER, kVS));
    glAttachShader(p.id, compile(GL_FRAGMENT_SHADER, fs));
    glLinkProgram(p.id);
    GLint ok = 0;
    glGetProgramiv(p.id, GL_LINK_STATUS, &ok);
    if (!ok) {
        char log[1024];
        glGetProgramInfoLog(p.id, sizeof(log), nullptr, log);
        platformLog("program link failed: %s", log);
        return false;
    }
    auto U = [&](const char* n) { return glGetUniformLocation(p.id, n); };
    p.uVP = U("uVP");
    p.uModel = U("uModel");
    p.uEye = U("uEye");
    p.uFogCol = U("uFogCol");
    p.uFogK = U("uFogK");
    p.uGamma = U("uGamma");
    p.uHeadPos = U("uHeadPos");
    p.uHeadDir = U("uHeadDir");
    p.uHeadPow = U("uHeadPow");
    p.uTex = U("uTex");
    p.uAmbSky = U("uAmbSky");
    p.uAmbGround = U("uAmbGround");
    p.uSun = U("uSun");
    p.uSunDir = U("uSunDir");
    p.uSpecCol = U("uSpecCol");
    p.uSpecDir = U("uSpecDir");
    p.uTime = U("uTime");
    return true;
}

void bindProg(const Prog& p, const FrameCtx& f, bool fontTexture) {
    glUseProgram(p.id);
    glActiveTexture(GL_TEXTURE0);
    if (fontTexture)
        glBindTexture(GL_TEXTURE_2D, gfx.texFont);
    else
        glBindTexture(GL_TEXTURE_2D_ARRAY, gfx.texArray);
    glUniform1i(p.uTex, 0);
    glUniformMatrix4fv(p.uVP, 1, GL_FALSE, f.vp.m);
    glUniform3f(p.uEye, f.eye.x, f.eye.y, f.eye.z);
    glUniform1f(p.uGamma, f.gamma);
    glUniform3f(p.uSunDir, f.sunDir.x, f.sunDir.y, f.sunDir.z);
    glUniform3f(p.uHeadPos, f.headPos.x, f.headPos.y, f.headPos.z);
    glUniform3f(p.uHeadDir, f.headDir.x, f.headDir.y, f.headDir.z);
    glUniform1f(p.uTime, f.time);
}

void setEnv(const Prog& p, const Env& e) {
    glUniform3f(p.uAmbSky, e.ambSky.x, e.ambSky.y, e.ambSky.z);
    glUniform3f(p.uAmbGround, e.ambGround.x, e.ambGround.y, e.ambGround.z);
    glUniform3f(p.uSun, e.sun.x, e.sun.y, e.sun.z);
    glUniform3f(p.uSpecCol, e.specCol.x, e.specCol.y, e.specCol.z);
    glUniform3f(p.uSpecDir, e.specDir.x, e.specDir.y, e.specDir.z);
    glUniform3f(p.uFogCol, e.fog.x, e.fog.y, e.fog.z);
    glUniform1f(p.uFogK, e.fogK);
    glUniform1f(p.uHeadPow, e.headPow);
}

void setModel(const Prog& p, const M4& m) { glUniformMatrix4fv(p.uModel, 1, GL_FALSE, m.m); }

// ---------------------------------------------------------------- textures

static const int TS = 512;

static float hash2(int x, int y, int seed) {
    uint32_t h = (uint32_t)x * 374761393u + (uint32_t)y * 668265263u + (uint32_t)seed * 2246822519u;
    h = (h ^ (h >> 13)) * 1274126177u;
    h ^= h >> 16;
    return (h & 0xffffff) / 16777215.f;
}
// Tileable value noise with `cx` x `cy` cells across the texture.
static float vnoise2(float x, float y, int cx, int cy, int seed) {
    float fx = x * cx / TS, fy = y * cy / TS;
    int ix = (int)floorf(fx), iy = (int)floorf(fy);
    float tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    auto h = [&](int a, int b) { return hash2(((a % cx) + cx) % cx, ((b % cy) + cy) % cy, seed); };
    float a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
static float vnoise(float x, float y, int cells, int seed) { return vnoise2(x, y, cells, cells, seed); }
static float fbm(float x, float y, int seed, int base = 6) {
    return 0.45f * vnoise(x, y, base, seed) + 0.28f * vnoise(x, y, base * 4, seed + 1) +
           0.17f * vnoise(x, y, base * 16, seed + 2) + 0.10f * vnoise(x, y, base * 64 > TS / 2 ? TS / 2 : base * 64, seed + 3);
}
static float fract(float v) { return v - floorf(v); }
static float sstep(float a, float b, float x) {
    float t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
}

struct Px {
    float r, g, b, a;
};

static Px texel(int layer, int x, int y) {
    float u = (x + 0.5f) / TS, v = (y + 0.5f) / TS;
    float n = fbm((float)x, (float)y, layer * 7 + 3);
    float speck = hash2(x, y, layer + 40);
    Px p = {1, 1, 1, 1};
    auto set = [&](float r, float g, float b) {
        p.r = r;
        p.g = g;
        p.b = b;
    };
    switch (layer) {
        case T_WHITE:
            break;
        case T_CONCRETE: {
            // board-marked concrete with stains running down
            float streak = vnoise2((float)x, (float)y, 48, 3, 91);
            float c = 0.74f + 0.2f * n - 0.12f * sstep(0.55f, 0.9f, streak) + 0.05f * speck;
            float ju = fract(u * 2), jv = fract(v * 2);
            if (ju < 0.006f || jv < 0.006f) c *= 0.8f;
            set(c, c, c * 0.985f);
            break;
        }
        case T_TILE: {
            // 8 x 4 glazed tiles per repeat
            float fu = fract(u * 8), fv = fract(v * 4);
            int cx = (int)(u * 8), cy = (int)(v * 4);
            float t = 0.93f + 0.07f * hash2(cx, cy, 5) - 0.04f * n;
            float eu = fu < 0.5f ? fu : 1 - fu, ev = fv < 0.5f ? fv : 1 - fv;
            float edge = sstep(0.006f, 0.03f, eu < ev * 2.f ? eu : ev * 2.f);
            float c = 0.62f + (t - 0.62f) * edge;
            set(c, c, c);
            break;
        }
        case T_BALLAST: {
            // crushed stone: blocky cells with shading
            float st = hash2(x / 5, y / 5, 71), st2 = hash2((x + 2) / 9, (y + 5) / 9, 72);
            float c = 0.42f + 0.33f * st + 0.15f * st2 + 0.1f * speck;
            c *= 0.8f + 0.3f * n;
            set(c, c * 0.96f, c * 0.9f);
            break;
        }
        case T_TRACK:
        case T_SLAB: {
            // u across 2.8 m of track, v along 2.4 m (four sleepers)
            float st = hash2(x / 5, y / 5, 71);
            float base = layer == T_TRACK ? (0.40f + 0.35f * st + 0.1f * speck) * (0.8f + 0.3f * n) : 0.60f + 0.2f * n;
            set(base, base * 0.96f, base * 0.9f);
            float fv = fract(v * 4);
            if (fv > 0.3f && fv < 0.7f && u > 0.07f && u < 0.93f) {
                float bevel = sstep(0.3f, 0.34f, fv) * sstep(0.7f, 0.66f, fv);
                float c = (0.66f + 0.14f * n) * (0.8f + 0.2f * bevel);
                // darker pads under the rails
                float du = fabsf(fabsf(u - 0.5f) - 0.256f);
                if (du < 0.035f) c *= 0.55f;
                set(c, c, c * 0.97f);
            }
            // rust-brown stain along the rails
            float du = fabsf(fabsf(u - 0.5f) - 0.256f);
            float stain = 1 - 0.25f * sstep(0.09f, 0.0f, du);
            p.g *= stain;
            p.b *= stain * stain;
            break;
        }
        case T_FACADE_APT: {
            // 4 bays x 4 floors: wide balcony windows
            int cx = (int)(u * 4), cy = (int)(v * 4);
            float fu = fract(u * 4), fv = fract(v * 4);
            float wall = 0.90f + 0.1f * n;
            set(wall, wall, wall * 0.98f);
            if (fu > 0.1f && fu < 0.9f && fv > 0.22f && fv < 0.86f) {
                float k = hash2(cx, cy, 9);
                bool curtain = k > 0.55f && fu < 0.1f + 0.8f * (0.3f + 0.5f * hash2(cx, cy, 10));
                if (curtain)
                    set(0.78f, 0.76f, 0.70f);
                else
                    set(0.20f + 0.08f * k, 0.28f + 0.10f * k, 0.38f + 0.12f * k);
                // frames
                float m = fract((fu - 0.1f) / 0.8f * 3);
                if (m < 0.04f || m > 0.96f || fv < 0.24f || fv > 0.84f) set(0.82f, 0.84f, 0.86f);
            }
            if (fv <= 0.22f && fv > 0.17f) set(0.6f, 0.6f, 0.6f);  // balcony slab shadow
            break;
        }
        case T_FACADE_OFFICE: {
            // 6 x 6 glass panes with mullions
            int cx = (int)(u * 6), cy = (int)(v * 6);
            float fu = fract(u * 6), fv = fract(v * 6);
            float k = hash2(cx, cy, 13);
            float grad = 0.7f + 0.3f * fv;
            set((0.16f + 0.10f * k) * grad, (0.30f + 0.12f * k) * grad, (0.42f + 0.14f * k) * grad);
            if (k > 0.82f) set(0.75f, 0.72f, 0.60f);  // lit office
            if (fu < 0.05f || fv < 0.07f) set(0.72f, 0.74f, 0.76f);
            break;
        }
        case T_FACADE_BRICK: {
            // bricks with 3 x 3 punched windows
            float row = floorf(v * 48);
            float bu = fract(u * 16 + (fmodf(row, 2) < 1 ? 0.5f : 0)), bv = fract(v * 48);
            float tone = 0.8f + 0.2f * hash2((int)(u * 16 + (fmodf(row, 2) < 1 ? 0.5f : 0)), (int)row, 21);
            set(0.80f * tone, 0.50f * tone, 0.40f * tone);
            if (bu < 0.06f || bv < 0.12f) set(0.78f, 0.76f, 0.72f);
            int cx = (int)(u * 3), cy = (int)(v * 3);
            float fu = fract(u * 3), fv = fract(v * 3);
            if (fu > 0.22f && fu < 0.78f && fv > 0.25f && fv < 0.8f) {
                float k = hash2(cx, cy, 23);
                set(0.2f + 0.1f * k, 0.27f + 0.1f * k, 0.36f + 0.1f * k);
                if (fu < 0.25f || fu > 0.75f || fv < 0.28f || fv > 0.77f || fabsf(fu - 0.5f) < 0.012f) set(0.9f, 0.9f, 0.88f);
            }
            break;
        }
        case T_GROUND: {
            // paving blocks
            float fu = fract(u * 16), fv = fract(v * 32 + (fmodf(floorf(u * 16), 2) < 1 ? 0.5f : 0));
            float tone = 0.72f + 0.14f * hash2((int)(u * 16), (int)(v * 32 + (fmodf(floorf(u * 16), 2) < 1 ? 0.5f : 0)), 31);
            float c = tone * (0.85f + 0.2f * n);
            if (fu < 0.06f || fv < 0.08f) c *= 0.75f;
            set(c, c * 0.98f, c * 0.95f);
            break;
        }
        case T_GRASS: {
            float c = 0.55f + 0.35f * n + 0.25f * (speck - 0.5f);
            set(0.36f * c, 0.62f * c, 0.26f * c);
            break;
        }
        case T_PLATFORM: {
            // 4 x 4 granite slabs
            float fu = fract(u * 4), fv = fract(v * 4);
            float tone = 0.80f + 0.08f * hash2((int)(u * 4), (int)(v * 4), 33);
            float c = tone + 0.14f * (speck - 0.5f) + 0.06f * (hash2(x / 2, y / 2, 34) - 0.5f);
            if (fu < 0.012f || fv < 0.012f) c *= 0.7f;
            set(c, c, c * 0.99f);
            break;
        }
        case T_TACTILE: {
            // yellow paving with raised dots, 2 x 2 tiles of 5 x 5 dots
            float fu = fract(u * 10), fv = fract(v * 10);
            float d = sqrtf((fu - 0.5f) * (fu - 0.5f) + (fv - 0.5f) * (fv - 0.5f));
            float c = 0.9f - 0.08f * n;
            float bump = d < 0.3f ? 1.08f - 0.25f * sstep(0.2f, 0.3f, d) + 0.1f * (0.5f - fv) : 0.93f;
            float eu = fract(u * 2), ev = fract(v * 2);
            if (eu < 0.01f || ev < 0.01f) bump *= 0.7f;
            set(0.98f * c * bump, 0.78f * c * bump, 0.12f * c * bump);
            break;
        }
        case T_CARFLOOR: {
            float c = 0.80f + 0.2f * (speck - 0.5f) + 0.12f * (hash2(x / 3, y / 3, 44) - 0.5f);
            set(c, c, c);
            break;
        }
        case T_SEAT: {
            // woven fabric
            float w = 0.85f + 0.15f * (sinf(u * 6.2832f * 128) * sinf(v * 6.2832f * 128));
            float fu = fract(u * 8) - 0.5f, fv = fract(v * 8) - 0.5f;
            float dot = sstep(0.16f, 0.12f, sqrtf(fu * fu + fv * fv));
            float c = w * (0.86f + 0.14f * dot);
            set(c, c, c);
            break;
        }
        case T_METAL: {
            float c = 0.91f + 0.09f * vnoise2((float)x, (float)y, 4, 256, 77) - 0.04f * n;
            set(c, c, c);
            break;
        }
        case T_CLOUD: {
            float c = fbm((float)x, (float)y, 301, 4);
            set(c, c, c);
            break;
        }
        case T_FOLIAGE: {
            // a tree crown: a ragged ellipse of leaf clumps
            float ex = (u - 0.5f) / 0.5f, ey = (v - 0.5f) / 0.5f;
            float r = sqrtf(ex * ex + ey * ey);
            float ragged = fbm((float)x, (float)y, 201, 10);
            float clump = fbm((float)x, (float)y, 207, 40);
            float inside = r * 1.12f + (ragged - 0.5f) * 0.75f;
            p.a = inside < 0.8f && clump > 0.3f - 0.25f * (0.8f - inside) ? 1.f : 0.f;
            float shade = 0.5f + 0.75f * clump + 0.2f * (ragged - 0.5f) - 0.22f * ey;
            set(0.26f * shade, 0.50f * shade, 0.17f * shade);
            break;
        }
        case T_ROAD: {
            // u across four lanes, v along 12 m
            float c = 0.34f + 0.1f * n + 0.08f * (speck - 0.5f);
            set(c, c, c * 1.02f);
            if (fabsf(u - 0.5f) < 0.012f && (fabsf(u - 0.5f) > 0.004f)) set(0.92f, 0.74f, 0.15f);  // double centre line
            bool dash = fract(v * 2) < 0.4f;
            if (dash && (fabsf(u - 0.25f) < 0.006f || fabsf(u - 0.75f) < 0.006f)) set(0.9f, 0.9f, 0.9f);
            if (u < 0.012f || u > 0.988f) set(0.85f, 0.85f, 0.85f);
            break;
        }
        case T_PANEL: {
            // noise barrier: framed panels, 2 across, with ribs
            // u runs up the wall, v along it
            float fu = fract(v * 2), fv = u;
            float c = 0.86f + 0.08f * n + 0.05f * sinf(fv * 6.2832f * 24);
            set(c * 0.93f, c * 0.97f, c * 0.95f);
            if (fu < 0.03f || fu > 0.97f) set(0.45f, 0.47f, 0.48f);
            if (fv < 0.03f || fv > 0.97f) set(0.5f, 0.52f, 0.53f);
            break;
        }
        case T_WOOD: {
            float grain = vnoise2((float)x, (float)y, 3, 96, 55);
            float c = 0.75f + 0.25f * grain;
            float fv = fract(v * 6);
            if (fv < 0.06f) c *= 0.5f;
            set(0.72f * c, 0.52f * c, 0.33f * c);
            break;
        }
        case T_CEILING: {
            // 4 x 4 perforated ceiling panels
            float fu = fract(u * 4), fv = fract(v * 4);
            float c = 0.94f;
            float du = fract(u * 64) - 0.5f, dv = fract(v * 64) - 0.5f;
            if (du * du + dv * dv < 0.03f) c = 0.8f;
            if (fu < 0.015f || fv < 0.015f) c = 0.6f;
            set(c, c, c);
            break;
        }
        case T_GLOW: {
            float d = sqrtf((u - 0.5f) * (u - 0.5f) + (v - 0.5f) * (v - 0.5f)) * 2;
            float c = d < 1 ? powf(1 - d, 2.2f) : 0;
            c += d < 0.18f ? (0.18f - d) * 4 : 0;
            if (c > 1) c = 1;
            set(c, c, c);
            break;
        }
    }
    return p;
}

static void genLayer(int layer, std::vector<uint8_t>& px) {
    px.resize((size_t)TS * TS * 4);
    for (int y = 0; y < TS; y++)
        for (int x = 0; x < TS; x++) {
            Px t = texel(layer, x, y);
            uint8_t* p = &px[((size_t)y * TS + x) * 4];
            p[0] = toByte(t.r);
            p[1] = toByte(t.g);
            p[2] = toByte(t.b);
            p[3] = toByte(t.a);
        }
}

bool Gfx::init() {
    std::string head = kFSHead;
    if (!makeProg(world, head + kFSWorldBody)) return false;
    std::string cut = head;
    cut.insert(cut.find('\n') + 1, "#define CUTOUT 1\n");
    if (!makeProg(cutout, cut + kFSWorldBody)) return false;
    if (!makeProg(glass, head + kFSGlassBody)) return false;
    if (!makeProg(sky, head + kFSSkyBody)) return false;
    if (!makeProg(text, kFSText)) return false;
    if (!makeProg(flat, kFSFlat)) return false;

    glGenTextures(1, &texArray);
    glBindTexture(GL_TEXTURE_2D_ARRAY, texArray);
    glTexImage3D(GL_TEXTURE_2D_ARRAY, 0, GL_RGBA8, TS, TS, T_COUNT, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    std::vector<uint8_t> px;
    for (int l = 0; l < T_COUNT; l++) {
        genLayer(l, px);
        glTexSubImage3D(GL_TEXTURE_2D_ARRAY, 0, 0, 0, l, TS, TS, 1, GL_RGBA, GL_UNSIGNED_BYTE, px.data());
    }
    glGenerateMipmap(GL_TEXTURE_2D_ARRAY);
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_T, GL_REPEAT);
    // Anisotropic filtering keeps the track bed readable at grazing angles.
    const char* ext = (const char*)glGetString(GL_EXTENSIONS);
    if (ext && strstr(ext, "GL_EXT_texture_filter_anisotropic")) glTexParameterf(GL_TEXTURE_2D_ARRAY, 0x84FE, 4.f);

    std::vector<uint8_t> file;
    if (!platformLoadAsset("font.png", file)) {
        platformLog("font.png missing");
        return false;
    }
    int w, h, comp;
    uint8_t* img = stbi_load_from_memory(file.data(), (int)file.size(), &w, &h, &comp, 1);
    if (!img) {
        platformLog("font.png could not be decoded");
        return false;
    }
    glGenTextures(1, &texFont);
    glBindTexture(GL_TEXTURE_2D, texFont);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_R8, w, h, 0, GL_RED, GL_UNSIGNED_BYTE, img);
    glGenerateMipmap(GL_TEXTURE_2D);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    stbi_image_free(img);
    return true;
}

// ---------------------------------------------------------------- text

static const Glyph* findGlyph(uint32_t cp) {
    int lo = 0, hi = kGlyphCount - 1;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        if (kGlyphs[mid].cp == cp) return &kGlyphs[mid];
        if (kGlyphs[mid].cp < cp)
            lo = mid + 1;
        else
            hi = mid - 1;
    }
    return nullptr;
}

static uint32_t nextCodepoint(const char*& s) {
    const unsigned char* p = (const unsigned char*)s;
    uint32_t c = *p;
    int extra = 0;
    if (c >= 0xF0) {
        c &= 0x07;
        extra = 3;
    } else if (c >= 0xE0) {
        c &= 0x0F;
        extra = 2;
    } else if (c >= 0xC0) {
        c &= 0x1F;
        extra = 1;
    }
    p++;
    while (extra-- > 0 && *p) c = (c << 6) | (*p++ & 0x3F);
    s = (const char*)p;
    return c;
}

float textWidth(const char* utf8) {
    float w = 0;
    while (*utf8) {
        const Glyph* g = findGlyph(nextCodepoint(utf8));
        if (!g) g = findGlyph('?');
        if (g) w += g->adv;
    }
    return w;
}

void addText(MB& mb, const char* utf8, V3 origin, V3 right, V3 up, float height, Col col, int align) {
    float pen = 0;
    if (align == 1) pen = -textWidth(utf8) * 0.5f;
    if (align == 2) pen = -textWidth(utf8);
    while (*utf8) {
        const Glyph* g = findGlyph(nextCodepoint(utf8));
        if (!g) g = findGlyph('?');
        if (!g) continue;
        if (g->x1 > g->x0) {
            V3 a = origin + right * ((pen + g->x0) * height) + up * (g->y0 * height);
            V3 b = origin + right * ((pen + g->x1) * height) + up * (g->y0 * height);
            V3 c = origin + right * ((pen + g->x1) * height) + up * (g->y1 * height);
            V3 d = origin + right * ((pen + g->x0) * height) + up * (g->y1 * height);
            // texture v runs downwards, glyph y runs upwards
            mb.quad(a, b, c, d, g->u0, g->v1, g->u1, g->v0, 0, col, col, col, col);
        }
        pen += g->adv;
    }
}

void addRect(MB& mb, V3 centre, V3 right, V3 up, float w, float h, Col col) {
    const Glyph* g = findGlyph(1);
    if (!g) return;
    float u = (g->u0 + g->u1) * 0.5f, v = (g->v0 + g->v1) * 0.5f;
    V3 a = centre - right * (w * 0.5f) - up * (h * 0.5f);
    V3 b = centre + right * (w * 0.5f) - up * (h * 0.5f);
    V3 c = centre + right * (w * 0.5f) + up * (h * 0.5f);
    V3 d = centre - right * (w * 0.5f) + up * (h * 0.5f);
    mb.quad(a, b, c, d, u, v, u, v, 0, col, col, col, col);
}
