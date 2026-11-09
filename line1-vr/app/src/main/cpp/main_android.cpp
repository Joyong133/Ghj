// Android / OpenXR entry point (Meta Quest and other OpenXR headsets).
#include <EGL/egl.h>
#include <GLES3/gl3.h>
#include <android/asset_manager.h>
#include <android/log.h>
#include <android_native_app_glue.h>
#include <jni.h>

#include <cstdarg>
#include <cstring>
#include <ctime>
#include <string>
#include <vector>

#define XR_USE_PLATFORM_ANDROID
#define XR_USE_GRAPHICS_API_OPENGL_ES
#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>

#include "app.h"
#include "audio.h"

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, "line1vr", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "line1vr", __VA_ARGS__)

static android_app* gAndroidApp = nullptr;

bool platformLoadAsset(const char* name, std::vector<uint8_t>& out) {
    AAsset* a = AAssetManager_open(gAndroidApp->activity->assetManager, name, AASSET_MODE_BUFFER);
    if (!a) return false;
    size_t n = (size_t)AAsset_getLength(a);
    out.resize(n);
    int got = AAsset_read(a, out.data(), n);
    AAsset_close(a);
    return got == (int)n;
}
void platformLog(const char* fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    __android_log_vprint(ANDROID_LOG_INFO, "line1vr", fmt, ap);
    va_end(ap);
}

namespace {

typedef void (*FramebufferTexture2DMultisampleFn)(GLenum, GLenum, GLenum, GLuint, GLint, GLsizei);
typedef void (*RenderbufferStorageMultisampleFn)(GLenum, GLsizei, GLenum, GLsizei, GLsizei);

struct EyeTarget {
    XrSwapchain swapchain = XR_NULL_HANDLE;
    int32_t width = 0, height = 0;
    std::vector<XrSwapchainImageOpenGLESKHR> images;
    std::vector<GLuint> fbos;
    GLuint depth = 0;
};

struct Xr {
    XrInstance instance = XR_NULL_HANDLE;
    XrSystemId systemId = XR_NULL_SYSTEM_ID;
    XrSession session = XR_NULL_HANDLE;
    XrSpace stage = XR_NULL_HANDLE;  // floor-level play space
    XrSpace viewSpace = XR_NULL_HANDLE;
    float floorOffset = 0;           // added to y when no floor-level space exists
    XrSessionState state = XR_SESSION_STATE_UNKNOWN;
    bool running = false, exit = false;
    bool srgb = false;
    EyeTarget eyes[2];
    XrViewConfigurationView viewConfig[2];

    XrActionSet actionSet = XR_NULL_HANDLE;
    XrAction move = XR_NULL_HANDLE, turn = XR_NULL_HANDLE;
    XrAction btnA = XR_NULL_HANDLE, btnB = XR_NULL_HANDLE, btnX = XR_NULL_HANDLE, btnY = XR_NULL_HANDLE;
    XrAction trigL = XR_NULL_HANDLE, trigR = XR_NULL_HANDLE;

    EGLDisplay display = EGL_NO_DISPLAY;
    EGLConfig config = nullptr;
    EGLContext context = EGL_NO_CONTEXT;
    EGLSurface surface = EGL_NO_SURFACE;

