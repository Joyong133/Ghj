#include "app.h"

#include <cmath>
#include <cstdio>

#include "track.h"

using train::CARS;
using train::FLOOR;

namespace {
const double TRAIN_LEN = train::CAB_FRONT + (CARS - 1) * train::PITCH + train::HALF_LEN;
const double V_MAX = 80.0 / 3.6;
const double ACCEL = 0.85, BRAKE = 0.9;
const float DWELL_TIME = 25.f, TERMINAL_DWELL = 15.f;
const float SPEEDS[] = {1.f, 2.f, 4.f, 8.f};
const Col AMBER = {255, 176, 32, 255};
const Col GREEN = {96, 230, 120, 255};
}  // namespace

// Route distance of the train front when it is stopped at a station.
double App::stopHead(int station) const { return track::stationS(station) + dir_ * TRAIN_LEN * 0.5; }

void App::carPose(int car, double& x, double& z, double& fx, double& fz) const {
    double sc = head_ - dir_ * (train::CAB_FRONT + car * train::PITCH);
    double lat = dir_ * track::TRACK_OFFSET;  // trains keep left on Line 1
    double ax, az, bx, bz, tx, tz;
    track::pose(sc + dir_ * 7.0, lat, ax, az, tx, tz);
    track::pose(sc - dir_ * 7.0, lat, bx, bz, tx, tz);
    x = (ax + bx) * 0.5;
    z = (az + bz) * 0.5;
    fx = ax - bx;
    fz = az - bz;
    double l = sqrt(fx * fx + fz * fz);
    fx /= l;
    fz /= l;
}

bool App::init() {
    track::build();
    if (!gfx.init()) return false;
    world_.init();
    meshes_.init();
    MB mb;
    Col k = {0, 0, 0, 255};
    mb.quad({-1, -1, 0}, {1, -1, 0}, {1, 1, 0}, {-1, 1, 0}, 0, 0, 1, 1, 0, k, k, k, k);
    overlay_.upload(mb);
    placeAtStation(0);
    world_.update(head_, dir_, 1000);
    fade_ = 1;
    state_ = FADE_IN;
    return true;
}

void App::shutdown() {
    world_.destroy();
    meshes_.destroy();
    dynText_.destroy();
    overlay_.destroy();
}

void App::placeAtStation(int station) {
    next_ = station;
    head_ = stopHead(station);
    v_ = 0;
    bool terminal = (dir_ > 0 && station == track::N - 1) || (dir_ < 0 && station == 0);
    dwell_ = terminal ? TERMINAL_DWELL : DWELL_TIME;
    door_ = 1;
    doorTarget_ = true;
}

void App::turnAround() {
    // The player changes to a train on the opposite track, keeping the same
    // position inside the train.
    int station = dir_ > 0 ? track::N - 1 : 0;
    dir_ = -dir_;
    placeAtStation(station);
    dwell_ = DWELL_TIME;
}

void App::debugPlace(int station, double extraMetres, int car, float x, float z, float yaw) {
    placeAtStation(station);
    head_ += dir_ * extraMetres;
    if (extraMetres != 0) {
        door_ = 0;
        doorTarget_ = false;
        v_ = 15;
        state_ = RUN;
        next_ = station + dir_;
        if (next_ < 0 || next_ >= track::N) next_ = station;
    } else {
        state_ = DWELL;
    }
    fade_ = 0;
    car_ = car;
    px_ = x;
    pz_ = z;
    yaw_ = yaw;
    world_.update(head_ - dir_ * (train::CAB_FRONT + car_ * train::PITCH), dir_, 1000);
}

void App::debugStatus(char* buf, int size) const {
    snprintf(buf, size, "dir=%d head=%.1f v=%.1fkm/h state=%d next=%s door=%.2f odo=%.0f car=%d", dir_, head_, v_ * 3.6,
             (int)state_, track::ST[next_].ko, door_, odo_, car_);
}

