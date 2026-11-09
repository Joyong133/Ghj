// Route geometry: Seoul Metro Line 1, Seoul Station -> Kwangwoon Univ.
// The centreline is built so that the arc length between two stations equals
// the published operating distance.
#pragma once

namespace track {

struct Station {
    const char* ko;
    const char* en;
    int number;      // station number on the line
    double lat, lon; // used for the heading between stations only
    double km;       // operating distance from the previous station
};

const int N = 15;
extern const Station ST[N];

const double TRACK_OFFSET = 2.1;    // track centre to route centreline (m)
const double STATION_HALF = 110.0;  // half length of a platform (m)
const double PORTAL = 8320.0;       // the line leaves the tunnel here (m)
const double CUT_END = PORTAL + 160.0;
const double S_MIN = -560.0;        // modelled range of the route
extern double S_MAX;

void build();
double stationS(int i);  // metres from Seoul Station
double total();
// Position (x east, z south) and unit tangent at distance s, shifted sideways
// by `lateral` metres (positive = left of the direction of increasing s).
void pose(double s, double lateral, double& x, double& z, double& tx, double& tz);
// Index of the station whose platform covers s, or -1.
int stationAt(double s);
double minRadius();

}  // namespace track