    FramebufferTexture2DMultisampleFn fbTexMs = nullptr;
    RenderbufferStorageMultisampleFn rbStorageMs = nullptr;
    int samples = 1;
};

bool check(XrResult r, const char* what) {
    if (XR_FAILED(r)) {
        LOGE("%s failed: %d", what, (int)r);
        return false;
    }
    return true;
}

bool initEgl(Xr& xr) {
    xr.display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (!eglInitialize(xr.display, nullptr, nullptr)) return false;
    // The window surface is never shown: pick any RGBA8 ES3 config.
    EGLConfig configs[256];
    EGLint count = 0;
    eglGetConfigs(xr.display, configs, 256, &count);
    for (int i = 0; i < count && !xr.config; i++) {
        EGLint renderable = 0, surfaceType = 0, r = 0, g = 0, b = 0, a = 0, d = 0, s = 0;
        eglGetConfigAttrib(xr.display, configs[i], EGL_RENDERABLE_TYPE, &renderable);
        eglGetConfigAttrib(xr.display, configs[i], EGL_SURFACE_TYPE, &surfaceType);
        eglGetConfigAttrib(xr.display, configs[i], EGL_RED_SIZE, &r);
        eglGetConfigAttrib(xr.display, configs[i], EGL_GREEN_SIZE, &g);
        eglGetConfigAttrib(xr.display, configs[i], EGL_BLUE_SIZE, &b);
        eglGetConfigAttrib(xr.display, configs[i], EGL_ALPHA_SIZE, &a);
        eglGetConfigAttrib(xr.display, configs[i], EGL_DEPTH_SIZE, &d);
        eglGetConfigAttrib(xr.display, configs[i], EGL_SAMPLES, &s);
        if ((renderable & EGL_OPENGL_ES3_BIT) && (surfaceType & EGL_PBUFFER_BIT) && r == 8 && g == 8 && b == 8 &&
            a == 8 && d == 0 && s == 0)
            xr.config = configs[i];
    }
    if (!xr.config) {
        LOGE("no EGL config");
        return false;
    }
    EGLint ctxAttr[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
    xr.context = eglCreateContext(xr.display, xr.config, EGL_NO_CONTEXT, ctxAttr);
    EGLint pbAttr[] = {EGL_WIDTH, 16, EGL_HEIGHT, 16, EGL_NONE};
    xr.surface = eglCreatePbufferSurface(xr.display, xr.config, pbAttr);
    if (xr.context == EGL_NO_CONTEXT || xr.surface == EGL_NO_SURFACE) {
        LOGE("EGL context/surface creation failed");
        return false;
    }
    if (!eglMakeCurrent(xr.display, xr.surface, xr.surface, xr.context)) return false;

    const char* ext = (const char*)glGetString(GL_EXTENSIONS);
    if (ext && strstr(ext, "GL_EXT_multisampled_render_to_texture")) {
        xr.fbTexMs = (FramebufferTexture2DMultisampleFn)eglGetProcAddress("glFramebufferTexture2DMultisampleEXT");
        xr.rbStorageMs = (RenderbufferStorageMultisampleFn)eglGetProcAddress("glRenderbufferStorageMultisampleEXT");
        if (xr.fbTexMs && xr.rbStorageMs) xr.samples = 4;
    }
    LOGI("GL: %s, MSAA x%d", (const char*)glGetString(GL_RENDERER), xr.samples);
    return true;
}

bool hasExtension(const std::vector<XrExtensionProperties>& list, const char* name) {
    for (auto& e : list)
        if (!strcmp(e.extensionName, name)) return true;
    return false;
}

bool initInstance(Xr& xr, android_app* app) {
    PFN_xrInitializeLoaderKHR initLoader = nullptr;
    xrGetInstanceProcAddr(XR_NULL_HANDLE, "xrInitializeLoaderKHR", (PFN_xrVoidFunction*)&initLoader);
    if (!initLoader) {
        LOGE("xrInitializeLoaderKHR not found");
        return false;
    }
    XrLoaderInitInfoAndroidKHR loaderInfo = {XR_TYPE_LOADER_INIT_INFO_ANDROID_KHR};
    loaderInfo.applicationVM = app->activity->vm;
    loaderInfo.applicationContext = app->activity->clazz;
    if (!check(initLoader((const XrLoaderInitInfoBaseHeaderKHR*)&loaderInfo), "xrInitializeLoaderKHR")) return false;

    uint32_t n = 0;
    xrEnumerateInstanceExtensionProperties(nullptr, 0, &n, nullptr);
    std::vector<XrExtensionProperties> exts(n, {XR_TYPE_EXTENSION_PROPERTIES});
    xrEnumerateInstanceExtensionProperties(nullptr, n, &n, exts.data());

    std::vector<const char*> enabled = {XR_KHR_ANDROID_CREATE_INSTANCE_EXTENSION_NAME,
                                        XR_KHR_OPENGL_ES_ENABLE_EXTENSION_NAME};
    bool localFloor = hasExtension(exts, "XR_EXT_local_floor");
    if (localFloor) enabled.push_back("XR_EXT_local_floor");

    XrInstanceCreateInfoAndroidKHR androidInfo = {XR_TYPE_INSTANCE_CREATE_INFO_ANDROID_KHR};
    androidInfo.applicationVM = app->activity->vm;
    androidInfo.applicationActivity = app->activity->clazz;
    XrInstanceCreateInfo ci = {XR_TYPE_INSTANCE_CREATE_INFO};
    ci.next = &androidInfo;
    strncpy(ci.applicationInfo.applicationName, "Seoul Line 1 VR", XR_MAX_APPLICATION_NAME_SIZE - 1);
    strncpy(ci.applicationInfo.engineName, "line1vr", XR_MAX_ENGINE_NAME_SIZE - 1);
    ci.applicationInfo.applicationVersion = 1;
    ci.applicationInfo.apiVersion = XR_MAKE_VERSION(1, 0, 0);
    ci.enabledExtensionCount = (uint32_t)enabled.size();
    ci.enabledExtensionNames = enabled.data();
    if (!check(xrCreateInstance(&ci, &xr.instance), "xrCreateInstance")) return false;

    XrSystemGetInfo si = {XR_TYPE_SYSTEM_GET_INFO};
    si.formFactor = XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY;
    if (!check(xrGetSystem(xr.instance, &si, &xr.systemId), "xrGetSystem")) return false;

    XrGraphicsRequirementsOpenGLESKHR req = {XR_TYPE_GRAPHICS_REQUIREMENTS_OPENGL_ES_KHR};
    PFN_xrGetOpenGLESGraphicsRequirementsKHR getReq = nullptr;
    xrGetInstanceProcAddr(xr.instance, "xrGetOpenGLESGraphicsRequirementsKHR", (PFN_xrVoidFunction*)&getReq);
    if (getReq) getReq(xr.instance, xr.systemId, &req);
    return true;
}

XrPath path(Xr& xr, const char* s) {
    XrPath p = XR_NULL_PATH;
    xrStringToPath(xr.instance, s, &p);
    return p;
}

XrAction makeAction(Xr& xr, const char* name, const char* label, XrActionType type) {
    XrActionCreateInfo ai = {XR_TYPE_ACTION_CREATE_INFO};
    ai.actionType = type;
    strncpy(ai.actionName, name, XR_MAX_ACTION_NAME_SIZE - 1);
    strncpy(ai.localizedActionName, label, XR_MAX_LOCALIZED_ACTION_NAME_SIZE - 1);
    XrAction a = XR_NULL_HANDLE;
    check(xrCreateAction(xr.actionSet, &ai, &a), "xrCreateAction");
    return a;
}

bool initSession(Xr& xr) {
    XrGraphicsBindingOpenGLESAndroidKHR gb = {XR_TYPE_GRAPHICS_BINDING_OPENGL_ES_ANDROID_KHR};
    gb.display = xr.display;
    gb.config = xr.config;
    gb.context = xr.context;
    XrSessionCreateInfo sci = {XR_TYPE_SESSION_CREATE_INFO};
    sci.next = &gb;
    sci.systemId = xr.systemId;
    if (!check(xrCreateSession(xr.instance, &sci, &xr.session), "xrCreateSession")) return false;

    // Floor-level reference space: LOCAL_FLOOR, else STAGE, else LOCAL lowered by a typical eye height.
    uint32_t n = 0;
    xrEnumerateReferenceSpaces(xr.session, 0, &n, nullptr);
    std::vector<XrReferenceSpaceType> spaces(n);
    xrEnumerateReferenceSpaces(xr.session, n, &n, spaces.data());
    auto has = [&](XrReferenceSpaceType t) {
        for (auto s : spaces)
            if (s == t) return true;
        return false;
    };
    const XrReferenceSpaceType LOCAL_FLOOR = (XrReferenceSpaceType)1000426000;
    XrReferenceSpaceCreateInfo rs = {XR_TYPE_REFERENCE_SPACE_CREATE_INFO};
    rs.poseInReferenceSpace.orientation.w = 1;
    if (has(LOCAL_FLOOR)) {
        rs.referenceSpaceType = LOCAL_FLOOR;
    } else if (has(XR_REFERENCE_SPACE_TYPE_STAGE)) {
        rs.referenceSpaceType = XR_REFERENCE_SPACE_TYPE_STAGE;
    } else {
        rs.referenceSpaceType = XR_REFERENCE_SPACE_TYPE_LOCAL;
        xr.floorOffset = 1.6f;
    }
    if (!check(xrCreateReferenceSpace(xr.session, &rs, &xr.stage), "xrCreateReferenceSpace")) return false;
    rs.referenceSpaceType = XR_REFERENCE_SPACE_TYPE_VIEW;
    if (!check(xrCreateReferenceSpace(xr.session, &rs, &xr.viewSpace), "xrCreateReferenceSpace(view)")) return false;

    // Input.
    XrActionSetCreateInfo asi = {XR_TYPE_ACTION_SET_CREATE_INFO};
    strcpy(asi.actionSetName, "ride");
    strcpy(asi.localizedActionSetName, "Ride");
    if (!check(xrCreateActionSet(xr.instance, &asi, &xr.actionSet), "xrCreateActionSet")) return false;
    xr.move = makeAction(xr, "move", "Walk", XR_ACTION_TYPE_VECTOR2F_INPUT);
    xr.turn = makeAction(xr, "turn", "Turn", XR_ACTION_TYPE_VECTOR2F_INPUT);
    xr.btnA = makeAction(xr, "cab", "Cab / cabin", XR_ACTION_TYPE_BOOLEAN_INPUT);
    xr.btnB = makeAction(xr, "speed", "Time scale", XR_ACTION_TYPE_BOOLEAN_INPUT);
    xr.btnX = makeAction(xr, "skip", "Next station", XR_ACTION_TYPE_BOOLEAN_INPUT);
    xr.btnY = makeAction(xr, "manual", "Manual driving", XR_ACTION_TYPE_BOOLEAN_INPUT);
    xr.trigL = makeAction(xr, "brake", "Brake", XR_ACTION_TYPE_FLOAT_INPUT);
    xr.trigR = makeAction(xr, "power", "Power", XR_ACTION_TYPE_FLOAT_INPUT);
    XrActionSuggestedBinding b[] = {
        {xr.move, path(xr, "/user/hand/left/input/thumbstick")},
        {xr.turn, path(xr, "/user/hand/right/input/thumbstick")},
        {xr.btnA, path(xr, "/user/hand/right/input/a/click")},
        {xr.btnB, path(xr, "/user/hand/right/input/b/click")},
        {xr.btnX, path(xr, "/user/hand/left/input/x/click")},
        {xr.btnY, path(xr, "/user/hand/left/input/y/click")},
        {xr.trigL, path(xr, "/user/hand/left/input/trigger/value")},
        {xr.trigR, path(xr, "/user/hand/right/input/trigger/value")},
    };
    XrInteractionProfileSuggestedBinding sb = {XR_TYPE_INTERACTION_PROFILE_SUGGESTED_BINDING};
    sb.interactionProfile = path(xr, "/interaction_profiles/oculus/touch_controller");
    sb.suggestedBindings = b;
    sb.countSuggestedBindings = sizeof(b) / sizeof(b[0]);
    check(xrSuggestInteractionProfileBindings(xr.instance, &sb), "xrSuggestInteractionProfileBindings");
    XrSessionActionSetsAttachInfo at = {XR_TYPE_SESSION_ACTION_SETS_ATTACH_INFO};
    at.countActionSets = 1;
    at.actionSets = &xr.actionSet;
    check(xrAttachSessionActionSets(xr.session, &at), "xrAttachSessionActionSets");

    // Swapchains, one per eye.
    uint32_t viewCount = 0;
    xr.viewConfig[0] = {XR_TYPE_VIEW_CONFIGURATION_VIEW};
    xr.viewConfig[1] = {XR_TYPE_VIEW_CONFIGURATION_VIEW};
    if (!check(xrEnumerateViewConfigurationViews(xr.instance, xr.systemId, XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO, 2,
                                                 &viewCount, xr.viewConfig),
               "xrEnumerateViewConfigurationViews") ||
        viewCount != 2)
        return false;
    uint32_t fn = 0;
    xrEnumerateSwapchainFormats(xr.session, 0, &fn, nullptr);
    std::vector<int64_t> formats(fn);
    xrEnumerateSwapchainFormats(xr.session, fn, &fn, formats.data());
    int64_t format = 0;
    for (int64_t f : formats)
        if (f == GL_SRGB8_ALPHA8) format = f;
    if (!format)
        for (int64_t f : formats)
            if (f == GL_RGBA8) format = f;
    if (!format && !formats.empty()) format = formats[0];
    xr.srgb = format == GL_SRGB8_ALPHA8;

    for (int e = 0; e < 2; e++) {
        EyeTarget& t = xr.eyes[e];
        t.width = (int32_t)xr.viewConfig[e].recommendedImageRectWidth;
        t.height = (int32_t)xr.viewConfig[e].recommendedImageRectHeight;
        XrSwapchainCreateInfo sc = {XR_TYPE_SWAPCHAIN_CREATE_INFO};
        sc.usageFlags = XR_SWAPCHAIN_USAGE_COLOR_ATTACHMENT_BIT | XR_SWAPCHAIN_USAGE_SAMPLED_BIT;
        sc.format = format;
        sc.sampleCount = 1;
        sc.width = (uint32_t)t.width;
        sc.height = (uint32_t)t.height;
        sc.faceCount = 1;
        sc.arraySize = 1;
        sc.mipCount = 1;
        if (!check(xrCreateSwapchain(xr.session, &sc, &t.swapchain), "xrCreateSwapchain")) return false;
        uint32_t ic = 0;
        xrEnumerateSwapchainImages(t.swapchain, 0, &ic, nullptr);
        t.images.assign(ic, {XR_TYPE_SWAPCHAIN_IMAGE_OPENGL_ES_KHR});
        xrEnumerateSwapchainImages(t.swapchain, ic, &ic, (XrSwapchainImageBaseHeader*)t.images.data());

        auto buildTargets = [&](int samples) {
            glGenRenderbuffers(1, &t.depth);
            glBindRenderbuffer(GL_RENDERBUFFER, t.depth);
            if (samples > 1)
                xr.rbStorageMs(GL_RENDERBUFFER, samples, GL_DEPTH_COMPONENT24, t.width, t.height);
            else
                glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH_COMPONENT24, t.width, t.height);
            t.fbos.resize(ic);
            glGenFramebuffers((GLsizei)ic, t.fbos.data());
            bool ok = true;
            for (uint32_t i = 0; i < ic; i++) {
                glBindFramebuffer(GL_FRAMEBUFFER, t.fbos[i]);
                if (samples > 1)
                    xr.fbTexMs(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, t.images[i].image, 0, samples);
                else
                    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, t.images[i].image, 0);
                glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, t.depth);
                if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) ok = false;
            }
            glBindFramebuffer(GL_FRAMEBUFFER, 0);
            return ok;
        };
        if (!buildTargets(xr.samples)) {
            LOGI("multisampled framebuffer incomplete, falling back to no MSAA");
            glDeleteFramebuffers((GLsizei)t.fbos.size(), t.fbos.data());
            glDeleteRenderbuffers(1, &t.depth);
            xr.samples = 1;
            if (!buildTargets(1)) {
                LOGE("framebuffer incomplete");
                return false;
            }
        }
    }
    LOGI("swapchains %dx%d, sRGB=%d", xr.eyes[0].width, xr.eyes[0].height, (int)xr.srgb);
    return true;
}

