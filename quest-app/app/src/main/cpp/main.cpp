// 퀘스트 검은 화면: OpenXR로 시야 전체를 검게 그리고, 자막 그림을 눈앞 정중앙에 띄웁니다.
//
// - 투영 레이어: 두 눈 모두 검은색으로만 채웁니다(작은 해상도, 배터리 절약).
// - 쿼드 레이어: 머리를 따라다니는(VIEW 공간) 판을 2미터 앞 정중앙에 두고, 자바에서 그려 준
//   자막 그림을 올립니다. 합성기가 직접 샘플링하므로 글자가 선명합니다.
// - 컨트롤러 트리거를 빠르게 두 번 누르면 종료를 요청합니다.

#include <jni.h>
#include <android/log.h>

#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>

#define XR_USE_PLATFORM_ANDROID
#define XR_USE_GRAPHICS_API_OPENGL_ES
#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstring>
#include <mutex>
#include <thread>
#include <vector>

#define LOG_TAG "QuestBlack"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

#define XR_OK(call)                                                   \
    do {                                                              \
        XrResult r_ = (call);                                         \
        if (XR_FAILED(r_)) {                                          \
            LOGE("%s failed: %d (line %d)", #call, r_, __LINE__);     \
            return false;                                             \
        }                                                             \
    } while (0)

namespace {

constexpr int kEyeSize = 256;           // 검은색만 그리므로 아주 작게
constexpr float kCaptionDistance = 2.0f; // 눈앞 2미터

JavaVM* gVm = nullptr;
jobject gActivity = nullptr;
std::thread gThread;
std::atomic<bool> gRun{false};
std::atomic<bool> gExitRequested{false};
std::atomic<int> gStatus{0};  // 0 준비 중, 1 실행 중, -1 실패

// 자바에서 넘겨준 자막 그림 (RGBA, 미리 곱한 알파)
std::mutex gCapMutex;
std::vector<uint8_t> gCapPixels;
int gCapW = 0;
int gCapH = 0;
bool gCapDirty = false;
bool gCapVisible = false;
std::atomic<float> gCapWidthMeters{1.6f};

struct Swapchain {
    XrSwapchain handle = XR_NULL_HANDLE;
    int32_t width = 0;
    int32_t height = 0;
    std::vector<XrSwapchainImageOpenGLESKHR> images;
};

class App {
public:
    bool run();

private:
    bool initEgl();
    bool initXr();
    bool createSwapchain(int w, int h, int64_t format, Swapchain& out);
    bool initActions();
    void pollEvents();
    void pollActions();
    void renderFrame();
    void clearEye(Swapchain& sc);
    void uploadCaptionIfNeeded();
    void shutdown();

    EGLDisplay display_ = EGL_NO_DISPLAY;
    EGLConfig config_ = nullptr;
    EGLContext context_ = EGL_NO_CONTEXT;
    EGLSurface surface_ = EGL_NO_SURFACE;
    GLuint fbo_ = 0;

    XrInstance instance_ = XR_NULL_HANDLE;
    XrSystemId system_ = XR_NULL_SYSTEM_ID;
    XrSession session_ = XR_NULL_HANDLE;
    XrSpace localSpace_ = XR_NULL_HANDLE;
    XrSpace viewSpace_ = XR_NULL_HANDLE;
    XrSessionState state_ = XR_SESSION_STATE_UNKNOWN;
    bool sessionRunning_ = false;
    bool exitSent_ = false;
    bool quit_ = false;

    Swapchain eyes_[2];
    Swapchain caption_;
    bool captionHasImage_ = false;
    bool captionVisible_ = false;
    int64_t colorFormat_ = 0;

    XrActionSet actionSet_ = XR_NULL_HANDLE;
    XrAction pressAction_ = XR_NULL_HANDLE;
    XrPath handPaths_[2] = {XR_NULL_PATH, XR_NULL_PATH};
    std::chrono::steady_clock::time_point lastPress_{};
    bool hasLastPress_ = false;
};

bool App::initEgl() {
    display_ = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (display_ == EGL_NO_DISPLAY || !eglInitialize(display_, nullptr, nullptr)) {
        LOGE("eglInitialize failed");
        return false;
    }
    const EGLint attribs[] = {
        EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8,
        EGL_DEPTH_SIZE, 0, EGL_STENCIL_SIZE, 0, EGL_SAMPLES, 0,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT_KHR,
        EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
        EGL_NONE};
    EGLint count = 0;
    if (!eglChooseConfig(display_, attribs, &config_, 1, &count) || count < 1) {
        LOGE("eglChooseConfig failed");
        return false;
    }
    const EGLint ctxAttribs[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
    context_ = eglCreateContext(display_, config_, EGL_NO_CONTEXT, ctxAttribs);
    if (context_ == EGL_NO_CONTEXT) {
        LOGE("eglCreateContext failed");
        return false;
    }
    const EGLint pbAttribs[] = {EGL_WIDTH, 16, EGL_HEIGHT, 16, EGL_NONE};
    surface_ = eglCreatePbufferSurface(display_, config_, pbAttribs);
    if (surface_ == EGL_NO_SURFACE || !eglMakeCurrent(display_, surface_, surface_, context_)) {
        LOGE("eglMakeCurrent failed");
        return false;
    }
    glGenFramebuffers(1, &fbo_);
    return true;
}

bool App::initXr() {
    PFN_xrInitializeLoaderKHR initLoader = nullptr;
    XR_OK(xrGetInstanceProcAddr(XR_NULL_HANDLE, "xrInitializeLoaderKHR",
                                reinterpret_cast<PFN_xrVoidFunction*>(&initLoader)));
    XrLoaderInitInfoAndroidKHR loaderInfo{XR_TYPE_LOADER_INIT_INFO_ANDROID_KHR};
    loaderInfo.applicationVM = gVm;
    loaderInfo.applicationContext = gActivity;
    XR_OK(initLoader(reinterpret_cast<const XrLoaderInitInfoBaseHeaderKHR*>(&loaderInfo)));

    const char* extensions[] = {XR_KHR_ANDROID_CREATE_INSTANCE_EXTENSION_NAME,
                                XR_KHR_OPENGL_ES_ENABLE_EXTENSION_NAME};
    XrInstanceCreateInfoAndroidKHR androidInfo{XR_TYPE_INSTANCE_CREATE_INFO_ANDROID_KHR};
    androidInfo.applicationVM = gVm;
    androidInfo.applicationActivity = gActivity;

    XrInstanceCreateInfo ci{XR_TYPE_INSTANCE_CREATE_INFO};
    ci.next = &androidInfo;
    std::strncpy(ci.applicationInfo.applicationName, "QuestBlackScreen", XR_MAX_APPLICATION_NAME_SIZE - 1);
    ci.applicationInfo.applicationVersion = 1;
    std::strncpy(ci.applicationInfo.engineName, "none", XR_MAX_ENGINE_NAME_SIZE - 1);
    ci.applicationInfo.apiVersion = XR_API_VERSION_1_0;
    ci.enabledExtensionCount = 2;
    ci.enabledExtensionNames = extensions;
    XR_OK(xrCreateInstance(&ci, &instance_));

    XrSystemGetInfo sysInfo{XR_TYPE_SYSTEM_GET_INFO};
    sysInfo.formFactor = XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY;
    XR_OK(xrGetSystem(instance_, &sysInfo, &system_));

    PFN_xrGetOpenGLESGraphicsRequirementsKHR getReqs = nullptr;
    XR_OK(xrGetInstanceProcAddr(instance_, "xrGetOpenGLESGraphicsRequirementsKHR",
                                reinterpret_cast<PFN_xrVoidFunction*>(&getReqs)));
    XrGraphicsRequirementsOpenGLESKHR reqs{XR_TYPE_GRAPHICS_REQUIREMENTS_OPENGL_ES_KHR};
    XR_OK(getReqs(instance_, system_, &reqs));

    XrGraphicsBindingOpenGLESAndroidKHR binding{XR_TYPE_GRAPHICS_BINDING_OPENGL_ES_ANDROID_KHR};
    binding.display = display_;
    binding.config = config_;
    binding.context = context_;
    XrSessionCreateInfo sci{XR_TYPE_SESSION_CREATE_INFO};
    sci.next = &binding;
    sci.systemId = system_;
    XR_OK(xrCreateSession(instance_, &sci, &session_));

    XrReferenceSpaceCreateInfo rs{XR_TYPE_REFERENCE_SPACE_CREATE_INFO};
    rs.poseInReferenceSpace.orientation.w = 1.0f;
    rs.referenceSpaceType = XR_REFERENCE_SPACE_TYPE_LOCAL;
    XR_OK(xrCreateReferenceSpace(session_, &rs, &localSpace_));
    rs.referenceSpaceType = XR_REFERENCE_SPACE_TYPE_VIEW;
    XR_OK(xrCreateReferenceSpace(session_, &rs, &viewSpace_));

    // 색 형식: sRGB가 있으면 사용 (자바 그림이 sRGB 값이므로 색이 정확합니다)
    uint32_t formatCount = 0;
    XR_OK(xrEnumerateSwapchainFormats(session_, 0, &formatCount, nullptr));
    std::vector<int64_t> formats(formatCount);
    XR_OK(xrEnumerateSwapchainFormats(session_, formatCount, &formatCount, formats.data()));
    colorFormat_ = formats.empty() ? GL_RGBA8 : formats[0];
    for (int64_t f : formats) {
        if (f == GL_SRGB8_ALPHA8) { colorFormat_ = f; break; }
        if (f == GL_RGBA8) colorFormat_ = f;
    }

    uint32_t viewCount = 0;
    XR_OK(xrEnumerateViewConfigurationViews(instance_, system_, XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO,
                                            0, &viewCount, nullptr));
    std::vector<XrViewConfigurationView> views(viewCount, {XR_TYPE_VIEW_CONFIGURATION_VIEW});
    XR_OK(xrEnumerateViewConfigurationViews(instance_, system_, XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO,
                                            viewCount, &viewCount, views.data()));
    if (viewCount < 2) {
        LOGE("expected 2 views, got %u", viewCount);
        return false;
    }
    for (int i = 0; i < 2; i++) {
        int w = std::min<int>(kEyeSize, static_cast<int>(views[i].maxImageRectWidth));
        int h = std::min<int>(kEyeSize, static_cast<int>(views[i].maxImageRectHeight));
        if (!createSwapchain(w, h, colorFormat_, eyes_[i])) return false;
    }
    return initActions();
}

bool App::createSwapchain(int w, int h, int64_t format, Swapchain& out) {
    XrSwapchainCreateInfo ci{XR_TYPE_SWAPCHAIN_CREATE_INFO};
    ci.usageFlags = XR_SWAPCHAIN_USAGE_COLOR_ATTACHMENT_BIT | XR_SWAPCHAIN_USAGE_SAMPLED_BIT |
                    XR_SWAPCHAIN_USAGE_TRANSFER_DST_BIT;
    ci.format = format;
    ci.sampleCount = 1;
    ci.width = static_cast<uint32_t>(w);
    ci.height = static_cast<uint32_t>(h);
    ci.faceCount = 1;
    ci.arraySize = 1;
    ci.mipCount = 1;
    XR_OK(xrCreateSwapchain(session_, &ci, &out.handle));
    out.width = w;
    out.height = h;
    uint32_t count = 0;
    XR_OK(xrEnumerateSwapchainImages(out.handle, 0, &count, nullptr));
    out.images.assign(count, {XR_TYPE_SWAPCHAIN_IMAGE_OPENGL_ES_KHR});
    XR_OK(xrEnumerateSwapchainImages(out.handle, count, &count,
                                     reinterpret_cast<XrSwapchainImageBaseHeader*>(out.images.data())));
    return true;
}

bool App::initActions() {
    XrActionSetCreateInfo asci{XR_TYPE_ACTION_SET_CREATE_INFO};
    std::strcpy(asci.actionSetName, "main");
    std::strcpy(asci.localizedActionSetName, "Main");
    XR_OK(xrCreateActionSet(instance_, &asci, &actionSet_));

    XR_OK(xrStringToPath(instance_, "/user/hand/left", &handPaths_[0]));
    XR_OK(xrStringToPath(instance_, "/user/hand/right", &handPaths_[1]));

    XrActionCreateInfo aci{XR_TYPE_ACTION_CREATE_INFO};
    aci.actionType = XR_ACTION_TYPE_BOOLEAN_INPUT;
    std::strcpy(aci.actionName, "press");
    std::strcpy(aci.localizedActionName, "Press");
    aci.countSubactionPaths = 2;
    aci.subactionPaths = handPaths_;
    XR_OK(xrCreateAction(actionSet_, &aci, &pressAction_));

    auto suggest = [&](const char* profile, const char* left, const char* right) -> bool {
        XrPath profilePath, l, r;
        XR_OK(xrStringToPath(instance_, profile, &profilePath));
        XR_OK(xrStringToPath(instance_, left, &l));
        XR_OK(xrStringToPath(instance_, right, &r));
        XrActionSuggestedBinding b[2] = {{pressAction_, l}, {pressAction_, r}};
        XrInteractionProfileSuggestedBinding s{XR_TYPE_INTERACTION_PROFILE_SUGGESTED_BINDING};
        s.interactionProfile = profilePath;
        s.countSuggestedBindings = 2;
        s.suggestedBindings = b;
        XR_OK(xrSuggestInteractionProfileBindings(instance_, &s));
        return true;
    };
    if (!suggest("/interaction_profiles/oculus/touch_controller",
                 "/user/hand/left/input/trigger/value", "/user/hand/right/input/trigger/value")) {
        return false;
    }
    // 손 추적 집기 등은 단순 컨트롤러 프로필로 들어오는 경우가 있습니다 (실패해도 계속)
    suggest("/interaction_profiles/khr/simple_controller",
            "/user/hand/left/input/select/click", "/user/hand/right/input/select/click");

    XrSessionActionSetsAttachInfo attach{XR_TYPE_SESSION_ACTION_SETS_ATTACH_INFO};
    attach.countActionSets = 1;
    attach.actionSets = &actionSet_;
    XR_OK(xrAttachSessionActionSets(session_, &attach));
    return true;
}

void App::pollEvents() {
    XrEventDataBuffer ev{XR_TYPE_EVENT_DATA_BUFFER};
    while (xrPollEvent(instance_, &ev) == XR_SUCCESS) {
        switch (ev.type) {
            case XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED: {
                const auto* e = reinterpret_cast<const XrEventDataSessionStateChanged*>(&ev);
                state_ = e->state;
                LOGI("session state %d", state_);
                if (state_ == XR_SESSION_STATE_READY) {
                    XrSessionBeginInfo bi{XR_TYPE_SESSION_BEGIN_INFO};
                    bi.primaryViewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
                    if (XR_SUCCEEDED(xrBeginSession(session_, &bi))) {
                        sessionRunning_ = true;
                        gStatus = 1;
                    }
                } else if (state_ == XR_SESSION_STATE_STOPPING) {
                    xrEndSession(session_);
                    sessionRunning_ = false;
                } else if (state_ == XR_SESSION_STATE_EXITING || state_ == XR_SESSION_STATE_LOSS_PENDING) {
                    sessionRunning_ = false;
                    quit_ = true;
                    gExitRequested = true;
                }
                break;
            }
            case XR_TYPE_EVENT_DATA_INSTANCE_LOSS_PENDING:
                quit_ = true;
                gExitRequested = true;
                break;
            default:
                break;
        }
        ev = {XR_TYPE_EVENT_DATA_BUFFER};
    }
}

void App::pollActions() {
    XrActiveActionSet active{actionSet_, XR_NULL_PATH};
    XrActionsSyncInfo sync{XR_TYPE_ACTIONS_SYNC_INFO};
    sync.countActiveActionSets = 1;
    sync.activeActionSets = &active;
    if (XR_FAILED(xrSyncActions(session_, &sync))) return;
    for (XrPath hand : handPaths_) {
        XrActionStateGetInfo gi{XR_TYPE_ACTION_STATE_GET_INFO};
        gi.action = pressAction_;
        gi.subactionPath = hand;
        XrActionStateBoolean st{XR_TYPE_ACTION_STATE_BOOLEAN};
        if (XR_FAILED(xrGetActionStateBoolean(session_, &gi, &st))) continue;
        if (st.isActive && st.changedSinceLastSync && st.currentState) {
            auto now = std::chrono::steady_clock::now();
            if (hasLastPress_ && now - lastPress_ < std::chrono::milliseconds(600)) {
                gExitRequested = true;
                hasLastPress_ = false;
            } else {
                lastPress_ = now;
                hasLastPress_ = true;
            }
        }
    }
}

void App::clearEye(Swapchain& sc) {
    uint32_t index = 0;
    XrSwapchainImageAcquireInfo ai{XR_TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO};
    if (XR_FAILED(xrAcquireSwapchainImage(sc.handle, &ai, &index))) return;
    XrSwapchainImageWaitInfo wi{XR_TYPE_SWAPCHAIN_IMAGE_WAIT_INFO};
    wi.timeout = XR_INFINITE_DURATION;
    xrWaitSwapchainImage(sc.handle, &wi);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo_);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, sc.images[index].image, 0);
    glViewport(0, 0, sc.width, sc.height);
    glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    XrSwapchainImageReleaseInfo ri{XR_TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO};
    xrReleaseSwapchainImage(sc.handle, &ri);
}

void App::uploadCaptionIfNeeded() {
    std::vector<uint8_t> pixels;
    int w = 0, h = 0;
    {
        std::lock_guard<std::mutex> lock(gCapMutex);
        captionVisible_ = gCapVisible;
        if (!gCapDirty) return;
        gCapDirty = false;
        pixels.swap(gCapPixels);
        w = gCapW;
        h = gCapH;
    }
    if (w <= 0 || h <= 0 || pixels.size() < static_cast<size_t>(w) * h * 4) return;

    if (caption_.handle != XR_NULL_HANDLE && (caption_.width != w || caption_.height != h)) {
        xrDestroySwapchain(caption_.handle);
        caption_ = Swapchain();
        captionHasImage_ = false;
    }
    if (caption_.handle == XR_NULL_HANDLE && !createSwapchain(w, h, colorFormat_, caption_)) {
        caption_ = Swapchain();
        return;
    }

    uint32_t index = 0;
    XrSwapchainImageAcquireInfo ai{XR_TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO};
    if (XR_FAILED(xrAcquireSwapchainImage(caption_.handle, &ai, &index))) return;
    XrSwapchainImageWaitInfo wi{XR_TYPE_SWAPCHAIN_IMAGE_WAIT_INFO};
    wi.timeout = XR_INFINITE_DURATION;
    xrWaitSwapchainImage(caption_.handle, &wi);
    glBindTexture(GL_TEXTURE_2D, caption_.images[index].image);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());
    glBindTexture(GL_TEXTURE_2D, 0);
    glFlush();
    XrSwapchainImageReleaseInfo ri{XR_TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO};
    xrReleaseSwapchainImage(caption_.handle, &ri);
    captionHasImage_ = true;
}

