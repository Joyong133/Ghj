#include "gfx.h"

#include <cmath>
#include <cstdlib>

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

void MB::quad(V3 a, V3 b, V3 c, V3 d, float u0, float v0, float u1, float v1, float layer, Col ca, Col cb, Col cc,
              Col cd) {
    uint32_t n = (uint32_t)v.size();
    v.push_back({a.x, a.y, a.z, u0, v0, layer, ca});
    v.push_back({b.x, b.y, b.z, u1, v0, layer, cb});
    v.push_back({c.x, c.y, c.z, u1, v1, layer, cc});
    v.push_back({d.x, d.y, d.z, u0, v1, layer, cd});
    i.insert(i.end(), {n, n + 1, n + 2, n, n + 2, n + 3});
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
    Col top = col, side = scale(col, 0.82f), end = scale(col, 0.7f), bottom = scale(col, 0.55f);
    quad({mn.x, mx.y, mn.z}, {mx.x, mx.y, mn.z}, {mx.x, mx.y, mx.z}, {mn.x, mx.y, mx.z}, layer, top, uvScale);
    quad({mn.x, mn.y, mn.z}, {mx.x, mn.y, mn.z}, {mx.x, mn.y, mx.z}, {mn.x, mn.y, mx.z}, layer, bottom, uvScale);
    quad({mn.x, mn.y, mn.z}, {mn.x, mn.y, mx.z}, {mn.x, mx.y, mx.z}, {mn.x, mx.y, mn.z}, layer, side, uvScale);
    quad({mx.x, mn.y, mn.z}, {mx.x, mn.y, mx.z}, {mx.x, mx.y, mx.z}, {mx.x, mx.y, mn.z}, layer, side, uvScale);
    quad({mn.x, mn.y, mn.z}, {mx.x, mn.y, mn.z}, {mx.x, mx.y, mn.z}, {mn.x, mx.y, mn.z}, layer, end, uvScale);
    quad({mn.x, mn.y, mx.z}, {mx.x, mn.y, mx.z}, {mx.x, mx.y, mx.z}, {mn.x, mx.y, mx.z}, layer, end, uvScale);
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
uniform mat4 uMVP;
uniform mat4 uModel;
uniform vec3 uEye;
uniform float uFogK;
uniform vec3 uHeadPos;
uniform vec3 uHeadDir;
uniform float uHeadPow;
out vec3 vUV;
out vec4 vCol;
out float vFog;
void main() {
    vec4 w = uModel * vec4(aPos, 1.0);
    gl_Position = uMVP * vec4(aPos, 1.0);
    vFog = exp(-distance(w.xyz, uEye) * uFogK);
    vec3 l = w.xyz - uHeadPos;
    float ld = length(l);
    float c = dot(l / max(ld, 0.01), uHeadDir);
    float spot = smoothstep(0.80, 0.985, c) * uHeadPow / (1.0 + ld * ld * 0.0006);
    vCol = vec4(aCol.rgb * (1.0 + spot), aCol.a);
    vUV = aUV;
}
)";

static const char* kFSWorld = R"(#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform vec3 uFogCol;
uniform float uGamma;
in vec3 vUV;
in vec4 vCol;
in float vFog;
out vec4 oCol;
void main() {
    vec3 c = texture(uTex, vUV).rgb * vCol.rgb;
    c = mix(uFogCol, c, vFog);
    oCol = vec4(pow(c, vec3(uGamma)), 1.0);
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

// Untextured colour, used for the fade overlay.
static const char* kFSFlat = R"(#version 300 es
precision highp float;
in vec3 vUV;
in vec4 vCol;
in float vFog;
out vec4 oCol;
void main() { oCol = vCol; }
)";

