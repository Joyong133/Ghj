#include "app.h"

#include <cmath>
#include <cstdio>

#include "track.h"

using train::CARS;
using train::FLOOR;

namespace {
const double V_MAX = 80.0 / 3.6;
const double ACCEL = 0.85, BRAKE = 0.9;
const float DWELL_TIME = 25.f, TERMINAL_DWELL = 15.f;
const float SPEEDS[] = {1.f, 2.f, 4.f, 8.f};
const float PSD_TRAVEL = 0.9f;
const float PLAT_Y = (float)track::PLAT_Y;
const Col AMBER = {255, 176, 32, 255};
const Col GREEN = {96, 230, 120, 255};
const Col NAVY = {20, 52, 120, 255};

const V3 SKY_FOG = {0.80f, 0.87f, 0.94f}, TUNNEL_FOG = {0.015f, 0.015f, 0.02f};
const V3 SUN_DIR = {0.479f, 0.798f, 0.372f};

const Env ENV_OUT = {{0.58f, 0.64f, 0.76f}, {0.34f, 0.33f, 0.30f}, {0.85f, 0.80f, 0.68f}, {0.9f, 0.85f, 0.75f}, SUN_DIR,
                     SKY_FOG, 1.f / 1300.f, 0.f};
const Env ENV_TUNNEL = {{1, 1, 1}, {0.62f, 0.62f, 0.62f}, {0, 0, 0}, {0.35f, 0.35f, 0.33f}, {0, 1, 0},
                        TUNNEL_FOG, 1.f / 260.f, 0.9f};
const Env ENV_UNLIT = {{1, 1, 1}, {1, 1, 1}, {0, 0, 0}, {0, 0, 0}, {0, 1, 0}, {0, 0, 0}, 0.f, 0.f};

bool isTerminal(const TrainState& t) { return (t.dir > 0 && t.next == track::N - 1) || (t.dir < 0 && t.next == 0); }
// Route distance of the train front when it is stopped at a station.
double stopHead(const TrainState& t, int station) { return track::stationS(station) + t.dir * train::LENGTH * 0.5; }
bool atPlatform(const TrainState& t) { return t.v < 0.01 && fabs(t.head - stopHead(t, t.next)) < 0.05; }

Frame carFrame(const TrainState& t, int car) {
    double sc = t.head - t.dir * (train::CAB_FRONT + car * train::PITCH);
    double lat = t.dir * track::TRACK_OFFSET;  // trains keep left on Line 1
    double ax, az, bx, bz, tx, tz;
    track::pose(sc + t.dir * 7.0, lat, ax, az, tx, tz);
    track::pose(sc - t.dir * 7.0, lat, bx, bz, tx, tz);
    Frame f;
    f.ox = (ax + bx) * 0.5;
    f.oz = (az + bz) * 0.5;
    f.fx = ax - bx;
    f.fz = az - bz;
    double l = sqrt(f.fx * f.fx + f.fz * f.fz);
    f.fx /= l;
    f.fz /= l;
    return f;
}
Frame stationFrame(int i) {
    Frame f;
    track::stationFrame(i, f.ox, f.oz, f.fx, f.fz);
    return f;
}
// Local axes: x to the right, -z forward.
void toWorld(const Frame& f, double x, double z, double& wx, double& wz) {
    wx = f.ox - f.fz * x - f.fx * z;
    wz = f.oz + f.fx * x - f.fz * z;
}
void toLocal(const Frame& f, double wx, double wz, double& x, double& z) {
    double dx = wx - f.ox, dz = wz - f.oz;
    x = -f.fz * dx + f.fx * dz;
    z = -(f.fx * dx + f.fz * dz);
}
// Angle to add to a yaw when it is re-expressed from frame `from` in frame `to`.
float yawBetween(const Frame& from, const Frame& to) {
    return (float)atan2(from.fx * to.fz - from.fz * to.fx, from.fx * to.fx + from.fz * to.fz);
}
M4 frameMat(const Frame& f, double originX, double originZ) {
    M4 m = m4Identity();
    // columns: right, up, back (-forward), position
    m.m[0] = (float)-f.fz;
    m.m[2] = (float)f.fx;
    m.m[8] = (float)-f.fx;
    m.m[10] = (float)-f.fz;
    m.m[12] = (float)(f.ox - originX);
    m.m[14] = (float)(f.oz - originZ);
    return m;
}
}  // namespace

// ---------------------------------------------------------------- setup

bool App::init() {
    track::build();
    if (!gfx.init()) return false;
    world_.init();
    meshes_.init();
    MB mb;
    Col k = {0, 0, 0, 255};
    mb.quad({-1, -1, 0}, {1, -1, 0}, {1, 1, 0}, {-1, 1, 0}, 0, 0, 1, 1, 0, k, k, k, k);
    overlay_.upload(mb);
    placeAtStation(a_, 0);
    reseedOther(true);
    world_.update(a_.head, a_.dir, 1000);
    fade_ = 1;
    fading_ = FADE_IN;
    return true;
}

void App::shutdown() {
    world_.destroy();
    meshes_.destroy();
    dynText_.destroy();
    overlay_.destroy();
    glowMesh_.destroy();
}

void App::placeAtStation(TrainState& t, int station) {
    t.next = station;
    t.head = stopHead(t, station);
    t.v = 0;
    t.moving = false;
    t.dwell = isTerminal(t) ? TERMINAL_DWELL : DWELL_TIME;
    t.door = 1;
    t.doorTarget = true;
    t.active = true;
}