void App::simulate(float dt, const Input& in) {
    bool terminal = (dir_ > 0 && next_ == track::N - 1) || (dir_ < 0 && next_ == 0);
    double before = head_;
    double vBefore = v_;

    // Buttons (rising edges).
    if (in.b && !prev_.b) speedIdx_ = (speedIdx_ + 1) % 4;
    if (in.y && !prev_.y) {
        manual_ = !manual_;
        if (!manual_ && state_ == DWELL) dwell_ = 6.f;
    }
    if (in.x && !prev_.x && state_ != FADE_OUT) {
        // Skip ahead: to the next station, or turn round at the end of the line.
        bool atPlatform = v_ < 0.1 && fabs(head_ - stopHead(next_)) < 1.0;
        if (terminal && atPlatform) {
            pendingTurn_ = true;
        } else {
            pendingStation_ = atPlatform ? next_ + dir_ : next_;
        }
        state_ = FADE_OUT;
    }

    float sdt = dt * SPEEDS[speedIdx_];
    bool wasOpen = doorTarget_;

    if (state_ == FADE_OUT) {
        fade_ += dt * 2.5f;
        if (fade_ >= 1) {
            fade_ = 1;
            if (pendingTurn_)
                turnAround();
            else if (pendingStation_ >= 0)
                placeAtStation(pendingStation_);
            pendingTurn_ = false;
            pendingStation_ = -1;
            state_ = FADE_IN;
            world_.update(head_ - dir_ * (train::CAB_FRONT + car_ * train::PITCH), dir_, 1000);
        }
    } else if (state_ == FADE_IN) {
        fade_ -= dt * 1.5f;
        if (fade_ <= 0) {
            fade_ = 0;
            state_ = v_ > 0 ? RUN : DWELL;
        }
    } else if (manual_) {
        double target = stopHead(next_);
        bool atPlatform = v_ < 0.05 && fabs(head_ - target) < 15.0;
        if (atPlatform && in.trigR < 0.1f) {
            doorTarget_ = true;
        } else if (in.trigR >= 0.1f) {
            doorTarget_ = false;
        }
        double a = -0.03;
        if (door_ < 0.02f) a += in.trigR * 1.0;
        a -= in.trigL * 1.3;
        v_ += a * sdt;
        if (v_ < 0) v_ = 0;
        if (v_ > 90.0 / 3.6) v_ = 90.0 / 3.6;
        head_ += dir_ * v_ * sdt;
        state_ = v_ > 0 ? RUN : DWELL;
        // Passed the stopping point: the following station becomes the next one.
        if ((head_ - target) * dir_ > 15.0) {
            if (terminal) {
                head_ = target + dir_ * 15.0;
                v_ = 0;
                pendingTurn_ = true;
                state_ = FADE_OUT;
            } else {
                next_ += dir_;
            }
        } else if (atPlatform && terminal && door_ > 0.99f) {
            dwell_ -= sdt;
            if (dwell_ <= 0) {
                pendingTurn_ = true;
                state_ = FADE_OUT;
            }
        }
    } else if (state_ == DWELL) {
        dwell_ -= sdt;
        if (terminal) {
            if (dwell_ <= 0) {
                pendingTurn_ = true;
                state_ = FADE_OUT;
            }
        } else {
            if (dwell_ <= 4.f) doorTarget_ = false;
            if (dwell_ <= 0 && door_ <= 0.f) {
                // Depart. If the train is already standing at next_, aim for the one after.
                if (fabs(head_ - stopHead(next_)) < 20.0) next_ += dir_;
                state_ = RUN;
            }
        }
    } else {  // RUN, automatic
        double remain = (stopHead(next_) - head_) * dir_;
        if (remain < 0) remain = 0;
        double allowed = sqrt(2.0 * BRAKE * 0.92 * remain) + 0.15;
        double v = v_ + ACCEL * sdt;
        if (v > V_MAX) v = V_MAX;
        if (v > allowed) v = allowed > v_ - BRAKE * 1.5 * sdt ? allowed : v_ - BRAKE * 1.5 * sdt;
        if (v < 0.15) v = 0.15;
        v_ = v;
        double step = v_ * sdt;
        if (step >= remain) {
            head_ = stopHead(next_);
            v_ = 0;
            state_ = DWELL;
            bool term = (dir_ > 0 && next_ == track::N - 1) || (dir_ < 0 && next_ == 0);
            dwell_ = term ? TERMINAL_DWELL : DWELL_TIME;
            doorTarget_ = true;
        } else {
            head_ += dir_ * step;
        }
    }

    // Doors take about 2.5 s.
    float dd = sdt / 2.5f;
    if (doorTarget_)
        door_ = door_ + dd > 1 ? 1 : door_ + dd;
    else
        door_ = door_ - dd < 0 ? 0 : door_ - dd;
    if (doorTarget_ != wasOpen) audio_.chimeCount++;

    double moved = fabs(head_ - before);
    if (moved < 100) {
        odo_ += moved;
        audio_.distance += moved;
    }
    audio_.speed = (float)v_;
    audio_.accel = sdt > 1e-5f ? (float)((v_ - vBefore) / sdt) : 0;
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
    px_ += local.x * 1.5f * dt;
    pz_ += local.z * 1.5f * dt;

    // Jump between the cab and the passenger area.
    if (in.a && !prev_.a) {
        bool inCab = car_ == 0 && pz_ < -train::HALF_LEN;
        car_ = 0;
        yaw_ = 0;
        px_ = -in.headX;
        pz_ = (inCab ? -4.8f : -10.75f) - in.headZ;
    }

    // Keep inside the train and move between cars through the gangways.
    if (pz_ < -train::PITCH / 2 && car_ > 0) {
        car_--;
        pz_ += train::PITCH;
    } else if (pz_ > train::PITCH / 2 && car_ < CARS - 1) {
        car_++;
        pz_ -= train::PITCH;
    }
    float zMin = car_ == 0 ? -11.0f : -train::PITCH / 2 - 0.01f;
    float zMax = car_ == CARS - 1 ? 9.4f : train::PITCH / 2 + 0.01f;
    if (pz_ < zMin) pz_ = zMin;
    if (pz_ > zMax) pz_ = zMax;
    float xLim = 1.3f;
    if (car_ == 0 && pz_ < -10.0f)
        xLim = 1.2f;
    else if (fabsf(pz_) > 9.45f)
        xLim = 0.3f;
    if (px_ < -xLim) px_ = -xLim;
    if (px_ > xLim) px_ = xLim;
}