void App::renderFrame() {
    XrFrameWaitInfo fwi{XR_TYPE_FRAME_WAIT_INFO};
    XrFrameState fs{XR_TYPE_FRAME_STATE};
    if (XR_FAILED(xrWaitFrame(session_, &fwi, &fs))) return;
    XrFrameBeginInfo fbi{XR_TYPE_FRAME_BEGIN_INFO};
    if (XR_FAILED(xrBeginFrame(session_, &fbi))) return;

    if (state_ == XR_SESSION_STATE_FOCUSED) pollActions();

    std::vector<XrCompositionLayerBaseHeader*> layers;
    XrCompositionLayerProjection proj{XR_TYPE_COMPOSITION_LAYER_PROJECTION};
    XrCompositionLayerProjectionView pviews[2] = {{XR_TYPE_COMPOSITION_LAYER_PROJECTION_VIEW},
                                                  {XR_TYPE_COMPOSITION_LAYER_PROJECTION_VIEW}};
    XrCompositionLayerQuad quad{XR_TYPE_COMPOSITION_LAYER_QUAD};

    if (fs.shouldRender) {
        XrViewLocateInfo li{XR_TYPE_VIEW_LOCATE_INFO};
        li.viewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
        li.displayTime = fs.predictedDisplayTime;
        li.space = localSpace_;
        XrViewState vs{XR_TYPE_VIEW_STATE};
        XrView views[2] = {{XR_TYPE_VIEW}, {XR_TYPE_VIEW}};
        uint32_t located = 0;
        bool haveViews = XR_SUCCEEDED(xrLocateViews(session_, &li, &vs, 2, &located, views)) && located == 2;

        if (haveViews) {
            for (int i = 0; i < 2; i++) {
                clearEye(eyes_[i]);
                pviews[i].pose = views[i].pose;
                pviews[i].fov = views[i].fov;
                pviews[i].subImage.swapchain = eyes_[i].handle;
                pviews[i].subImage.imageRect.offset = {0, 0};
                pviews[i].subImage.imageRect.extent = {eyes_[i].width, eyes_[i].height};
                pviews[i].subImage.imageArrayIndex = 0;
            }
            proj.space = localSpace_;
            proj.viewCount = 2;
            proj.views = pviews;
            layers.push_back(reinterpret_cast<XrCompositionLayerBaseHeader*>(&proj));
        }

        uploadCaptionIfNeeded();
        if (captionVisible_ && captionHasImage_) {
            const float width = gCapWidthMeters.load();
            quad.layerFlags = XR_COMPOSITION_LAYER_BLEND_TEXTURE_SOURCE_ALPHA_BIT;
            quad.space = viewSpace_;
            quad.eyeVisibility = XR_EYE_VISIBILITY_BOTH;
            quad.subImage.swapchain = caption_.handle;
            quad.subImage.imageRect.offset = {0, 0};
            quad.subImage.imageRect.extent = {caption_.width, caption_.height};
            quad.subImage.imageArrayIndex = 0;
            quad.pose.orientation.w = 1.0f;
            quad.pose.position = {0.0f, 0.0f, -kCaptionDistance};
            quad.size = {width, width * static_cast<float>(caption_.height) / static_cast<float>(caption_.width)};
            layers.push_back(reinterpret_cast<XrCompositionLayerBaseHeader*>(&quad));
        }
    }

    XrFrameEndInfo fei{XR_TYPE_FRAME_END_INFO};
    fei.displayTime = fs.predictedDisplayTime;
    fei.environmentBlendMode = XR_ENVIRONMENT_BLEND_MODE_OPAQUE;
    fei.layerCount = static_cast<uint32_t>(layers.size());
    fei.layers = layers.data();
    xrEndFrame(session_, &fei);
}