void App::turnAround() {
    // The player changes to a train on the opposite track, keeping the same
    // position inside the train.
    int station = a_.dir > 0 ? track::N - 1 : 0;
    a_.dir = -a_.dir;
    placeAtStation(a_, station);
    a_.dwell = DWELL_TIME;
}

// Puts the other train a few stations ahead of the player, coming this way.
void App::reseedOther(bool force) {
    b_.dir = -a_.dir;
    b_.active = false;
    for (int ahead = 3; ahead <= 5; ahead++) {
        int j = a_.next + a_.dir * ahead;
        if (j < 0) j = 0;
        if (j > track::N - 1) j = track::N - 1;
        double h = stopHead(b_, j);
        if (fabs(h - a_.head) < (force ? 500.0 : 900.0)) continue;
        if ((h - a_.head) * a_.dir < 0) continue;  // must be ahead
        placeAtStation(b_, j);
        b_.dwell = 10.f;
        return;
    }
}

void App::debugPlace(int station, double extraMetres, int car, float x, float z, float yaw) {
    placeAtStation(a_, station);
    a_.head += a_.dir * extraMetres;
    if (extraMetres != 0) {
        a_.door = 0;
        a_.doorTarget = false;
        a_.v = 15;
        a_.moving = true;
        a_.next = station + a_.dir;
        if (a_.next < 0 || a_.next >= track::N) a_.next = station;
    }
    fading_ = FADE_NONE;
    fade_ = 0;
    where_ = IN_TRAIN;
    car_ = car;
    px_ = x;
    pz_ = z;
    yaw_ = yaw;
    reseedOther(true);
    world_.update(viewS(), a_.dir, 1000);
}

void App::debugPlatform(float along, float fromEdge, float yaw) {
    where_ = ON_PLATFORM;
    pst_ = a_.next;
    pside_ = a_.dir;
    px_ = -((float)track::PLAT_EDGE + fromEdge) * pside_;
    pz_ = -along;
    yaw_ = yaw;
    world_.update(viewS(), a_.dir, 1000);
}

void App::debugOther(int station, double extraMetres) {
    placeAtStation(b_, station);
    b_.head += b_.dir * extraMetres;
    if (extraMetres != 0) {
        b_.door = 0;
        b_.doorTarget = false;
        b_.v = 15;
        b_.moving = true;
        b_.next = station + b_.dir;
    }
}

void App::debugStatus(char* buf, int size) const {
    long tris = 0, draws = 0;
    for (auto& kv : world_.chunks)
        for (const Mesh* m : {&kv.second.mesh, &kv.second.glass, &kv.second.cut, &kv.second.text})
            if (m->count) {
                tris += m->count / 3;
                draws++;
            }
    long car = (meshes_.body.count + meshes_.bodyGlass.count + meshes_.gangway.count + meshes_.leafFront.count * 2 +
                meshes_.leafFrontGlass.count * 2) / 3;
    fprintf(stderr, "scenery: %ld triangles in %ld draws (%zu chunks); one car: %ld triangles\n", tris, draws,
            world_.chunks.size(), car);
    snprintf(buf, size,
             "dir=%d head=%.1f v=%.1fkm/h moving=%d next=%s door=%.2f odo=%.0f %s car=%d x=%.2f z=%.2f | other: active=%d dir=%d head=%.0f next=%s",
             a_.dir, a_.head, a_.v * 3.6, (int)a_.moving, track::ST[a_.next].ko, a_.door, odo_,
             where_ == IN_TRAIN ? "in-train" : "on-platform", car_, px_, pz_, (int)b_.active, b_.dir, b_.head,
             track::ST[b_.next].ko);
}

double App::viewS() const {
    if (where_ == ON_PLATFORM) return track::stationS(pst_) - pz_;
    return a_.head - a_.dir * (train::CAB_FRONT + car_ * train::PITCH - pz_);
}

// ---------------------------------------------------------------- trains

// Automatic running. Returns true when the stop at a terminal is over.
bool App::autoStep(TrainState& t, float sdt, bool hold) {
    bool finished = false;
    if (!t.moving) {
        if (hold) {
            if (t.dwell < 6.f) t.dwell = 6.f;
            t.doorTarget = true;
        }
        t.dwell -= sdt;
        if (isTerminal(t)) {
            if (t.dwell <= 0) finished = true;
        } else {
            if (t.dwell <= 4.f) t.doorTarget = false;
            if (t.dwell <= 0 && t.door <= 0.f) {
                // Depart. If the train is standing at `next`, aim for the one after.
                if (fabs(t.head - stopHead(t, t.next)) < 20.0) t.next += t.dir;
                t.moving = true;
            }
        }
    } else {
        double remain = (stopHead(t, t.next) - t.head) * t.dir;
        if (remain < 0) remain = 0;
        double allowed = sqrt(2.0 * BRAKE * 0.92 * remain) + 0.15;
        double v = t.v + ACCEL * sdt;
        if (v > V_MAX) v = V_MAX;
        if (v > allowed) v = allowed > t.v - BRAKE * 1.5 * sdt ? allowed : t.v - BRAKE * 1.5 * sdt;
        if (v < 0.15) v = 0.15;
        t.v = v;
        double step = t.v * sdt;
        if (step >= remain) {
            t.head = stopHead(t, t.next);
            t.v = 0;
            t.moving = false;
            t.dwell = isTerminal(t) ? TERMINAL_DWELL : DWELL_TIME;
            t.doorTarget = true;
        } else {
            t.head += t.dir * step;
        }
    }
    return finished;
}

