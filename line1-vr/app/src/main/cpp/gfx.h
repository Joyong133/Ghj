// Minimal OpenGL ES 3 helpers: meshes, shaders, procedural textures, text.
#pragma once
#include <GLES3/gl3.h>

#include <cstdint>
#include <vector>

#include "vmath.h"

// Supplied by the platform layer (Android asset manager / desktop file system).
bool platformLoadAsset(const char* name, std::vector<uint8_t>& out);
void platformLog(const char* fmt, ...);

struct Col {
    uint8_t r, g, b, a;
};
Col rgb(float r, float g, float b, float a = 1.f);
inline Col gray(float v) { return rgb(v, v, v); }
Col scale(Col c, float f);

struct Vtx {
    float x, y, z;
    float u, v, layer;
    Col c;
    int8_t nx, ny, nz, gloss;  // gloss: 0..127 shininess, negative = unlit (emissive)
};

// Layers of the procedural texture array.
enum Tex {
    T_WHITE = 0,
    T_CONCRETE,
    T_TILE,
    T_BALLAST,
    T_TRACK,          // ballast with sleepers
    T_SLAB,           // concrete slab with sleepers
    T_FACADE_APT,     // apartment block
    T_FACADE_OFFICE,  // glass curtain wall
    T_FACADE_BRICK,   // low-rise brick building
    T_GROUND,         // paving blocks
    T_GRASS,
    T_PLATFORM,       // granite platform tiles
    T_TACTILE,        // yellow tactile paving
    T_CARFLOOR,
    T_SEAT,
    T_METAL,
    T_CLOUD,
    T_FOLIAGE,        // has alpha
    T_ROAD,
    T_PANEL,          // noise barrier
    T_WOOD,
    T_CEILING,
    T_GLOW,
    T_COUNT
};

const float UNLIT = -1.f;

struct MB {
    std::vector<Vtx> v;
    std::vector<uint32_t> i;
    float gloss = 0;  // applied to the quads added from now on (UNLIT for emissive)
    // a,b,c,d go round the quad; uv: a=(u0,v0) b=(u1,v0) c=(u1,v1) d=(u0,v1)
    void quad(V3 a, V3 b, V3 c, V3 d, float u0, float v0, float u1, float v1, float layer, Col ca, Col cb, Col cc,
              Col cd);
    void quad(V3 a, V3 b, V3 c, V3 d, float layer, Col col, float uvScale = 1.f);
    void box(V3 mn, V3 mx, float layer, Col col, float uvScale = 1.f);
    // Box with a horizontal orientation: `right` and `fwd` are unit vectors.
    void obox(V3 centre, V3 right, V3 fwd, float hx, float y0, float y1, float hz, float layer, Col col,
              float uvScale = 1.f);
    void clear() {
        v.clear();
        i.clear();
        gloss = 0;
    }
};

struct Mesh {
    GLuint vao = 0, vbo = 0, ibo = 0;
    int count = 0;
    void upload(const MB& mb, bool dynamic = false);
    void draw() const;
    void destroy();
};

// Lighting of one kind of place (open air, tunnel, inside the train).
struct Env {
    V3 ambSky, ambGround;  // hemisphere light for up / down facing surfaces
    V3 sun;                // directional light colour (zero indoors)
    V3 specCol, specDir;
    V3 fog;
    float fogK;
    float headPow;         // strength of the train headlight
};

struct FrameCtx {
    M4 vp;
    V3 eye;
    float gamma;
    V3 sunDir, headPos, headDir;
    float time;
};

struct Prog {
    GLuint id = 0;
    GLint uVP, uModel, uEye, uFogCol, uFogK, uGamma, uHeadPos, uHeadDir, uHeadPow, uTex, uAmbSky, uAmbGround, uSun,
        uSunDir, uSpecCol, uSpecDir, uTime;
};

struct Gfx {
    Prog world, cutout, glass, text, sky, flat;
    GLuint texArray = 0, texFont = 0;
    bool init();
};
extern Gfx gfx;

void bindProg(const Prog& p, const FrameCtx& f, bool fontTexture = false);
void setEnv(const Prog& p, const Env& e);
void setModel(const Prog& p, const M4& m);

// Text. Sizes are in metres; `height` is the height of a Hangul glyph box (1 em).
float textWidth(const char* utf8);  // in em
// align: 0 = left, 1 = centre, 2 = right. origin is on the baseline.
void addText(MB& mb, const char* utf8, V3 origin, V3 right, V3 up, float height, Col col, int align = 0);
// Solid rectangle drawn with the text shader (centre, width, height).
void addRect(MB& mb, V3 centre, V3 right, V3 up, float w, float h, Col col);