void App::shutdown() {
    if (caption_.handle != XR_NULL_HANDLE) xrDestroySwapchain(caption_.handle);
    for (auto& e : eyes_) {
        if (e.handle != XR_NULL_HANDLE) xrDestroySwapchain(e.handle);
    }
    if (actionSet_ != XR_NULL_HANDLE) xrDestroyActionSet(actionSet_);
    if (viewSpace_ != XR_NULL_HANDLE) xrDestroySpace(viewSpace_);
    if (localSpace_ != XR_NULL_HANDLE) xrDestroySpace(localSpace_);
    if (session_ != XR_NULL_HANDLE) xrDestroySession(session_);
    if (instance_ != XR_NULL_HANDLE) xrDestroyInstance(instance_);
    if (display_ != EGL_NO_DISPLAY) {
        if (fbo_) glDeleteFramebuffers(1, &fbo_);
        eglMakeCurrent(display_, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
        if (surface_ != EGL_NO_SURFACE) eglDestroySurface(display_, surface_);
        if (context_ != EGL_NO_CONTEXT) eglDestroyContext(display_, context_);
        eglTerminate(display_);
    }
}

bool App::run() {
    if (!initEgl() || !initXr()) {
        gStatus = -1;
        shutdown();
        return false;
    }
    auto exitDeadline = std::chrono::steady_clock::time_point::max();
    while (!quit_) {
        pollEvents();
        if (!gRun.load()) {
            // 앱이 닫히는 중: 세션을 정상 종료하고 빠져나갑니다.
            if (!sessionRunning_) break;
            if (!exitSent_) {
                xrRequestExitSession(session_);
                exitSent_ = true;
                exitDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
            } else if (std::chrono::steady_clock::now() > exitDeadline) {
                break;
            }
        }
        if (!sessionRunning_) {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            continue;
        }
        renderFrame();
    }
    shutdown();
    return true;
}

void threadMain() {
    JNIEnv* env = nullptr;
    gVm->AttachCurrentThread(&env, nullptr);
    {
        App app;
        app.run();
    }
    gVm->DetachCurrentThread();
}

}  // namespace

