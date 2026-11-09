// Off-screen test harness: renders one view of the scene to a PNG with a
// software OpenGL ES context, so the scene can be checked without a headset.
//
//   ./build.sh && ./line1_desktop out.png --station 3 --extra 0 --car 0 --z -8.6 --yaw 0 --pitch 0
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>

#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "app.h"
#include "stb_image_write.h"

static std::string gAssetDir = "../app/src/main/assets";

bool platformLoadAsset(const char* name, std::vector<uint8_t>& out) {
    std::string p = gAssetDir + "/" + name;
    FILE* f = fopen(p.c_str(), "rb");
    if (!f) return false;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    out.resize(n);
    size_t got = fread(out.data(), 1, n, f);
    fclose(f);
    return got == (size_t)n;
}
void platformLog(const char* fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    vfprintf(stderr, fmt, ap);
    va_end(ap);
    fputc('\n', stderr);
}

int main(int argc, char** argv) {
    const char* out = argc > 1 ? argv[1] : "out.png";
    int station = 0, car = 0, w = 1280, h = 960, steps = 0;
    double extra = 0;
    float x = 0, z = -8.6f, yaw = 0, pitch = 0, headYaw = 0, eyeH = 1.6f, doors = -1, fov = 95;
    for (int i = 2; i + 1 < argc; i += 2) {
        std::string k = argv[i];
        double v = atof(argv[i + 1]);
        if (k == "--station") station = (int)v;
        else if (k == "--extra") extra = v;
        else if (k == "--car") car = (int)v;
        else if (k == "--x") x = (float)v;
        else if (k == "--z") z = (float)v;
        else if (k == "--yaw") yaw = (float)(v * M_PI / 180);
        else if (k == "--headyaw") headYaw = (float)(v * M_PI / 180);
        else if (k == "--pitch") pitch = (float)(v * M_PI / 180);
        else if (k == "--eye") eyeH = (float)v;
        else if (k == "--doors") doors = (float)v;
        else if (k == "--fov") fov = (float)v;
        else if (k == "--steps") steps = (int)v;   // simulated 1/72 s frames before the capture
        else if (k == "--w") w = (int)v;
        else if (k == "--h") h = (int)v;
    }

    EGLDisplay dpy = eglGetPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA, EGL_DEFAULT_DISPLAY, nullptr);
    if (dpy == EGL_NO_DISPLAY || !eglInitialize(dpy, nullptr, nullptr)) {
        fprintf(stderr, "no EGL display\n");
        return 1;
    }
    eglBindAPI(EGL_OPENGL_ES_API);
    EGLint cfgAttr[] = {EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT, EGL_NONE};
    EGLConfig cfg;
    EGLint n = 0;
    eglChooseConfig(dpy, cfgAttr, &cfg, 1, &n);
    EGLint ctxAttr[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
    EGLContext ctx = eglCreateContext(dpy, n ? cfg : EGL_NO_CONFIG_KHR, EGL_NO_CONTEXT, ctxAttr);
    if (ctx == EGL_NO_CONTEXT || !eglMakeCurrent(dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, ctx)) {
        fprintf(stderr, "no GLES3 context\n");
        return 1;
    }

    GLuint fbo, col, depth;
    glGenFramebuffers(1, &fbo);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo);
    glGenRenderbuffers(1, &col);
    glBindRenderbuffer(GL_RENDERBUFFER, col);
    glRenderbufferStorageMultisample(GL_RENDERBUFFER, 4, GL_RGBA8, w, h);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, col);
    glGenRenderbuffers(1, &depth);
    glBindRenderbuffer(GL_RENDERBUFFER, depth);
    glRenderbufferStorageMultisample(GL_RENDERBUFFER, 4, GL_DEPTH_COMPONENT24, w, h);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, depth);
    GLuint rfbo, rcol;
    glGenFramebuffers(1, &rfbo);
    glBindFramebuffer(GL_FRAMEBUFFER, rfbo);
    glGenRenderbuffers(1, &rcol);
    glBindRenderbuffer(GL_RENDERBUFFER, rcol);
    glRenderbufferStorage(GL_RENDERBUFFER, GL_RGBA8, w, h);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, rcol);

    App app;
    if (!app.init()) return 1;
    Input in;
    in.headFwdX = -sinf(headYaw);
    in.headFwdZ = -cosf(headYaw);
    if (argc > 2) app.debugPlace(station, extra, car, x, z, yaw);
    for (int i = 0; i < steps; i++) {
        app.update(1.f / 72.f, in);
        if (i % (72 * 20) == 0 || i == steps - 1) {
            char st[256];
            app.debugStatus(st, sizeof(st));
            printf("t=%5.0fs %s\n", i / 72.0, st);
        }
    }
    if (argc > 2 && steps == 0) {
        app.update(0.f, in);
        if (doors >= 0) app.debugDoors(doors);
    } else if (steps == 0) {
        for (int i = 0; i < 80; i++) app.update(1.f / 72.f, in);
    }

    // Head pose in the play space: standing at the origin.
    M4 head = m4Mul(m4Translate(0, eyeH, 0), m4Mul(m4RotY(headYaw), m4RotX(pitch)));
    float t = tanf(fov * 0.5f * (float)M_PI / 180), a = (float)w / h;
    M4 proj = m4Proj(-t * a, t * a, t, -t, 0.1f, 6000.f);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo);
    glViewport(0, 0, w, h);
    app.render(m4InvRigid(head), proj, 1.f);
    GLenum err = glGetError();
    if (err) fprintf(stderr, "GL error 0x%x\n", err);
    glBindFramebuffer(GL_READ_FRAMEBUFFER, fbo);
    glBindFramebuffer(GL_DRAW_FRAMEBUFFER, rfbo);
    glBlitFramebuffer(0, 0, w, h, 0, 0, w, h, GL_COLOR_BUFFER_BIT, GL_NEAREST);
    glBindFramebuffer(GL_FRAMEBUFFER, rfbo);
    std::vector<uint8_t> px(w * h * 4);
    glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, px.data());
    stbi_flip_vertically_on_write(1);
    stbi_write_png(out, w, h, 4, px.data(), w * 4);
    app.shutdown();
    return 0;
}