void pollXrEvents(Xr& xr) {
    XrEventDataBuffer ev = {XR_TYPE_EVENT_DATA_BUFFER};
    while (xrPollEvent(xr.instance, &ev) == XR_SUCCESS) {
        if (ev.type == XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED) {
            auto* sc = (XrEventDataSessionStateChanged*)&ev;
            xr.state = sc->state;
            if (sc->state == XR_SESSION_STATE_READY) {
                XrSessionBeginInfo bi = {XR_TYPE_SESSION_BEGIN_INFO};
                bi.primaryViewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
                xr.running = check(xrBeginSession(xr.session, &bi), "xrBeginSession");
                if (xr.running) audioStart();
            } else if (sc->state == XR_SESSION_STATE_STOPPING) {
                xr.running = false;
                audioStop();
                xrEndSession(xr.session);
            } else if (sc->state == XR_SESSION_STATE_EXITING || sc->state == XR_SESSION_STATE_LOSS_PENDING) {
                xr.exit = true;
            }
        } else if (ev.type == XR_TYPE_EVENT_DATA_INSTANCE_LOSS_PENDING) {
            xr.exit = true;
        }
        ev = {XR_TYPE_EVENT_DATA_BUFFER};
    }
}

M4 poseMatrix(const XrPosef& p, float yOffset) {
    float x = p.orientation.x, y = p.orientation.y, z = p.orientation.z, w = p.orientation.w;
    M4 m = m4Identity();
    m.m[0] = 1 - 2 * (y * y + z * z);
    m.m[1] = 2 * (x * y + z * w);
    m.m[2] = 2 * (x * z - y * w);
    m.m[4] = 2 * (x * y - z * w);
    m.m[5] = 1 - 2 * (x * x + z * z);
    m.m[6] = 2 * (y * z + x * w);
    m.m[8] = 2 * (x * z + y * w);
    m.m[9] = 2 * (y * z - x * w);
    m.m[10] = 1 - 2 * (x * x + y * y);
    m.m[12] = p.position.x;
    m.m[13] = p.position.y + yOffset;
    m.m[14] = p.position.z;
    return m;
}

