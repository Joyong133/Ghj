// Platform independent part of the app: simulation and rendering.
#pragma once
#include "gfx.h"
#include "train.h"
#include "world.h"

struct Input {
    float moveX = 0, moveY = 0;  // left stick
    float turnX = 0;             // right stick
    bool a = false, b = false, x = false, y = false;
    float trigL = 0, trigR = 0;
    // Head pose in the play space (floor origin).
    float headX = 0, headZ = 0;
    float headFwdX = 0, headFwdZ = -1;
};

// Values the audio thread reads.
struct AudioState {
    float speed = 0;      // m/s
    bool tunnel = true;
    bool outside = false; // the listener is on a platform
    float pass = 0;       // 0..1 loudness of a train passing on the other track
    int chimeCount = 0;   // incremented when the doors start to open or close
    double distance = 0;  // metres travelled, for rail joints
};

// A horizontal frame of reference: origin and unit forward vector.
struct Frame {
    double ox = 0, oz = 0, fx = 0, fz = -1;
};

struct TrainState {
    int dir = 1;          // +1 towards Kwangwoon Univ.
    double head = 0;      // route distance of the front of the train
    double v = 0;         // m/s
    int next = 0;         // station being served or approached
    bool moving = false;
    float dwell = 0;      // seconds left at the platform
    float door = 1;       // 0 closed .. 1 open
    bool doorTarget = true;
    bool active = true;
};

class App {
public:
    bool init();
    void shutdown();
    void update(float dt, const Input& in);
    // eyeFromStage: view matrix of one eye relative to the play space.
    void render(const M4& eyeFromStage, const M4& proj, float gamma);
    const AudioState& audio() const { return audio_; }

    // Used by the desktop test harness.
    void debugPlace(int station, double extraMetres, int car, float x, float z, float yaw);
    void debugPlatform(float along, float fromEdge, float yaw);
    void debugDoors(float open) { a_.door = open; }
    void debugOther(int station, double extraMetres);
    void debugStatus(char* buf, int size) const;

private:
    enum Fade { FADE_NONE, FADE_OUT, FADE_IN };
    enum Where { IN_TRAIN, ON_PLATFORM };

    void simulate(float dt, const Input& in);
    void movePlayer(float dt, const Input& in);
    void placeAtStation(TrainState& t, int station);
    void turnAround();
    void reseedOther(bool force);
    bool autoStep(TrainState& t, float sdt, bool hold);
    void boardTrain(const Input& in, float z);
    void exitToPlatform();
    void enterFromPlatform();
    float psdOpen(int station, int side) const;
    void buildDynamicText();
    void buildGlows(V3 camRight, V3 camUp, V3 eye);
    void drawTrain(const Prog& p, const TrainState& t, const M4* cars, int pass, int from, int to);
    Env trainEnv(const TrainState& t, int car) const;
    double viewS() const;

    World world_;
    train::Meshes meshes_;
    Mesh dynText_, overlay_, glowMesh_;

    TrainState a_, b_;       // the player's train and the one on the other track
    bool manual_ = false;
    int speedIdx_ = 0;
    Fade fading_ = FADE_NONE;
    float fade_ = 0;         // 0 clear .. 1 black
    int pendingStation_ = -1;
    bool pendingTurn_ = false;
    double odo_ = 0;
    float time_ = 0, reseedTimer_ = 0;

    // player: in the frame of car `car_`, or of station `pst_` when on a platform
    Where where_ = IN_TRAIN;
    int car_ = 0, pst_ = 0, pside_ = 1;
    float px_ = 0, pz_ = -8.6f, yaw_ = 0;
    bool turnLatch_ = false;
    Input prev_;

    // per-frame render state
    M4 carA_[train::CARS], carB_[train::CARS];
    bool drawB_ = false;
    int dynCar_ = 0;
    double originX_ = 0, originZ_ = 0;
    M4 stageRel_;
    V3 headPos_ = {0, 0, 0}, headDir_ = {0, 0, -1};
    AudioState audio_;
};