void App::buildDynamicText() {
    MB tx;
    const track::Station& ns = track::ST[next_];
    double remain = (stopHead(next_) - head_) * dir_;
    if (remain < 0.5) remain = 0;
    bool here = v_ < 0.1 && remain < 20;
    bool terminal = (dir_ > 0 && next_ == track::N - 1) || (dir_ < 0 && next_ == 0);
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
        addRect(tx, c - up * 0.02f, right, up, span, 0.012f, {20, 52, 120, 255});
        // Position of the train centre along the line, in station units.
        double mid = head_ - dir_ * TRAIN_LEN * 0.5;
        float pos = 0;
        for (int i = 0; i < track::N - 1; i++) {
            double a = track::stationS(i), b = track::stationS(i + 1);
            if (mid >= a) pos = i + (float)((mid - a) / (b - a));
        }
        if (pos > track::N - 1) pos = (float)(track::N - 1);
        for (int i = 0; i < track::N; i++) {
            // The map reads in the direction of travel on both walls.
            float along = (i - (track::N - 1) * 0.5f) * step * (float)(-side * dir_);
            V3 p = c + right * along;
            bool passed = dir_ > 0 ? i < pos - 0.01f : i > pos + 0.01f;
            Col dot = passed ? Col{150, 150, 150, 255} : Col{20, 52, 120, 255};
            addRect(tx, p - up * 0.02f, right, up, 0.034f, 0.034f, dot);
            addRect(tx, p - up * 0.02f, right, up, 0.018f, 0.018f, {255, 255, 255, 255});
            addText(tx, track::ST[i].ko, p + up * 0.045f, right, up, 0.027f, i == next_ ? Col{210, 30, 30, 255} : Col{30, 30, 30, 255},
                    1);
        }
        float along = (pos - (track::N - 1) * 0.5f) * step * (float)(-side * dir_);
        addRect(tx, c + right * along - up * 0.02f, right, up, 0.022f, 0.022f, {220, 30, 30, 255});
        addText(tx, dir_ > 0 ? "광운대 방면" : "서울역 방면", c - up * 0.115f, right, up, 0.03f, {20, 52, 120, 255}, 1);
    }

    // Information board on the front end wall.
    {
        V3 r = {1, 0, 0}, u = {0, 1, 0};
        float z = -train::HALF_LEN + 0.085f, x = 0.57f, y = FLOOR + 1.74f;
        addText(tx, "수도권 전철 1호선", {x, y, z}, r, u, 0.07f, {255, 255, 255, 255});
        y -= 0.1f;
        addText(tx, dir_ > 0 ? "서울역 > 광운대" : "광운대 > 서울역", {x, y, z}, r, u, 0.055f, GREEN);
        y -= 0.115f;
        snprintf(buf, sizeof(buf), "속도  %.0f km/h", v_ * 3.6);
        addText(tx, buf, {x, y, z}, r, u, 0.06f, AMBER);
        y -= 0.095f;
        snprintf(buf, sizeof(buf), "%s  %s", here ? "이번 역" : "다음 역", ns.ko);
        addText(tx, buf, {x, y, z}, r, u, 0.06f, AMBER);
        y -= 0.095f;
        snprintf(buf, sizeof(buf), "남은 거리  %.0f m", remain);
        addText(tx, buf, {x, y, z}, r, u, 0.055f, AMBER);
        y -= 0.095f;
        double fromSeoul = head_ - dir_ * TRAIN_LEN * 0.5;
        if (fromSeoul < 0) fromSeoul = 0;
        if (fromSeoul > track::total()) fromSeoul = track::total();
        snprintf(buf, sizeof(buf), "서울역 기점  %.2f / %.1f km", fromSeoul / 1000.0, track::total() / 1000.0);
        addText(tx, buf, {x, y, z}, r, u, 0.047f, GREEN);
        y -= 0.09f;
        snprintf(buf, sizeof(buf), "%s 운전   배속 x%d", manual_ ? "수동" : "자동", (int)SPEEDS[speedIdx_]);
        addText(tx, buf, {x, y, z}, r, u, 0.047f, {255, 255, 255, 255});
    }

    // Driver's desk display (only reachable in car 0).
    if (car_ == 0) {
        float zf = -train::CAB_FRONT;
        V3 r = {1, 0, 0};
        // The panel leans back: its "up" follows the slope of the desk.
        V3 u = {0, 0.392f, -0.920f};
        V3 o = {-1.16f, FLOOR + 0.862f, zf + 0.515f};
        snprintf(buf, sizeof(buf), "%.0f km/h", v_ * 3.6);
        addText(tx, buf, o + u * 0.15f, r, u, 0.1f, AMBER);
        snprintf(buf, sizeof(buf), "%s  %.0f m", ns.ko, remain);
        addText(tx, buf, o + u * 0.035f, r, u, 0.06f, GREEN);
        addText(tx, manual_ ? "수동" : "자동", o + r * 0.82f + u * 0.16f, r, u, 0.055f, {255, 255, 255, 255}, 2);
    }
    dynText_.upload(tx, true);
}