static void moveDoors(TrainState& t, float sdt) {
    float dd = sdt / 2.5f;  // doors take about 2.5 s
    if (t.doorTarget)
        t.door = t.door + dd > 1 ? 1 : t.door + dd;
    else
        t.door = t.door - dd < 0 ? 0 : t.door - dd;
}

void App::simulate(float dt, const Input& in) {
    double before = a_.head;
    bool wasOpen = a_.doorTarget;
    // The train waits while the player is on the platform or in a doorway.
    bool outside = where_ == ON_PLATFORM;
    bool hold = outside || px_ < -1.25f;

    // Buttons (rising edges).
    if (in.b && !prev_.b) speedIdx_ = (speedIdx_ + 1) % 4;
    if (in.y && !prev_.y) {
        manual_ = !manual_;
        if (!manual_ && !a_.moving) a_.dwell = 6.f;
    }
    if (in.x && !prev_.x && fading_ != FADE_OUT) {
        // Skip ahead: to the next station, or turn round at the end of the line.
        if (outside) boardTrain(in, -4.8f);
        hold = false;
        if (isTerminal(a_) && atPlatform(a_))
            pendingTurn_ = true;
        else
            pendingStation_ = atPlatform(a_) ? a_.next + a_.dir : a_.next;
        fading_ = FADE_OUT;
    }

    float sdt = dt * SPEEDS[speedIdx_];

    if (fading_ == FADE_OUT) {
        fade_ += dt * 2.5f;
        if (fade_ >= 1) {
            fade_ = 1;
            if (pendingTurn_)
                turnAround();
            else if (pendingStation_ >= 0)
                placeAtStation(a_, pendingStation_);
            pendingTurn_ = false;
            pendingStation_ = -1;
            fading_ = FADE_IN;
            reseedOther(true);
            world_.update(viewS(), a_.dir, 1000);
        }
    } else {
        if (fading_ == FADE_IN) {
            fade_ -= dt * 1.5f;
            if (fade_ <= 0) {
                fade_ = 0;
                fading_ = FADE_NONE;
            }
        }
        if (manual_) {
            double target = stopHead(a_, a_.next);
            double err = (target - a_.head) * a_.dir;  // positive: still short of the mark
            float power = outside ? 0.f : in.trigR, brake = outside ? 0.f : in.trigL;
            bool nearMark = a_.v < 0.05 && fabs(err) < 15.0;
            if (nearMark && power < 0.1f) {
                // Creep to the exact stopping point so the doors line up, then open.
                double step = 1.2 * sdt;
                if (fabs(err) <= step) {
                    a_.head = target;
                    a_.doorTarget = true;
                } else {
                    a_.head += a_.dir * (err > 0 ? step : -step);
                }
                a_.v = 0;
            } else {
                if (power >= 0.1f) a_.doorTarget = false;
                double acc = -0.03;
                if (a_.door < 0.02f) acc += power * 1.0;
                acc -= brake * 1.3;
                a_.v += acc * sdt;
                if (a_.v < 0) a_.v = 0;
                if (a_.v > 90.0 / 3.6) a_.v = 90.0 / 3.6;
                a_.head += a_.dir * a_.v * sdt;
            }
            a_.moving = a_.v > 0;
            // Passed the stopping point: the following station becomes the next one.
            if (-err > 15.0) {
                if (isTerminal(a_)) {
                    a_.head = target + a_.dir * 15.0;
                    a_.v = 0;
                    pendingTurn_ = true;
                    fading_ = FADE_OUT;
                } else {
                    a_.next += a_.dir;
                }
            } else if (isTerminal(a_) && atPlatform(a_) && a_.door > 0.99f && !hold) {
                a_.dwell -= sdt;
                if (a_.dwell <= 0) {
                    pendingTurn_ = true;
                    fading_ = FADE_OUT;
                }
            }
        } else if (autoStep(a_, sdt, hold)) {
            pendingTurn_ = true;
            fading_ = FADE_OUT;
        }
        moveDoors(a_, sdt);

        // The train on the other track.
        if (b_.active) {
            if (autoStep(b_, sdt, false)) b_.active = false;
            moveDoors(b_, sdt);
            // Long gone behind the player: bring the next one in.
            if ((a_.head - b_.head) * a_.dir > 1200.0) b_.active = false;
        }
        if (!b_.active) {
            reseedTimer_ -= dt;
            if (reseedTimer_ <= 0) {
                reseedTimer_ = 2.f;
                reseedOther(false);
            }
        }
    }

    if (a_.doorTarget != wasOpen) audio_.chimeCount++;
    double moved = fabs(a_.head - before);
    if (moved < 100) {
        odo_ += moved;
        audio_.distance += moved;
    }
    audio_.speed = (float)a_.v;
}

float App::psdOpen(int station, int side) const {
    float open = 0;
    for (const TrainState* t : {&a_, &b_})
        if (t->active && t->next == station && t->dir == side && atPlatform(*t) && t->door > open) open = t->door;
    return open;
}

// ---------------------------------------------------------------- player

void App::boardTrain(const Input& in, float z) {
    where_ = IN_TRAIN;
    car_ = 0;
    yaw_ = 0;
    px_ = -in.headX;
    pz_ = z - in.headZ;
}

