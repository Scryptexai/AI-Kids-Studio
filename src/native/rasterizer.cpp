#include <cmath>
#include <cstdint>
#include <cstring>
#include <algorithm>
#ifdef _OPENMP
#include <omp.h>
#endif

// Render flags matching src/renderer3d.py
static const int FLAG_CAST_SHADOW  = 1;
static const int FLAG_RECV_SHADOW  = 2;
static const int FLAG_UNLIT        = 4;
static const int FLAG_FRESNEL_DOME = 8;
static const int FLAG_DOUBLE_SIDED = 16;
static const int FLAG_DEPTH_BIAS   = 32;

struct Vec3 {
    float x, y, z;
};

static inline Vec3 v_sub(Vec3 a, Vec3 b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
static inline float v_dot(Vec3 a, Vec3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
static inline Vec3 v_cross(Vec3 a, Vec3 b) {
    return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
static inline Vec3 v_norm(Vec3 a) {
    float l = std::sqrt(v_dot(a, a));
    if (l < 1e-8f) return {0.0f, 1.0f, 0.0f};
    return {a.x / l, a.y / l, a.z / l};
}

extern "C" {

void render_scene(
    int width,
    int height,
    int n_verts,
    const float* verts,          // [n_verts * 3]
    int n_tris,
    const int32_t* tris,         // [n_tris * 3]
    const float* tri_colors,     // [n_tris * 3]
    const float* tri_alphas,     // [n_tris]
    const float* tri_emissions,  // [n_tris]
    const float* tri_roughness,  // [n_tris]
    const int32_t* tri_flags,    // [n_tris]
    const float* cam_pos,        // [3]
    const float* cam_fwd,        // [3]
    const float* cam_right,      // [3]
    const float* cam_up,         // [3]
    float tan_half_fov_x,
    float tan_half_fov_y,
    const float* sun_dir_in,     // [3] (pointing toward sun)
    const float* sun_rgb,        // [3]
    const float* sky_amb,        // [3]
    const float* gnd_amb,        // [3]
    const float* bg_top,         // [3]
    const float* bg_bot,         // [3]
    int n_plights,
    const float* plights,        // [n_plights * 8]: x, y, z, r, g, b, radius, intensity
    int shadow_res,
    float* shadow_buf,           // [shadow_res * shadow_res]
    float* z_buf,                // [width * height]
    float* color_buf             // [width * height * 3] linear HDR RGB
) {
    const int npix = width * height;

    // 1. Initialize Sky Gradient & Z-buffer
    #pragma omp parallel for schedule(static)
    for (int y = 0; y < height; ++y) {
        float v = (float)y / (float)std::max(1, height - 1);
        float r = bg_top[0] * (1.0f - v) + bg_bot[0] * v;
        float g = bg_top[1] * (1.0f - v) + bg_bot[1] * v;
        float b = bg_top[2] * (1.0f - v) + bg_bot[2] * v;
        for (int x = 0; x < width; ++x) {
            int idx = y * width + x;
            z_buf[idx] = 1e30f;
            color_buf[idx * 3 + 0] = r;
            color_buf[idx * 3 + 1] = g;
            color_buf[idx * 3 + 2] = b;
        }
    }

    Vec3 sun_d = v_norm({sun_dir_in[0], sun_dir_in[1], sun_dir_in[2]});
    Vec3 up_ref = (std::fabs(sun_d.y) > 0.92f) ? Vec3{0.0f, 0.0f, 1.0f} : Vec3{0.0f, 1.0f, 0.0f};
    Vec3 s_right = v_norm(v_cross(up_ref, sun_d));
    Vec3 s_up    = v_norm(v_cross(sun_d, s_right));
    const float ortho_half = 8.5f;

    // 2. Clear & Rasterize Directional Sun Shadow Map (Orthographic around origin)
    if (shadow_res > 0 && shadow_buf != nullptr) {
        const int nsh = shadow_res * shadow_res;
        for (int i = 0; i < nsh; ++i) shadow_buf[i] = 1e30f;

        for (int ti = 0; ti < n_tris; ++ti) {
            if (!(tri_flags[ti] & FLAG_CAST_SHADOW)) continue;
            if (tri_alphas[ti] < 0.85f) continue;

            int i0 = tris[ti * 3 + 0], i1 = tris[ti * 3 + 1], i2 = tris[ti * 3 + 2];
            Vec3 p0 = {verts[i0 * 3], verts[i0 * 3 + 1], verts[i0 * 3 + 2]};
            Vec3 p1 = {verts[i1 * 3], verts[i1 * 3 + 1], verts[i1 * 3 + 2]};
            Vec3 p2 = {verts[i2 * 3], verts[i2 * 3 + 1], verts[i2 * 3 + 2]};

            auto proj_s = [&](Vec3 p, float& sx, float& sy, float& sz) {
                float u = v_dot(p, s_right) / ortho_half;
                float v = v_dot(p, s_up) / ortho_half;
                sx = (u * 0.5f + 0.5f) * (float)(shadow_res - 1);
                sy = (0.5f - v * 0.5f) * (float)(shadow_res - 1);
                sz = 20.0f - v_dot(p, sun_d);
            };

            float x0, y0, z0, x1, y1, z1, x2, y2, z2;
            proj_s(p0, x0, y0, z0);
            proj_s(p1, x1, y1, z1);
            proj_s(p2, x2, y2, z2);

            float area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
            if (std::fabs(area) < 1e-5f) continue;
            float inv_a = 1.0f / area;

            int min_x = std::max(0, (int)std::floor(std::min({x0, x1, x2})));
            int max_x = std::min(shadow_res - 1, (int)std::ceil(std::max({x0, x1, x2})));
            int min_y = std::max(0, (int)std::floor(std::min({y0, y1, y2})));
            int max_y = std::min(shadow_res - 1, (int)std::ceil(std::max({y0, y1, y2})));

            for (int py = min_y; py <= max_y; ++py) {
                for (int px = min_x; px <= max_x; ++px) {
                    float fx = (float)px + 0.5f, fy = (float)py + 0.5f;
                    float w0 = ((x1 - fx) * (y2 - fy) - (y1 - fy) * (x2 - fx)) * inv_a;
                    float w1 = ((x2 - fx) * (y0 - fy) - (y2 - fy) * (x0 - fx)) * inv_a;
                    float w2 = 1.0f - w0 - w1;
                    if (w0 >= 0.0f && w1 >= 0.0f && w2 >= 0.0f) {
                        float sz = w0 * z0 + w1 * z1 + w2 * z2;
                        int sidx = py * shadow_res + px;
                        if (sz < shadow_buf[sidx]) shadow_buf[sidx] = sz;
                    }
                }
            }
        }
    }

    Vec3 c_pos   = {cam_pos[0], cam_pos[1], cam_pos[2]};
    Vec3 c_fwd   = {cam_fwd[0], cam_fwd[1], cam_fwd[2]};
    Vec3 c_right = {cam_right[0], cam_right[1], cam_right[2]};
    Vec3 c_up    = {cam_up[0], cam_up[1], cam_up[2]};
    const float near_z = 0.15f;

    // Pass 0 = Opaque (alpha >= 0.995), Pass 1 = Translucent (alpha < 0.995, in mesh order)
    for (int pass = 0; pass < 2; ++pass) {
        for (int ti = 0; ti < n_tris; ++ti) {
            float alpha = tri_alphas[ti];
            bool is_trans = (alpha < 0.995f);
            if ((pass == 0 && is_trans) || (pass == 1 && !is_trans)) continue;
            if (alpha <= 0.005f) continue;

            int flags = tri_flags[ti];
            int i0 = tris[ti * 3 + 0], i1 = tris[ti * 3 + 1], i2 = tris[ti * 3 + 2];
            Vec3 p0 = {verts[i0 * 3], verts[i0 * 3 + 1], verts[i0 * 3 + 2]};
            Vec3 p1 = {verts[i1 * 3], verts[i1 * 3 + 1], verts[i1 * 3 + 2]};
            Vec3 p2 = {verts[i2 * 3], verts[i2 * 3 + 1], verts[i2 * 3 + 2]};

            Vec3 d0 = v_sub(p0, c_pos), d1 = v_sub(p1, c_pos), d2 = v_sub(p2, c_pos);
            float cz0 = v_dot(d0, c_fwd), cz1 = v_dot(d1, c_fwd), cz2 = v_dot(d2, c_fwd);
            if (cz0 <= near_z || cz1 <= near_z || cz2 <= near_z) continue;

            Vec3 n_world = v_norm(v_cross(v_sub(p1, p0), v_sub(p2, p0)));
            Vec3 tri_mid = {(p0.x + p1.x + p2.x) / 3.0f, (p0.y + p1.y + p2.y) / 3.0f, (p0.z + p1.z + p2.z) / 3.0f};
            Vec3 view_vec = v_norm(v_sub(c_pos, tri_mid));
            float ndotv = v_dot(n_world, view_vec);
            if (!(flags & FLAG_DOUBLE_SIDED) && ndotv < -0.02f) continue;
            if (ndotv < 0.0f) {
                n_world = {-n_world.x, -n_world.y, -n_world.z};
                ndotv = -ndotv;
            }

            auto proj_c = [&](Vec3 d, float cz, float& sx, float& sy) {
                float nx = v_dot(d, c_right) / (cz * tan_half_fov_x);
                float ny = v_dot(d, c_up) / (cz * tan_half_fov_y);
                sx = (nx * 0.5f + 0.5f) * (float)(width - 1);
                sy = (0.5f - ny * 0.5f) * (float)(height - 1);
            };

            float sx0, sy0, sx1, sy1, sx2, sy2;
            proj_c(d0, cz0, sx0, sy0);
            proj_c(d1, cz1, sx1, sy1);
            proj_c(d2, cz2, sx2, sy2);

            float area = (sx1 - sx0) * (sy2 - sy0) - (sy1 - sy0) * (sx2 - sx0);
            if (std::fabs(area) < 1e-4f) continue;
            float inv_a = 1.0f / area;

            int min_x = std::max(0, (int)std::floor(std::min({sx0, sx1, sx2})));
            int max_x = std::min(width - 1, (int)std::ceil(std::max({sx0, sx1, sx2})));
            int min_y = std::max(0, (int)std::floor(std::min({sy0, sy1, sy2})));
            int max_y = std::min(height - 1, (int)std::ceil(std::max({sy0, sy1, sy2})));
            if (min_x > max_x || min_y > max_y) continue;

            float inv_z0 = 1.0f / cz0, inv_z1 = 1.0f / cz1, inv_z2 = 1.0f / cz2;
            float z_bias = (flags & FLAG_DEPTH_BIAS) ? -0.018f : 0.0f;

            float cr = tri_colors[ti * 3 + 0];
            float cg = tri_colors[ti * 3 + 1];
            float cb = tri_colors[ti * 3 + 2];
            float emit = tri_emissions[ti];
            float rough = tri_roughness[ti];

            // Precompute directional & hemisphere terms per-face (crisp stylized low-poly look!)
            float ndotl = std::max(0.0f, v_dot(n_world, sun_d));
            float hemi = n_world.y * 0.5f + 0.5f;
            float amb_r = gnd_amb[0] * (1.0f - hemi) + sky_amb[0] * hemi;
            float amb_g = gnd_amb[1] * (1.0f - hemi) + sky_amb[1] * hemi;
            float amb_b = gnd_amb[2] * (1.0f - hemi) + sky_amb[2] * hemi;

            Vec3 half_v = v_norm({sun_d.x + view_vec.x, sun_d.y + view_vec.y, sun_d.z + view_vec.z});
            float spec_pow = std::max(4.0f, (1.0f - rough) * 48.0f);
            float spec = (1.0f - rough) * 0.28f * std::pow(std::max(0.0f, v_dot(n_world, half_v)), spec_pow);

            float eff_alpha = alpha;
            if (flags & FLAG_FRESNEL_DOME) {
                float rim = std::pow(1.0f - std::min(1.0f, ndotv), 1.8f);
                eff_alpha = std::min(0.92f, alpha * (0.35f + 1.45f * rim));
            }

            for (int py = min_y; py <= max_y; ++py) {
                for (int px = min_x; px <= max_x; ++px) {
                    float fx = (float)px + 0.5f, fy = (float)py + 0.5f;
                    float w0 = ((sx1 - fx) * (sy2 - fy) - (sy1 - fy) * (sx2 - fx)) * inv_a;
                    float w1 = ((sx2 - fx) * (sy0 - fy) - (sy2 - fy) * (sx0 - fx)) * inv_a;
                    float w2 = 1.0f - w0 - w1;
                    if (w0 < 0.0f || w1 < 0.0f || w2 < 0.0f) continue;

                    float inv_z = w0 * inv_z0 + w1 * inv_z1 + w2 * inv_z2;
                    float cz = (1.0f / inv_z) + z_bias;
                    int idx = py * width + px;
                    if (cz > z_buf[idx]) continue;

                    if (!is_trans) z_buf[idx] = cz;

                    float pw0 = (w0 * inv_z0) / inv_z;
                    float pw1 = (w1 * inv_z1) / inv_z;
                    float pw2 = 1.0f - pw0 - pw1;
                    Vec3 wp = {
                        pw0 * p0.x + pw1 * p1.x + pw2 * p2.x,
                        pw0 * p0.y + pw1 * p1.y + pw2 * p2.y,
                        pw0 * p0.z + pw1 * p1.z + pw2 * p2.z
                    };

                    float sr, sg, sb;
                    if (flags & FLAG_UNLIT) {
                        float mul = std::max(1.0f, emit);
                        sr = cr * mul;
                        sg = cg * mul;
                        sb = cb * mul;
                    } else {
                        // Soft 3x3 PCF shadow lookup
                        float shadow = 1.0f;
                        if ((flags & FLAG_RECV_SHADOW) && shadow_res > 0 && ndotl > 0.01f) {
                            float su = (v_dot(wp, s_right) / ortho_half * 0.5f + 0.5f) * (float)(shadow_res - 1);
                            float sv = (0.5f - v_dot(wp, s_up) / ortho_half * 0.5f) * (float)(shadow_res - 1);
                            float sz_cur = 20.0f - v_dot(wp, sun_d) - 0.055f;
                            int isx = (int)std::round(su), isy = (int)std::round(sv);
                            if (isx >= 1 && isx < shadow_res - 1 && isy >= 1 && isy < shadow_res - 1) {
                                int lit = 0;
                                for (int dy = -1; dy <= 1; ++dy) {
                                    for (int dx = -1; dx <= 1; ++dx) {
                                        if (sz_cur <= shadow_buf[(isy + dy) * shadow_res + (isx + dx)]) lit++;
                                    }
                                }
                                // Shadow-safe floor (0.42) per Style Guide so mechanical details stay super clear!
                                shadow = 0.42f + 0.58f * ((float)lit / 9.0f);
                            }
                        }

                        float lr = amb_r + sun_rgb[0] * ndotl * shadow;
                        float lg = amb_g + sun_rgb[1] * ndotl * shadow;
                        float lb = amb_b + sun_rgb[2] * ndotl * shadow;

                        for (int li = 0; li < n_plights; ++li) {
                            const float* pl = &plights[li * 8];
                            Vec3 lvec = {pl[0] - wp.x, pl[1] - wp.y, pl[2] - wp.z};
                            float dist2 = v_dot(lvec, lvec);
                            float rad = pl[6];
                            if (dist2 < rad * rad) {
                                float dist = std::sqrt(dist2);
                                float att = 1.0f - (dist / rad);
                                att = att * att * pl[7];
                                Vec3 ldir = (dist > 1e-4f) ? Vec3{lvec.x / dist, lvec.y / dist, lvec.z / dist} : Vec3{0, 1, 0};
                                float p_ndotl = 0.35f + 0.65f * std::max(0.0f, v_dot(n_world, ldir));
                                lr += pl[3] * att * p_ndotl;
                                lg += pl[4] * att * p_ndotl;
                                lb += pl[5] * att * p_ndotl;
                            }
                        }

                        sr = cr * (lr + emit) + spec * shadow;
                        sg = cg * (lg + emit) + spec * shadow;
                        sb = cb * (lb + emit) + spec * shadow;
                    }

                    if (is_trans) {
                        color_buf[idx * 3 + 0] = color_buf[idx * 3 + 0] * (1.0f - eff_alpha) + sr * eff_alpha;
                        color_buf[idx * 3 + 1] = color_buf[idx * 3 + 1] * (1.0f - eff_alpha) + sg * eff_alpha;
                        color_buf[idx * 3 + 2] = color_buf[idx * 3 + 2] * (1.0f - eff_alpha) + sb * eff_alpha;
                    } else {
                        color_buf[idx * 3 + 0] = sr;
                        color_buf[idx * 3 + 1] = sg;
                        color_buf[idx * 3 + 2] = sb;
                    }
                }
            }
        }
    }
}

} // extern "C"
