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
    float accel = 0;      // m/s^2
    bool tunnel = true;
    int chimeCount = 0;   // incremented when the doors start to open or close
    double distance = 0;  // metres travelled, for rail joints
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
    void debugDoors(float open) { door_ = open; }
    void debugStatus(char* buf, int size) const;

private:
    enum State { DWELL, RUN, FADE_OUT, FADE_IN };

    void simulate(float dt, const Input& in);
    void movePlayer(float dt, const Input& in);
    void placeAtStation(int station);
    void turnAround();
    void buildDynamicText();
    double stopHead(int station) const;
    void carPose(int car, double& x, double& z, double& fx, double& fz) const;

    World world_;
    train::Meshes meshes_;
    Mesh dynText_, overlay_;

    // train
    int dir_ = 1;            // +1 towards Kwangwoon Univ.
    double head_ = 0;        // route distance of the front of the train
    double v_ = 0;           // m/s
    State state_ = DWELL;
    int next_ = 0;           // station being served or approached
    float dwell_ = 0;        // seconds left at the platform
    float door_ = 1;         // 0 closed .. 1 open
    bool doorTarget_ = true;
    bool manual_ = false;
    int speedIdx_ = 0;
    float fade_ = 0;         // 0 clear .. 1 black
    int pendingStation_ = -1;
    bool pendingTurn_ = false;
    double odo_ = 0;

    // player, in the coordinates of car `car_`
    int car_ = 0;
    float px_ = 0, pz_ = -8.6f, yaw_ = 0;
    bool turnLatch_ = false;
    Input prev_;

    // per-frame render state
    M4 carRel_[train::CARS];
    double originX_ = 0, originZ_ = 0;
    M4 stageRel_;
    V3 headPos_ = {0, 0, 0}, headDir_ = {0, 0, -1};
    AudioState audio_;
};
