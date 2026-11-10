// Scenery along the route, generated in 40 m chunks around the viewer.
#pragma once
#include <map>
#include <vector>

#include "gfx.h"

struct Glow {
    V3 p;  // relative to the chunk origin
    Col c;
    float size;
};

struct Chunk {
    Mesh mesh, glass, cut, text;
    std::vector<Glow> glows;
    double ox = 0, oz = 0;  // world position of the chunk origin
    bool tunnel = false;
};

struct World {
    static constexpr double CHUNK = 40.0;
    std::map<int, Chunk> chunks;
    Mesh skyDome, scenery;
    // Sliding leaves of the platform screen doors of one platform, in the
    // station frame (x right, -z along the route), for the platform on the left.
    Mesh psdLeafA, psdLeafB, psdGlassA, psdGlassB;

    static int firstChunk();
    void init();
    // Keeps the chunks around distance s loaded (dir = travel direction);
    // builds at most `budget` new ones per call.
    void update(double s, int dir, int budget);
    void destroy();
};

// Positions of the door centres along a platform, relative to the station centre.
std::vector<float> platformDoors();
