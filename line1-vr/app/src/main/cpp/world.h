// Scenery along the route, generated in 40 m chunks around the viewer.
#pragma once
#include <map>

#include "gfx.h"

struct Chunk {
    Mesh mesh, text;
    double ox = 0, oz = 0;  // world position of the chunk origin
    bool tunnel = false;
};

struct World {
    static constexpr double CHUNK = 40.0;
    std::map<int, Chunk> chunks;
    Mesh sky;

    static int firstChunk();
    void init();
    // Keeps the chunks around distance s loaded (dir = travel direction);
    // builds at most `budget` new ones per call.
    void update(double s, int dir, int budget);
    void destroy();
};