void App::exitToPlatform() {
    Frame cf = carFrame(a_, car_), sf = stationFrame(a_.next);
    double wx, wz, x, z;
    toWorld(cf, px_, pz_, wx, wz);
    toLocal(sf, wx, wz, x, z);
    yaw_ += yawBetween(cf, sf);
    px_ = (float)x;
    pz_ = (float)z;
    where_ = ON_PLATFORM;
    pst_ = a_.next;
    pside_ = a_.dir;
}

void App::enterFromPlatform() {
    Frame sf = stationFrame(pst_);
    double wx, wz;
    toWorld(sf, px_, pz_, wx, wz);
    int best = 0;
    double bestZ = 1e9, bx = 0, bz = 0;
    for (int c = 0; c < CARS; c++) {
        double x, z;
        toLocal(carFrame(a_, c), wx, wz, x, z);
        if (fabs(z) < fabs(bestZ)) {
            bestZ = z;
            best = c;
            bx = x;
            bz = z;
        }
    }
    yaw_ += yawBetween(sf, carFrame(a_, best));
    car_ = best;
    px_ = (float)bx;
    pz_ = (float)bz;
    where_ = IN_TRAIN;
}

void App::movePlayer(float dt, const Input& in) {
    // Snap turn about the head position.
    if (fabsf(in.turnX) > 0.7f) {
        if (!turnLatch_) {
            turnLatch_ = true;
            float d = (in.turnX > 0 ? -1.f : 1.f) * (float)M_PI / 6.f;
            V3 h = m4Dir(m4RotY(yaw_), {in.headX, 0, in.headZ});
            V3 h2 = m4Dir(m4RotY(yaw_ + d), {in.headX, 0, in.headZ});
            px_ += h.x - h2.x;
            pz_ += h.z - h2.z;
            yaw_ += d;
        }
    } else if (fabsf(in.turnX) < 0.4f) {
        turnLatch_ = false;
    }

    // Walk in the direction the head faces.
    float fl = sqrtf(in.headFwdX * in.headFwdX + in.headFwdZ * in.headFwdZ);
    float fx = fl > 1e-3f ? in.headFwdX / fl : 0, fz = fl > 1e-3f ? in.headFwdZ / fl : -1;
    float mx = fabsf(in.moveX) > 0.15f ? in.moveX : 0, my = fabsf(in.moveY) > 0.15f ? in.moveY : 0;
    V3 stage = {(-fz) * mx + fx * my, 0, fx * mx + fz * my};
    V3 local = m4Dir(m4RotY(yaw_), stage);
    float speed = where_ == ON_PLATFORM ? 2.2f : 1.5f;
    px_ += local.x * speed * dt;
    pz_ += local.z * speed * dt;

    bool doorsOpen = atPlatform(a_) && a_.door > 0.9f;

    if (in.a && !prev_.a) {
        if (where_ == ON_PLATFORM) {
            boardTrain(in, -4.8f);  // back into the train
        } else {
            // Jump between the cab and the passenger area.
            bool inCab = car_ == 0 && pz_ < -train::HALF_LEN;
            boardTrain(in, inCab ? -4.8f : -10.75f);
        }
    }

    if (where_ == IN_TRAIN) {
        // Move between cars through the gangways.
        if (pz_ < -train::PITCH / 2 && car_ > 0) {
            car_--;
            pz_ += train::PITCH;
        } else if (pz_ > train::PITCH / 2 && car_ < CARS - 1) {
            car_++;
            pz_ -= train::PITCH;
        }
        float zMin = car_ == 0 ? -11.0f : -train::PITCH / 2 - 0.01f;
        float zMax = car_ == CARS - 1 ? 11.0f : train::PITCH / 2 + 0.01f;
        if (pz_ < zMin) pz_ = zMin;
        if (pz_ > zMax) pz_ = zMax;
        bool cab = (car_ == 0 && pz_ < -10.0f) || (car_ == CARS - 1 && pz_ > 10.0f);
        float xLim = cab ? 1.2f : fabsf(pz_) > 9.45f ? 0.3f : 1.3f;
        float xMin = -xLim;
        // An open door on the platform side lets the player step out.
        if (doorsOpen && !cab) {
            for (int d = 0; d < 4; d++) {
                float dz = pz_ - train::DOOR_Z[d];
                if (fabsf(dz) > 0.6f) continue;
                xMin = -1.9f;
                if (px_ < -1.3f) pz_ = train::DOOR_Z[d] + (dz < -0.5f ? -0.5f : dz > 0.5f ? 0.5f : dz);
            }
        }
        if (px_ < xMin) px_ = xMin;
        if (px_ > xLim) px_ = xLim;
        if (px_ < -(train::HALF_OUT + 0.06f)) exitToPlatform();
    } else {
        float a = -pz_, l = -px_ * pside_;
        bool ug = track::underground(track::stationS(pst_));
        float back = (float)(ug ? track::BACK_UNDERGROUND : track::BACK_OPEN);
        const float END = (float)track::STATION_HALF - 1.2f;
        if (a < -END) a = -END;
        if (a > END) a = END;
        if (l > back - 0.35f) l = back - 0.35f;
        float lMin = (float)track::PSD_LAT + 0.32f;
        if (doorsOpen && a_.next == pst_ && a_.dir == pside_) {
            for (float da : platformDoors()) {
                if (fabsf(a - da) > 0.62f) continue;
                lMin = 3.5f;
                if (l < (float)track::PSD_LAT + 0.32f) a = da + (a - da < -0.5f ? -0.5f : a - da > 0.5f ? 0.5f : a - da);
            }
        }
        if (l < lMin) l = lMin;
        // Columns on the platform.
        float pa = roundf(a / 10.f) * 10.f, pr = ug ? 0.62f : 0.42f;
        float dx = a - pa, dl = l - 6.6f, dist = sqrtf(dx * dx + dl * dl);
        if (dist < pr && dist > 1e-4f) {
            a = pa + dx / dist * pr;
            l = 6.6f + dl / dist * pr;
        }
        px_ = -l * pside_;
        pz_ = -a;
        if (l < (float)track::PLAT_EDGE - 0.03f) enterFromPlatform();
    }
}