void readInput(Xr& xr, XrTime time, Input& in) {
    if (xr.state == XR_SESSION_STATE_FOCUSED) {
        XrActiveActionSet active = {xr.actionSet, XR_NULL_PATH};
        XrActionsSyncInfo si = {XR_TYPE_ACTIONS_SYNC_INFO};
        si.countActiveActionSets = 1;
        si.activeActionSets = &active;
        xrSyncActions(xr.session, &si);
        auto vec2 = [&](XrAction a, float& x, float& y) {
            XrActionStateGetInfo gi = {XR_TYPE_ACTION_STATE_GET_INFO};
            gi.action = a;
            XrActionStateVector2f s = {XR_TYPE_ACTION_STATE_VECTOR2F};
            if (XR_SUCCEEDED(xrGetActionStateVector2f(xr.session, &gi, &s)) && s.isActive) {
                x = s.currentState.x;
                y = s.currentState.y;
            }
        };
        auto boolean = [&](XrAction a) {
            XrActionStateGetInfo gi = {XR_TYPE_ACTION_STATE_GET_INFO};
            gi.action = a;
            XrActionStateBoolean s = {XR_TYPE_ACTION_STATE_BOOLEAN};
            return XR_SUCCEEDED(xrGetActionStateBoolean(xr.session, &gi, &s)) && s.isActive && s.currentState;
        };
        auto scalar = [&](XrAction a) {
            XrActionStateGetInfo gi = {XR_TYPE_ACTION_STATE_GET_INFO};
            gi.action = a;
            XrActionStateFloat s = {XR_TYPE_ACTION_STATE_FLOAT};
            if (XR_SUCCEEDED(xrGetActionStateFloat(xr.session, &gi, &s)) && s.isActive) return s.currentState;
            return 0.f;
        };
        float unused = 0;
        vec2(xr.move, in.moveX, in.moveY);
        vec2(xr.turn, in.turnX, unused);
        in.a = boolean(xr.btnA);
        in.b = boolean(xr.btnB);
        in.x = boolean(xr.btnX);
        in.y = boolean(xr.btnY);
        in.trigL = scalar(xr.trigL);
        in.trigR = scalar(xr.trigR);
    }
    XrSpaceLocation loc = {XR_TYPE_SPACE_LOCATION};
    if (XR_SUCCEEDED(xrLocateSpace(xr.viewSpace, xr.stage, time, &loc)) &&
        (loc.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT)) {
        M4 h = poseMatrix(loc.pose, 0);
        in.headFwdX = -h.m[8];
        in.headFwdZ = -h.m[10];
        if (loc.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) {
            in.headX = loc.pose.position.x;
            in.headZ = loc.pose.position.z;
        }
    }
}

