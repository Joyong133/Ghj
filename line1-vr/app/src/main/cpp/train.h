// Train car geometry. Car-local axes: +x right, +y up, -z towards the front.
#pragma once
#include "gfx.h"

namespace train {

const int CARS = 10;
const float PITCH = 20.f;        // distance between car centres
const float FLOOR = 1.15f;       // floor height above the rail
const float HALF_LEN = 9.75f;    // half length of a car body
const float HALF_IN = 1.45f;     // interior half width
const float HALF_OUT = 1.56f;    // exterior half width
const float CEIL = 2.25f;        // interior height
const float CAB_FRONT = 11.6f;   // front of the cab, from the centre of car 0
const float DOOR_Z[4] = {-7.2f, -2.4f, 2.4f, 7.2f};
const float DOOR_HALF = 0.65f;
const float DOOR_H = 1.9f;
const float DOOR_TRAVEL = 0.62f;

struct Meshes {
    Mesh body;       // one passenger car, without the platform-side door leaves
    Mesh leafFront;  // platform-side leaves that slide towards the front
    Mesh leafRear;   // ... and towards the rear
    Mesh cab;        // driver's cab, attached to the front of car 0
    Mesh rearCap;    // closes the gangway at the back of the last car
    Mesh staticText; // notices shared by every car
    void init();
    void destroy();
};

}  // namespace train