// ---------------------------------------------------------------- displays

void App::buildDynamicText() {
    MB tx;
    const track::Station& ns = track::ST[a_.next];
    double remain = (stopHead(a_, a_.next) - a_.head) * a_.dir;
    if (remain < 0.5) remain = 0;
    bool here = a_.v < 0.1 && remain < 20;
    bool terminal = isTerminal(a_);
    char buf[128];

    // Displays above the doors, on both sides.
    for (int side = -1; side <= 1; side += 2) {
        V3 right = {0, 0, (float)side}, up = {0, 1, 0};
        float x = side * (train::HALF_IN - 0.02f);
        for (int d = 0; d < 4; d++) {
            float zc = train::DOOR_Z[d];
            V3 c = {x, FLOOR + 2.03f, zc};
            const char* label = here ? (terminal ? "종착역" : "이번 역") : (remain < 300 ? "이번 역" : "다음 역");
            addText(tx, label, c - right * 0.5f + up * 0.115f, right, up, 0.05f, GREEN, 0);
            addText(tx, ns.en, c + right * 0.5f + up * 0.12f, right, up, 0.034f, AMBER, 2);
            addText(tx, ns.ko, c - right * 0.14f - up * 0.03f, right, up, 0.105f, AMBER, 1);
            if (!here) {
                if (remain >= 1000)
                    snprintf(buf, sizeof(buf), "%.2f km", remain / 1000.0);
                else
                    snprintf(buf, sizeof(buf), "%.0f m", remain);
                addText(tx, buf, c + right * 0.5f - up * 0.03f, right, up, 0.05f, GREEN, 2);
            } else {
                addText(tx, "내리실 문 왼쪽", c + right * 0.5f - up * 0.03f, right, up, 0.038f, GREEN, 2);
            }
        }
        // Route map above the middle window.
        V3 c = {x, FLOOR + 2.03f, 0};
        float span = 1.86f, step = span / (track::N - 1);
        addRect(tx, c - up * 0.02f, right, up, span, 0.012f, NAVY);
        // Position of the train centre along the line, in station units.
        double mid = a_.head - a_.dir * train::LENGTH * 0.5;
        float pos = 0;
        for (int i = 0; i < track::N - 1; i++) {
            double s0 = track::stationS(i), s1 = track::stationS(i + 1);
            if (mid >= s0) pos = i + (float)((mid - s0) / (s1 - s0));
        }
        if (pos > track::N - 1) pos = (float)(track::N - 1);
        for (int i = 0; i < track::N; i++) {
            // The map reads in the direction of travel on both walls.
            float along = (i - (track::N - 1) * 0.5f) * step * (float)(-side * a_.dir);
            V3 p = c + right * along;
            bool passed = a_.dir > 0 ? i < pos - 0.01f : i > pos + 0.01f;
            Col dot = passed ? Col{150, 150, 150, 255} : NAVY;
            addRect(tx, p - up * 0.02f, right, up, 0.034f, 0.034f, dot);
            addRect(tx, p - up * 0.02f, right, up, 0.018f, 0.018f, {255, 255, 255, 255});
            addText(tx, track::ST[i].ko, p + up * 0.045f, right, up, 0.027f,
                    i == a_.next ? Col{210, 30, 30, 255} : Col{30, 30, 30, 255}, 1);
        }
        float along = (pos - (track::N - 1) * 0.5f) * step * (float)(-side * a_.dir);
        addRect(tx, c + right * along - up * 0.02f, right, up, 0.022f, 0.022f, {220, 30, 30, 255});
        addText(tx, a_.dir > 0 ? "광운대 방면" : "서울역 방면", c - up * 0.115f, right, up, 0.03f, NAVY, 1);
    }

    // Information board on the front end wall.
    {
        V3 r = {1, 0, 0}, u = {0, 1, 0};
        float z = -train::HALF_LEN + 0.085f, x = 0.57f, y = FLOOR + 1.74f;
        addText(tx, "수도권 전철 1호선", {x, y, z}, r, u, 0.07f, {255, 255, 255, 255});
        y -= 0.1f;
        addText(tx, a_.dir > 0 ? "서울역 > 광운대" : "광운대 > 서울역", {x, y, z}, r, u, 0.055f, GREEN);
        y -= 0.115f;
        snprintf(buf, sizeof(buf), "속도  %.0f km/h", a_.v * 3.6);
        addText(tx, buf, {x, y, z}, r, u, 0.06f, AMBER);
        y -= 0.095f;
        snprintf(buf, sizeof(buf), "%s  %s", here ? "이번 역" : "다음 역", ns.ko);
        addText(tx, buf, {x, y, z}, r, u, 0.06f, AMBER);
        y -= 0.095f;
        snprintf(buf, sizeof(buf), "남은 거리  %.0f m", remain);
        addText(tx, buf, {x, y, z}, r, u, 0.055f, AMBER);
        y -= 0.095f;
        double fromSeoul = a_.head - a_.dir * train::LENGTH * 0.5;
        if (fromSeoul < 0) fromSeoul = 0;
        if (fromSeoul > track::total()) fromSeoul = track::total();
        snprintf(buf, sizeof(buf), "서울역 기점  %.2f / %.1f km", fromSeoul / 1000.0, track::total() / 1000.0);
        addText(tx, buf, {x, y, z}, r, u, 0.047f, GREEN);
        y -= 0.09f;
        snprintf(buf, sizeof(buf), "%s 운전   배속 x%d", manual_ ? "수동" : "자동", (int)SPEEDS[speedIdx_]);
        addText(tx, buf, {x, y, z}, r, u, 0.047f, {255, 255, 255, 255});
    }

    // Driver's desk display.
    if (dynCar_ == 0) {
        float zf = -train::CAB_FRONT;
        V3 r = {1, 0, 0};
        // The panel leans back: its "up" follows the slope of the desk.
        V3 u = {0, 0.392f, -0.920f};
        V3 o = {-1.16f, FLOOR + 0.862f, zf + 0.515f};
        snprintf(buf, sizeof(buf), "%.0f km/h", a_.v * 3.6);
        addText(tx, buf, o + u * 0.15f, r, u, 0.1f, AMBER);
        snprintf(buf, sizeof(buf), "%s  %.0f m", ns.ko, remain);
        addText(tx, buf, o + u * 0.035f, r, u, 0.06f, GREEN);
        addText(tx, manual_ ? "수동" : "자동", o + r * 0.82f + u * 0.16f, r, u, 0.055f, {255, 255, 255, 255}, 2);
    }
    dynText_.upload(tx, true);
}