void App::update(float dt, const Input& in) {
    if (dt > 0.1f) dt = 0.1f;
    simulate(dt, in);
    movePlayer(dt, in);
    prev_ = in;

    // Everything is rendered relative to the player's car to keep float precision.
    double fx, fz;
    carPose(car_, originX_, originZ_, fx, fz);
    for (int i = 0; i < CARS; i++) {
        double x, z, cfx, cfz;
        carPose(i, x, z, cfx, cfz);
        M4 m = m4Identity();
        // columns: right, up, back (-forward), position
        m.m[0] = (float)-cfz;
        m.m[2] = (float)cfx;
        m.m[8] = (float)-cfx;
        m.m[10] = (float)-cfz;
        m.m[12] = (float)(x - originX_);
        m.m[14] = (float)(z - originZ_);
        carRel_[i] = m;
    }
    stageRel_ = m4Mul(carRel_[car_], m4Mul(m4Translate(px_, FLOOR, pz_), m4RotY(yaw_)));
    headPos_ = m4Point(carRel_[0], {0, FLOOR + 1.3f, -train::CAB_FRONT});
    headDir_ = m4Dir(carRel_[0], {0, -0.06f, -1});

    double viewS = head_ - dir_ * (train::CAB_FRONT + car_ * train::PITCH - pz_);
    world_.update(viewS, dir_, 2);
    audio_.tunnel = viewS < track::PORTAL;
    buildDynamicText();
}

static void setCommon(const Prog& p, const M4& viewProj, const M4& model, V3 eye, float gamma) {
    M4 mvp = m4Mul(viewProj, model);
    glUniformMatrix4fv(p.uMVP, 1, GL_FALSE, mvp.m);
    glUniformMatrix4fv(p.uModel, 1, GL_FALSE, model.m);
    glUniform3f(p.uEye, eye.x, eye.y, eye.z);
    glUniform1f(p.uGamma, gamma);
}