extern "C" {

JNIEXPORT jint JNI_OnLoad(JavaVM* vm, void*) {
    gVm = vm;
    return JNI_VERSION_1_6;
}

JNIEXPORT void JNICALL Java_com_ghj_questblack_NativeBridge_start(JNIEnv* env, jclass, jobject activity,
                                                                 jfloat captionWidthMeters) {
    if (gRun.load()) return;
    if (gActivity) env->DeleteGlobalRef(gActivity);
    gActivity = env->NewGlobalRef(activity);
    gCapWidthMeters = captionWidthMeters;
    gExitRequested = false;
    gStatus = 0;
    gRun = true;
    gThread = std::thread(threadMain);
}

JNIEXPORT void JNICALL Java_com_ghj_questblack_NativeBridge_stop(JNIEnv* env, jclass) {
    gRun = false;
    if (gThread.joinable()) gThread.join();
    if (gActivity) {
        env->DeleteGlobalRef(gActivity);
        gActivity = nullptr;
    }
}

JNIEXPORT void JNICALL Java_com_ghj_questblack_NativeBridge_setCaption(JNIEnv* env, jclass, jobject buffer,
                                                                      jint width, jint height, jboolean visible) {
    std::lock_guard<std::mutex> lock(gCapMutex);
    gCapVisible = visible;
    if (buffer == nullptr || width <= 0 || height <= 0) return;
    auto* src = static_cast<uint8_t*>(env->GetDirectBufferAddress(buffer));
    jlong cap = env->GetDirectBufferCapacity(buffer);
    size_t need = static_cast<size_t>(width) * static_cast<size_t>(height) * 4;
    if (src == nullptr || cap < static_cast<jlong>(need)) return;
    gCapPixels.assign(src, src + need);
    gCapW = width;
    gCapH = height;
    gCapDirty = true;
}

JNIEXPORT void JNICALL Java_com_ghj_questblack_NativeBridge_setCaptionWidth(JNIEnv*, jclass, jfloat meters) {
    gCapWidthMeters = meters;
}

JNIEXPORT jboolean JNICALL Java_com_ghj_questblack_NativeBridge_consumeExitRequest(JNIEnv*, jclass) {
    return gExitRequested.exchange(false) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jint JNICALL Java_com_ghj_questblack_NativeBridge_status(JNIEnv*, jclass) {
    return gStatus.load();
}

}  // extern "C"