// Camera-facing halos around lamps.
void App::buildGlows(V3 camRight, V3 camUp, V3 eye) {
    MB mb;
    mb.gloss = UNLIT;
    auto add = [&](V3 p, Col c, float size) {
        // pull the halo towards the eye so that it is not cut by the lamp housing
        V3 d = eye - p;
        float l = sqrtf(d.x * d.x + d.y * d.y + d.z * d.z);
        if (l < 1.5f) return;
        p = p + d * (0.25f / l);
        V3 r = camRight * (size * 0.5f), u = camUp * (size * 0.5f);
        mb.quad(p - r - u, p + r - u, p + r + u, p - r + u, 0, 0, 1, 1, T_GLOW, c, c, c, c);
    };
    for (auto& kv : world_.chunks) {
        const Chunk& c = kv.second;
        V3 o = {(float)(c.ox - originX_), 0, (float)(c.oz - originZ_)};
        for (const Glow& g : c.glows) add(o + g.p, g.c, g.size);
    }
    auto lamps = [&](const M4* cars) {
        for (float x : {-1.02f, 1.02f}) {
            add(m4Point(cars[0], {x, FLOOR + 0.61f, -train::CAB_FRONT - 0.05f}), rgb(1, 0.95f, 0.8f), 2.2f);
            add(m4Point(cars[CARS - 1], {x, FLOOR + 0.45f, train::CAB_FRONT + 0.05f}), rgb(1, 0.1f, 0.05f), 0.8f);
        }
    };
    if (where_ == ON_PLATFORM) lamps(carA_);
    if (drawB_) lamps(carB_);
    glowMesh_.upload(mb, true);
}

// ---------------------------------------------------------------- frame

void App::update(float dt, const Input& in) {
    if (dt > 0.1f) dt = 0.1f;
    time_ += dt;
    simulate(dt, in);
    movePlayer(dt, in);
    prev_ = in;

    // Everything is rendered relative to the player's surroundings to keep float precision.
    Frame pf = where_ == IN_TRAIN ? carFrame(a_, car_) : stationFrame(pst_);
    originX_ = pf.ox;
    originZ_ = pf.oz;
    for (int i = 0; i < CARS; i++) carA_[i] = frameMat(carFrame(a_, i), originX_, originZ_);
    double vs = viewS();
    drawB_ = b_.active && fabs(b_.head - b_.dir * train::LENGTH * 0.5 - vs) < 900.0;
    if (drawB_)
        for (int i = 0; i < CARS; i++) carB_[i] = frameMat(carFrame(b_, i), originX_, originZ_);
    float floorY = where_ == IN_TRAIN ? FLOOR : PLAT_Y;
    stageRel_ = m4Mul(frameMat(pf, originX_, originZ_), m4Mul(m4Translate(px_, floorY, pz_), m4RotY(yaw_)));
    headPos_ = m4Point(carA_[0], {0, FLOOR + 1.3f, -train::CAB_FRONT});
    headDir_ = m4Dir(carA_[0], {0, -0.06f, -1});

    // The car whose displays are live: the player's, or the nearest when outside.
    dynCar_ = car_;
    if (where_ == ON_PLATFORM) {
        double centre0 = a_.head - a_.dir * train::CAB_FRONT;  // route distance of car 0
        int c = (int)lround((centre0 - vs) * a_.dir / train::PITCH);
        dynCar_ = c < 0 ? 0 : c > CARS - 1 ? CARS - 1 : c;
    }

    world_.update(vs, a_.dir, 2);
    audio_.tunnel = vs < track::PORTAL;
    audio_.outside = where_ == ON_PLATFORM;
    // Loudness of the other train as it passes the listener.
    float pass = 0;
    if (b_.active) {
        double centre = b_.head - b_.dir * train::LENGTH * 0.5;
        double d = fabs(centre - vs) - train::LENGTH * 0.5;
        float rel = (float)(b_.v + (where_ == IN_TRAIN ? a_.v : 0));
        if (d < 60) pass = (d < 0 ? 1.f : 1.f - (float)d / 60.f) * (rel / 30.f);
        if (pass > 1) pass = 1;
    }
    audio_.pass = pass;
    buildDynamicText();
}