static GLuint compile(GLenum type, const char* src) {
    GLuint s = glCreateShader(type);
    glShaderSource(s, 1, &src, nullptr);
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

static bool makeProg(Prog& p, const char* vs, const char* fs) {
    p.id = glCreateProgram();
    glAttachShader(p.id, compile(GL_VERTEX_SHADER, vs));
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
    p.uMVP = glGetUniformLocation(p.id, "uMVP");
    p.uModel = glGetUniformLocation(p.id, "uModel");
    p.uEye = glGetUniformLocation(p.id, "uEye");
    p.uFogCol = glGetUniformLocation(p.id, "uFogCol");
    p.uFogK = glGetUniformLocation(p.id, "uFogK");
    p.uGamma = glGetUniformLocation(p.id, "uGamma");
    p.uHeadPos = glGetUniformLocation(p.id, "uHeadPos");
    p.uHeadDir = glGetUniformLocation(p.id, "uHeadDir");
    p.uHeadPow = glGetUniformLocation(p.id, "uHeadPow");
    p.uTex = glGetUniformLocation(p.id, "uTex");
    return true;
}

// ---------------------------------------------------------------- textures

static const int TS = 256;

static float hash2(int x, int y, int seed) {
    uint32_t h = (uint32_t)x * 374761393u + (uint32_t)y * 668265263u + (uint32_t)seed * 2246822519u;
    h = (h ^ (h >> 13)) * 1274126177u;
    h ^= h >> 16;
    return (h & 0xffffff) / 16777215.f;
}
// Tileable value noise with `cells` cells across the texture.
static float vnoise(float x, float y, int cells, int seed) {
    float fx = x * cells / TS, fy = y * cells / TS;
    int ix = (int)floorf(fx), iy = (int)floorf(fy);
    float tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    auto h = [&](int a, int b) { return hash2(((a % cells) + cells) % cells, ((b % cells) + cells) % cells, seed); };
    float a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
static float fbm(float x, float y, int seed) {
    return 0.5f * vnoise(x, y, 8, seed) + 0.3f * vnoise(x, y, 32, seed + 1) + 0.2f * vnoise(x, y, 128, seed + 2);
}

static void genLayer(int layer, std::vector<uint8_t>& px) {
    px.resize(TS * TS * 4);
    for (int y = 0; y < TS; y++)
        for (int x = 0; x < TS; x++) {
            float r = 1, g = 1, b = 1;
            float n = fbm((float)x, (float)y, layer * 7 + 3);
            float speck = hash2(x, y, layer + 40);
            float u = (x + 0.5f) / TS, v = (y + 0.5f) / TS;
            switch (layer) {
                case T_WHITE:
                    break;
                case T_CONCRETE:
                    r = g = b = 0.72f + 0.28f * n;
                    break;
                case T_TILE: {
                    // 4 x 4 tiles with dark joints
                    float fu = fmodf(u * 4, 1.f), fv = fmodf(v * 4, 1.f);
                    bool joint = fu < 0.03f || fv < 0.03f;
                    float t = 0.9f + 0.1f * hash2((int)(u * 4), (int)(v * 4), 5);
                    r = g = b = joint ? 0.6f : t;
                    break;
                }
                case T_BALLAST:
                    r = 0.55f + 0.45f * speck * (0.6f + 0.4f * n);
                    g = r * 0.97f;
                    b = r * 0.93f;
                    break;
                case T_TRACK:
                case T_SLAB: {
                    // u across 2.8 m of track, v along 2.4 m (four sleepers)
                    float base = layer == T_TRACK ? 0.5f + 0.4f * speck * (0.6f + 0.4f * n) : 0.62f + 0.2f * n;
                    r = base;
                    g = base * 0.97f;
                    b = base * 0.93f;
                    float fv = fmodf(v * 4, 1.f);
                    if (fv > 0.3f && fv < 0.7f && u > 0.07f && u < 0.93f) {
                        float c = 0.78f + 0.12f * n;
                        r = c;
                        g = c;
                        b = c * 0.97f;
                    }
                    break;
                }
                case T_FACADE: {
                    // 4 x 4 window bays, some lit differently
                    int cx = (int)(u * 4), cy = (int)(v * 4);
                    float fu = fmodf(u * 4, 1.f), fv = fmodf(v * 4, 1.f);
                    bool win = fu > 0.18f && fu < 0.82f && fv > 0.25f && fv < 0.8f;
                    if (win) {
                        float k = hash2(cx, cy, 9);
                        r = 0.22f + 0.12f * k;
                        g = 0.30f + 0.14f * k;
                        b = 0.40f + 0.16f * k;
                    } else {
                        r = g = b = 0.86f + 0.14f * n;
                    }
                    break;
                }
                case T_GROUND:
                    r = 0.62f + 0.3f * n + 0.08f * speck;
                    g = r;
                    b = r * 0.97f;
                    break;
                case T_PLATFORM: {
                    float fu = fmodf(u * 8, 1.f), fv = fmodf(v * 8, 1.f);
                    bool joint = fu < 0.04f || fv < 0.04f;
                    r = g = b = joint ? 0.68f : 0.86f + 0.14f * speck;
                    break;
                }
                case T_CARFLOOR:
                    r = g = b = 0.78f + 0.22f * speck;
                    break;
                case T_SEAT: {
                    float fu = fmodf(u * 16, 1.f) - 0.5f, fv = fmodf(v * 16, 1.f) - 0.5f;
                    bool dot = fu * fu + fv * fv < 0.05f;
                    r = g = b = dot ? 1.f : 0.8f;
                    break;
                }
                case T_METAL:
                    r = g = b = 0.8f + 0.2f * vnoise((float)x * 0.05f, (float)y, 64, 77);
                    break;
            }
            uint8_t* p = &px[(y * TS + x) * 4];
            p[0] = toByte(r);
            p[1] = toByte(g);
            p[2] = toByte(b);
            p[3] = 255;
        }
}

bool Gfx::init() {
    if (!makeProg(world, kVS, kFSWorld)) return false;
    if (!makeProg(text, kVS, kFSText)) return false;
    if (!makeProg(flat, kVS, kFSFlat)) return false;

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