void renderFrame(Xr& xr, App& app, double& lastTime) {
    XrFrameWaitInfo wi = {XR_TYPE_FRAME_WAIT_INFO};
    XrFrameState fs = {XR_TYPE_FRAME_STATE};
    if (!check(xrWaitFrame(xr.session, &wi, &fs), "xrWaitFrame")) return;
    XrFrameBeginInfo bi = {XR_TYPE_FRAME_BEGIN_INFO};
    if (!check(xrBeginFrame(xr.session, &bi), "xrBeginFrame")) return;

    timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    double now = ts.tv_sec + ts.tv_nsec * 1e-9;
    float dt = lastTime > 0 ? (float)(now - lastTime) : 0.f;
    lastTime = now;

    static Input in;
    Input cur;
    cur.headX = in.headX;
    cur.headZ = in.headZ;
    cur.headFwdX = in.headFwdX;
    cur.headFwdZ = in.headFwdZ;
    readInput(xr, fs.predictedDisplayTime, cur);
    in = cur;
    app.update(dt, in);
    audioUpdate(app.audio());

    XrCompositionLayerProjectionView pv[2];
    XrCompositionLayerProjection layer = {XR_TYPE_COMPOSITION_LAYER_PROJECTION};
    const XrCompositionLayerBaseHeader* layers[1];
    uint32_t layerCount = 0;

    if (fs.shouldRender) {
        XrViewLocateInfo li = {XR_TYPE_VIEW_LOCATE_INFO};
        li.viewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
        li.displayTime = fs.predictedDisplayTime;
        li.space = xr.stage;
        XrViewState vs = {XR_TYPE_VIEW_STATE};
        XrView views[2] = {{XR_TYPE_VIEW}, {XR_TYPE_VIEW}};
        uint32_t count = 0;
        XrResult r = xrLocateViews(xr.session, &li, &vs, 2, &count, views);
        if (XR_SUCCEEDED(r) && count == 2 && (vs.viewStateFlags & XR_VIEW_STATE_ORIENTATION_VALID_BIT)) {
            for (int e = 0; e < 2; e++) {
                EyeTarget& t = xr.eyes[e];
                uint32_t index = 0;
                XrSwapchainImageAcquireInfo ai = {XR_TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO};
                xrAcquireSwapchainImage(t.swapchain, &ai, &index);
                XrSwapchainImageWaitInfo wait = {XR_TYPE_SWAPCHAIN_IMAGE_WAIT_INFO};
                wait.timeout = XR_INFINITE_DURATION;
                xrWaitSwapchainImage(t.swapchain, &wait);

                glBindFramebuffer(GL_FRAMEBUFFER, t.fbos[index]);
                glViewport(0, 0, t.width, t.height);
                M4 eyePose = poseMatrix(views[e].pose, xr.floorOffset);
                const XrFovf& f = views[e].fov;
                M4 proj = m4Proj(tanf(f.angleLeft), tanf(f.angleRight), tanf(f.angleUp), tanf(f.angleDown), 0.1f, 6000.f);
                app.render(m4InvRigid(eyePose), proj, xr.srgb ? 2.2f : 1.f);
                GLenum discard[] = {GL_DEPTH_ATTACHMENT};
                glInvalidateFramebuffer(GL_FRAMEBUFFER, 1, discard);
                glBindFramebuffer(GL_FRAMEBUFFER, 0);

                XrSwapchainImageReleaseInfo ri = {XR_TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO};
                xrReleaseSwapchainImage(t.swapchain, &ri);

                pv[e] = {XR_TYPE_COMPOSITION_LAYER_PROJECTION_VIEW};
                pv[e].pose = views[e].pose;
                pv[e].fov = views[e].fov;
                pv[e].subImage.swapchain = t.swapchain;
                pv[e].subImage.imageRect.offset = {0, 0};
                pv[e].subImage.imageRect.extent = {t.width, t.height};
            }
            layer.space = xr.stage;
            layer.viewCount = 2;
            layer.views = pv;
            layers[0] = (const XrCompositionLayerBaseHeader*)&layer;
            layerCount = 1;
        }
    }

    XrFrameEndInfo ei = {XR_TYPE_FRAME_END_INFO};
    ei.displayTime = fs.predictedDisplayTime;
    ei.environmentBlendMode = XR_ENVIRONMENT_BLEND_MODE_OPAQUE;
    ei.layerCount = layerCount;
    ei.layers = layerCount ? layers : nullptr;
    xrEndFrame(xr.session, &ei);
}