Env App::trainEnv(const TrainState& t, int car) const {
    double s = t.head - t.dir * (train::CAB_FRONT + car * train::PITCH);
    Env e = ENV_TUNNEL;
    e.ambGround = {0.74f, 0.74f, 0.74f};
    e.specCol = {0.5f, 0.5f, 0.5f};
    e.headPow = 0;
    if (!track::underground(s)) {
        e.sun = ENV_OUT.sun * 0.4f;
        e.specDir = SUN_DIR;
        e.fog = SKY_FOG;
        e.fogK = ENV_OUT.fogK;
    }
    return e;
}

// pass 0: opaque, 1: glass, 2: text
void App::drawTrain(const Prog& p, const TrainState& t, const M4* cars, int pass, int from, int to) {
    float slide = t.door * train::DOOR_TRAVEL;
    M4 turn = m4RotY((float)M_PI);
    for (int i = from; i <= to; i++) {
        if (i < 0 || i >= CARS) continue;
        setEnv(p, trainEnv(t, i));
        M4 front = m4Mul(cars[i], m4Translate(0, 0, -slide)), rear = m4Mul(cars[i], m4Translate(0, 0, slide));
        M4 back = m4Mul(cars[i], turn);
        if (pass == 0) {
            setModel(p, cars[i]);
            meshes_.body.draw();
            if (i < CARS - 1) meshes_.gangway.draw();
            if (i % 3 == 1) meshes_.panto.draw();
            if (i == 0) {
                meshes_.cab.draw();
                meshes_.headLights.draw();
            }
            if (i == CARS - 1) {
                setModel(p, back);
                meshes_.cab.draw();
                meshes_.tailLights.draw();
            }
            setModel(p, front);
            meshes_.leafFront.draw();
            setModel(p, rear);
            meshes_.leafRear.draw();
        } else if (pass == 1) {
            setModel(p, cars[i]);
            meshes_.bodyGlass.draw();
            if (i == 0) meshes_.cabGlass.draw();
            if (i == CARS - 1) {
                setModel(p, back);
                meshes_.cabGlass.draw();
            }
            setModel(p, front);
            meshes_.leafFrontGlass.draw();
            setModel(p, rear);
            meshes_.leafRearGlass.draw();
        } else {
            const Mesh& dest = meshes_.destText[t.dir > 0 ? 0 : 1];
            if (i == 0) {
                setModel(p, cars[i]);
                dest.draw();
            }
            if (i == CARS - 1) {
                setModel(p, back);
                dest.draw();
            }
        }
    }
}

