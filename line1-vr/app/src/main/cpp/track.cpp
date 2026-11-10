#include "track.h"

#include <cmath>
#include <vector>

namespace track {

// Operating distances: Seoul Station - Cheongnyangni is the 7.8 km Seoul Metro
// section, the rest follows the Gyeongwon line kilometre posts.
const Station ST[N] = {
    {"서울역", "Seoul Station", 133, 37.5560, 126.9723, 0.0},
    {"시청", "City Hall", 132, 37.5657, 126.9769, 1.1},
    {"종각", "Jonggak", 131, 37.5702, 126.9831, 1.0},
    {"종로3가", "Jongno 3(sam)-ga", 130, 37.5704, 126.9921, 0.8},
    {"종로5가", "Jongno 5(o)-ga", 129, 37.5709, 127.0019, 0.9},
    {"동대문", "Dongdaemun", 128, 37.5717, 127.0110, 0.8},
    {"동묘앞", "Dongmyo", 127, 37.5733, 127.0165, 0.6},
    {"신설동", "Sinseol-dong", 126, 37.5760, 127.0251, 0.7},
    {"제기동", "Jegi-dong", 125, 37.5781, 127.0348, 0.9},
    {"청량리", "Cheongnyangni", 124, 37.5801, 127.0448, 1.0},
    {"회기", "Hoegi", 123, 37.5898, 127.0579, 1.4},
    {"외대앞", "Hankuk Univ. of Foreign Studies", 122, 37.5961, 127.0636, 0.8},
    {"신이문", "Sinimun", 121, 37.6017, 127.0672, 0.8},
    {"석계", "Seokgye", 120, 37.6149, 127.0657, 1.4},
    {"광운대", "Kwangwoon Univ.", 119, 37.6236, 127.0617, 1.1},
};

double S_MAX = 0;

namespace {
struct P2 {
    double x, z;
};
double gS[N];
std::vector<P2> gTable;  // centreline sampled every metre from S_MIN
const double STRAIGHT = 120.0;  // straight track each side of a station centre

P2 hermite(P2 a, P2 ma, P2 b, P2 mb, double t) {
    double t2 = t * t, t3 = t2 * t;
    double h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    return {h00 * a.x + h10 * ma.x + h01 * b.x + h11 * mb.x, h00 * a.z + h10 * ma.z + h01 * b.z + h11 * mb.z};
}
}  // namespace

void build() {
    if (!gTable.empty()) return;
    gS[0] = 0;
    for (int i = 1; i < N; i++) gS[i] = gS[i - 1] + ST[i].km * 1000.0;
    S_MAX = gS[N - 1] + 700.0;

    // Heading of every station-to-station leg from the coordinates.
    P2 dir[N - 1];
    const double latM = 111320.0, lonM = 111320.0 * cos(37.58 * M_PI / 180.0);
    for (int i = 0; i < N - 1; i++) {
        double e = (ST[i + 1].lon - ST[i].lon) * lonM, n = (ST[i + 1].lat - ST[i].lat) * latM;
        double l = sqrt(e * e + n * n);
        dir[i] = {e / l, -n / l};
    }
    // Heading of the track through each station (platforms are straight).
    P2 head[N];
    for (int i = 0; i < N; i++) {
        P2 a = dir[i > 0 ? i - 1 : 0], b = dir[i < N - 1 ? i : N - 2];
        double x = a.x + b.x, z = a.z + b.z, l = sqrt(x * x + z * z);
        head[i] = {x / l, z / l};
    }

    // Chord lengths are adjusted until each leg's arc length is the real distance.
    double chord[N - 1];
    for (int i = 0; i < N - 1; i++) chord[i] = ST[i + 1].km * 1000.0;
    std::vector<P2> fine;
    std::vector<double> fineS;
    for (int iter = 0; iter < 30; iter++) {
        P2 p[N];
        p[0] = {0, 0};
        for (int i = 0; i < N - 1; i++) p[i + 1] = {p[i].x + dir[i].x * chord[i], p[i].z + dir[i].z * chord[i]};
        fine.clear();
        fineS.clear();
        auto push = [&](P2 q) {
            if (fine.empty()) {
                fine.push_back(q);
                fineS.push_back(S_MIN);
                return;
            }
            P2 b = fine.back();
            double d = sqrt((q.x - b.x) * (q.x - b.x) + (q.z - b.z) * (q.z - b.z));
            if (d < 1e-9) return;
            fine.push_back(q);
            fineS.push_back(fineS.back() + d);
        };
        push({p[0].x + head[0].x * S_MIN, p[0].z + head[0].z * S_MIN});
        double legLen[N - 1];
        for (int i = 0; i < N - 1; i++) {
            P2 a = {p[i].x + head[i].x * STRAIGHT, p[i].z + head[i].z * STRAIGHT};
            P2 b = {p[i + 1].x - head[i + 1].x * STRAIGHT, p[i + 1].z - head[i + 1].z * STRAIGHT};
            double c = sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
            P2 ma = {head[i].x * c, head[i].z * c}, mb = {head[i + 1].x * c, head[i + 1].z * c};
            push(p[i]);
            double start = fineS.back();
            const int steps = 4000;
            for (int k = 0; k <= steps; k++) push(hermite(a, ma, b, mb, (double)k / steps));
            push(p[i + 1]);
            legLen[i] = fineS.back() - start;
        }
        double ext = S_MAX - gS[N - 1];
        push({p[N - 1].x + head[N - 1].x * ext, p[N - 1].z + head[N - 1].z * ext});
        for (int i = 0; i < N - 1; i++) chord[i] *= (ST[i + 1].km * 1000.0) / legLen[i];
    }

    // Resample at one metre spacing.
    int count = (int)(S_MAX - S_MIN) + 1;
    gTable.resize(count);
    size_t j = 0;
    for (int k = 0; k < count; k++) {
        double s = S_MIN + k;
        while (j + 2 < fine.size() && fineS[j + 1] < s) j++;
        double span = fineS[j + 1] - fineS[j];
        double t = span > 0 ? (s - fineS[j]) / span : 0;
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        gTable[k] = {fine[j].x + (fine[j + 1].x - fine[j].x) * t, fine[j].z + (fine[j + 1].z - fine[j].z) * t};
    }
}

double stationS(int i) { return gS[i]; }
double total() { return gS[N - 1]; }

void pose(double s, double lateral, double& x, double& z, double& tx, double& tz) {
    double f = s - S_MIN;
    int n = (int)gTable.size();
    if (f < 0) f = 0;
    if (f > n - 1.001) f = n - 1.001;
    int k = (int)f;
    double t = f - k;
    P2 a = gTable[k], b = gTable[k + 1];
    // Tangent blended from the neighbouring spans so that it changes smoothly.
    P2 pa = gTable[k > 0 ? k - 1 : 0], nb = gTable[k + 2 < n ? k + 2 : n - 1];
    double t0x = b.x - pa.x, t0z = b.z - pa.z, t1x = nb.x - a.x, t1z = nb.z - a.z;
    tx = t0x + (t1x - t0x) * t;
    tz = t0z + (t1z - t0z) * t;
    double l = sqrt(tx * tx + tz * tz);
    tx /= l;
    tz /= l;
    // Left normal = up x tangent.
    x = a.x + (b.x - a.x) * t + tz * lateral;
    z = a.z + (b.z - a.z) * t - tx * lateral;
}

void stationFrame(int i, double& ox, double& oz, double& tx, double& tz) { pose(gS[i], 0, ox, oz, tx, tz); }

int stationAt(double s) {
    for (int i = 0; i < N; i++)
        if (fabs(s - gS[i]) < STATION_HALF) return i;
    return -1;
}

double minRadius() {
    double best = 1e9;
    for (double s = S_MIN + 20; s < S_MAX - 20; s += 5) {
        double x, z, ax, az, bx, bz;
        pose(s - 10, 0, x, z, ax, az);
        pose(s + 10, 0, x, z, bx, bz);
        double ang = fabs(atan2(ax * bz - az * bx, ax * bx + az * bz));
        if (ang > 1e-6 && 20.0 / ang < best) best = 20.0 / ang;
    }
    return best;
}

}  // namespace track