void App::render(const M4& eyeFromStage, const M4& proj, float gamma) {
    M4 view = m4Mul(eyeFromStage, m4InvRigid(stageRel_));
    M4 vp = m4Mul(proj, view);
    M4 camWorld = m4InvRigid(view);
    V3 eye = {camWorld.m[12], camWorld.m[13], camWorld.m[14]};

    const V3 skyFog = {0.80f, 0.87f, 0.94f}, tunnelFog = {0.015f, 0.015f, 0.02f};

    glDisable(GL_CULL_FACE);
    glDisable(GL_BLEND);
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LEQUAL);
    glDepthMask(GL_TRUE);
    glClearColor(powf(skyFog.x, gamma), powf(skyFog.y, gamma), powf(skyFog.z, gamma), 1);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    const Prog& W = gfx.world;
    glUseProgram(W.id);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D_ARRAY, gfx.texArray);
    glUniform1i(W.uTex, 0);
    glUniform3f(W.uHeadPos, headPos_.x, headPos_.y, headPos_.z);
    glUniform3f(W.uHeadDir, headDir_.x, headDir_.y, headDir_.z);

    // Sky, centred on the eye.
    glDepthMask(GL_FALSE);
    setCommon(W, vp, m4Translate(eye.x, 0, eye.z), eye, gamma);
    glUniform1f(W.uFogK, 0);
    glUniform1f(W.uHeadPow, 0);
    glUniform3f(W.uFogCol, skyFog.x, skyFog.y, skyFog.z);
    world_.sky.draw();
    glDepthMask(GL_TRUE);

    // Scenery.
    for (auto& kv : world_.chunks) {
        const Chunk& c = kv.second;
        M4 model = m4Translate((float)(c.ox - originX_), 0, (float)(c.oz - originZ_));
        setCommon(W, vp, model, eye, gamma);
        const V3& f = c.tunnel ? tunnelFog : skyFog;
        glUniform3f(W.uFogCol, f.x, f.y, f.z);
        glUniform1f(W.uFogK, c.tunnel ? 1.f / 260.f : 1.f / 1100.f);
        glUniform1f(W.uHeadPow, c.tunnel ? 0.9f : 0.f);
        c.mesh.draw();
    }

    // Train.
    glUniform1f(W.uFogK, 0);
    glUniform1f(W.uHeadPow, 0);
    float slide = door_ * train::DOOR_TRAVEL;
    for (int i = 0; i < CARS; i++) {
        setCommon(W, vp, carRel_[i], eye, gamma);
        meshes_.body.draw();
        if (i == 0) meshes_.cab.draw();
        if (i == CARS - 1) meshes_.rearCap.draw();
        setCommon(W, vp, m4Mul(carRel_[i], m4Translate(0, 0, -slide)), eye, gamma);
        meshes_.leafFront.draw();
        setCommon(W, vp, m4Mul(carRel_[i], m4Translate(0, 0, slide)), eye, gamma);
        meshes_.leafRear.draw();
    }

    // Text: station signs, then the displays in the player's car.
    const Prog& T = gfx.text;
    glUseProgram(T.id);
    glBindTexture(GL_TEXTURE_2D, gfx.texFont);
    glUniform1i(T.uTex, 0);
    glUniform1f(T.uHeadPow, 0);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glDepthMask(GL_FALSE);
    glEnable(GL_POLYGON_OFFSET_FILL);
    glPolygonOffset(-2.f, -2.f);
    for (auto& kv : world_.chunks) {
        const Chunk& c = kv.second;
        if (!c.text.count) continue;
        M4 model = m4Translate((float)(c.ox - originX_), 0, (float)(c.oz - originZ_));
        setCommon(T, vp, model, eye, gamma);
        const V3& f = c.tunnel ? tunnelFog : skyFog;
        glUniform3f(T.uFogCol, f.x, f.y, f.z);
        glUniform1f(T.uFogK, c.tunnel ? 1.f / 260.f : 1.f / 1100.f);
        c.text.draw();
    }
    glUniform1f(T.uFogK, 0);
    setCommon(T, vp, carRel_[car_], eye, gamma);
    dynText_.draw();
    for (int i = car_ - 1; i <= car_ + 1; i++) {
        if (i < 0 || i >= CARS) continue;
        setCommon(T, vp, carRel_[i], eye, gamma);
        meshes_.staticText.draw();
    }
    glDisable(GL_POLYGON_OFFSET_FILL);

    // Fade overlay.
    if (fade_ > 0.001f) {
        const Prog& F = gfx.flat;
        glUseProgram(F.id);
        glDisable(GL_DEPTH_TEST);
        setCommon(F, m4Identity(), m4Identity(), {0, 0, 0}, 1);
        glUniform1f(F.uFogK, 0);
        glUniform1f(F.uHeadPow, 0);
        glBlendColor(0, 0, 0, fade_);
        glBlendFunc(GL_CONSTANT_ALPHA, GL_ONE_MINUS_CONSTANT_ALPHA);
        overlay_.draw();
        glEnable(GL_DEPTH_TEST);
    }
    glDisable(GL_BLEND);
    glDepthMask(GL_TRUE);
    glBindVertexArray(0);
}