void App::render(const M4& eyeFromStage, const M4& proj, float gamma) {
    M4 view = m4Mul(eyeFromStage, m4InvRigid(stageRel_));
    M4 camWorld = m4InvRigid(view);
    V3 eye = {camWorld.m[12], camWorld.m[13], camWorld.m[14]};
    V3 camRight = {camWorld.m[0], camWorld.m[1], camWorld.m[2]}, camUp = {camWorld.m[4], camWorld.m[5], camWorld.m[6]};
    V3 camFwd = {-camWorld.m[8], -camWorld.m[9], -camWorld.m[10]};
    FrameCtx fc;
    fc.vp = m4Mul(proj, view);
    fc.eye = eye;
    fc.gamma = gamma;
    fc.sunDir = SUN_DIR;
    fc.headPos = headPos_;
    fc.headDir = headDir_;
    fc.time = time_;
    double vs = viewS();
    bool inside = where_ == IN_TRAIN;

    glDisable(GL_CULL_FACE);
    glDisable(GL_BLEND);
    glDepthMask(GL_TRUE);
    glClearColor(powf(SKY_FOG.x, gamma), powf(SKY_FOG.y, gamma), powf(SKY_FOG.z, gamma), 1);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    // Sky, hills and far ground; nothing of it shows deep inside the tunnel.
    if (vs > track::PORTAL - 800.0) {
        glDisable(GL_DEPTH_TEST);
        glDepthMask(GL_FALSE);
        bindProg(gfx.sky, fc);
        setEnv(gfx.sky, ENV_OUT);
        setModel(gfx.sky, m4Translate(eye.x, eye.y, eye.z));
        world_.skyDome.draw();
        bindProg(gfx.world, fc);
        setEnv(gfx.world, ENV_UNLIT);
        setModel(gfx.world, m4Translate(eye.x, 0, eye.z));
        world_.scenery.draw();
        glDepthMask(GL_TRUE);
    }
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LEQUAL);

    // Chunks in front of the viewer (with a margin for what is beside them).
    std::vector<const Chunk*> vis;
    std::vector<M4> visModel;
    for (auto& kv : world_.chunks) {
        const Chunk& c = kv.second;
        V3 o = {(float)(c.ox - originX_) - eye.x, -eye.y, (float)(c.oz - originZ_) - eye.z};
        if (o.x * camFwd.x + o.y * camFwd.y + o.z * camFwd.z < -110.f) continue;
        vis.push_back(&c);
        visModel.push_back(m4Translate((float)(c.ox - originX_), 0, (float)(c.oz - originZ_)));
    }
    // Screen doors of the stations in sight.
    struct Psd {
        M4 a, b;
        Env env;
    };
    std::vector<Psd> psd;
    for (int i = 0; i < track::N; i++) {
        double S = track::stationS(i);
        if (fabs(S - vs) > 650.0) continue;
        M4 base = frameMat(stationFrame(i), originX_, originZ_);
        for (int side = -1; side <= 1; side += 2) {
            float slide = psdOpen(i, side) * PSD_TRAVEL;
            M4 m = side > 0 ? base : m4Mul(base, m4RotY((float)M_PI));
            psd.push_back({m4Mul(m, m4Translate(0, 0, -slide)), m4Mul(m, m4Translate(0, 0, slide)),
                           track::underground(S) ? ENV_TUNNEL : ENV_OUT});
        }
    }
    int fromA = inside ? car_ - 5 : 0, toA = inside ? car_ + 5 : CARS - 1;

    // ---- opaque
    const Prog& W = gfx.world;
    bindProg(W, fc);
    for (size_t i = 0; i < vis.size(); i++) {
        setEnv(W, vis[i]->tunnel ? ENV_TUNNEL : ENV_OUT);
        setModel(W, visModel[i]);
        vis[i]->mesh.draw();
    }
    for (const Psd& p : psd) {
        setEnv(W, p.env);
        setModel(W, p.a);
        world_.psdLeafA.draw();
        setModel(W, p.b);
        world_.psdLeafB.draw();
    }
    drawTrain(W, a_, carA_, 0, fromA, toA);
    if (drawB_) drawTrain(W, b_, carB_, 0, 0, CARS - 1);

    // ---- foliage
    bool anyCut = false;
    for (const Chunk* c : vis) anyCut = anyCut || c->cut.count;
    if (anyCut) {
        bindProg(gfx.cutout, fc);
        setEnv(gfx.cutout, ENV_OUT);
        for (size_t i = 0; i < vis.size(); i++) {
            if (!vis[i]->cut.count) continue;
            setModel(gfx.cutout, visModel[i]);
            vis[i]->cut.draw();
        }
    }

    // ---- glass
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glDepthMask(GL_FALSE);
    const Prog& G = gfx.glass;
    bindProg(G, fc);
    auto stationGlass = [&]() {
        for (size_t i = 0; i < vis.size(); i++) {
            if (!vis[i]->glass.count) continue;
            setEnv(G, vis[i]->tunnel ? ENV_TUNNEL : ENV_OUT);
            setModel(G, visModel[i]);
            vis[i]->glass.draw();
        }
        for (const Psd& p : psd) {
            setEnv(G, p.env);
            setModel(G, p.a);
            world_.psdGlassA.draw();
            setModel(G, p.b);
            world_.psdGlassB.draw();
        }
    };
    // Farthest layer first: seen from the train the station glass is behind the windows.
    if (inside) stationGlass();
    if (drawB_) drawTrain(G, b_, carB_, 1, 0, CARS - 1);
    drawTrain(G, a_, carA_, 1, fromA, toA);
    if (!inside) stationGlass();

    // ---- text: station signs, then the displays of the train
    const Prog& T = gfx.text;
    bindProg(T, fc, true);
    glEnable(GL_POLYGON_OFFSET_FILL);
    glPolygonOffset(-2.f, -2.f);
    for (size_t i = 0; i < vis.size(); i++) {
        if (!vis[i]->text.count) continue;
        setEnv(T, vis[i]->tunnel ? ENV_TUNNEL : ENV_OUT);
        setModel(T, visModel[i]);
        vis[i]->text.draw();
    }
    setEnv(T, ENV_UNLIT);
    setModel(T, carA_[dynCar_]);
    dynText_.draw();
    for (int i = dynCar_ - 1; i <= dynCar_ + 1; i++) {
        if (i < 0 || i >= CARS) continue;
        setModel(T, carA_[i]);
        meshes_.staticText.draw();
    }
    glDisable(GL_POLYGON_OFFSET_FILL);
    // The destination sits clear of its panel; an offset would let it show through the cab wall.
    drawTrain(T, a_, carA_, 2, 0, CARS - 1);
    if (drawB_) drawTrain(T, b_, carB_, 2, 0, CARS - 1);

    // ---- lamp halos
    buildGlows(camRight, camUp, eye);
    if (glowMesh_.count) {
        bindProg(W, fc);
        setEnv(W, ENV_UNLIT);
        setModel(W, m4Identity());
        glBlendFunc(GL_ONE, GL_ONE);
        glowMesh_.draw();
    }

    // ---- fade overlay
    if (fade_ > 0.001f) {
        const Prog& F = gfx.flat;
        FrameCtx flat = fc;
        flat.vp = m4Identity();
        bindProg(F, flat);
        setModel(F, m4Identity());
        glUniform1f(F.uFogK, 0);
        glDisable(GL_DEPTH_TEST);
        glBlendColor(0, 0, 0, fade_);
        glBlendFunc(GL_CONSTANT_ALPHA, GL_ONE_MINUS_CONSTANT_ALPHA);
        overlay_.draw();
        glEnable(GL_DEPTH_TEST);
    }
    glDisable(GL_BLEND);
    glDepthMask(GL_TRUE);
    glBindVertexArray(0);
}