void onAppCmd(android_app*, int32_t) {}

}  // namespace

void android_main(android_app* app) {
    gAndroidApp = app;
    app->onAppCmd = onAppCmd;
    JNIEnv* env = nullptr;
    app->activity->vm->AttachCurrentThread(&env, nullptr);

    Xr xr;
    App game;
    bool ok = initInstance(xr, app) && initEgl(xr) && initSession(xr) && game.init();
    if (!ok) LOGE("initialisation failed");

    double lastTime = 0;
    while (!app->destroyRequested && ok && !xr.exit) {
        // Block for Android events only while no XR session is running.
        for (;;) {
            int events = 0;
            android_poll_source* source = nullptr;
            int id = ALooper_pollOnce(xr.running ? 0 : 100, nullptr, &events, (void**)&source);
            if (id < 0) break;
            if (source) source->process(app, source);
            if (app->destroyRequested) break;
        }
        pollXrEvents(xr);
        if (xr.running) {
            renderFrame(xr, game, lastTime);
        } else {
            lastTime = 0;
        }
    }

    audioStop();
    if (ok) game.shutdown();
    for (auto& t : xr.eyes)
        if (t.swapchain != XR_NULL_HANDLE) xrDestroySwapchain(t.swapchain);
    if (xr.session != XR_NULL_HANDLE) xrDestroySession(xr.session);
    if (xr.instance != XR_NULL_HANDLE) xrDestroyInstance(xr.instance);
    if (xr.display != EGL_NO_DISPLAY) {
        eglMakeCurrent(xr.display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
        if (xr.surface != EGL_NO_SURFACE) eglDestroySurface(xr.display, xr.surface);
        if (xr.context != EGL_NO_CONTEXT) eglDestroyContext(xr.display, xr.context);
        eglTerminate(xr.display);
    }
    ANativeActivity_finish(app->activity);
    // Let the activity finish cleanly.
    while (!app->destroyRequested) {
        int events = 0;
        android_poll_source* source = nullptr;
        if (ALooper_pollOnce(100, nullptr, &events, (void**)&source) >= 0 && source) source->process(app, source);
    }
    app->activity->vm->DetachCurrentThread();
}
