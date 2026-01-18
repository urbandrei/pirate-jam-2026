/**
 * Math utilities for vector and quaternion operations
 */

// Vector3 operations
export const Vec3 = {
    create(x = 0, y = 0, z = 0) {
        return { x, y, z };
    },

    copy(v) {
        return { x: v.x, y: v.y, z: v.z };
    },

    add(a, b) {
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    },

    sub(a, b) {
        return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    },

    scale(v, s) {
        return { x: v.x * s, y: v.y * s, z: v.z * s };
    },

    length(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    },

    lengthSquared(v) {
        return v.x * v.x + v.y * v.y + v.z * v.z;
    },

    normalize(v) {
        const len = Vec3.length(v);
        if (len === 0) return { x: 0, y: 0, z: 0 };
        return Vec3.scale(v, 1 / len);
    },

    distance(a, b) {
        return Vec3.length(Vec3.sub(a, b));
    },

    lerp(a, b, t) {
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t
        };
    },

    dot(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    },

    cross(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }
};

// Quaternion operations
export const Quat = {
    create(x = 0, y = 0, z = 0, w = 1) {
        return { x, y, z, w };
    },

    identity() {
        return { x: 0, y: 0, z: 0, w: 1 };
    },

    copy(q) {
        return { x: q.x, y: q.y, z: q.z, w: q.w };
    },

    fromEuler(pitch, yaw, roll) {
        const cy = Math.cos(yaw * 0.5);
        const sy = Math.sin(yaw * 0.5);
        const cp = Math.cos(pitch * 0.5);
        const sp = Math.sin(pitch * 0.5);
        const cr = Math.cos(roll * 0.5);
        const sr = Math.sin(roll * 0.5);

        return {
            w: cr * cp * cy + sr * sp * sy,
            x: sr * cp * cy - cr * sp * sy,
            y: cr * sp * cy + sr * cp * sy,
            z: cr * cp * sy - sr * sp * cy
        };
    },

    multiply(a, b) {
        return {
            w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
            x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
        };
    },

    slerp(a, b, t) {
        let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

        // If dot is negative, negate one quaternion to take shorter path
        if (dot < 0) {
            b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
            dot = -dot;
        }

        // If quaternions are very close, use linear interpolation
        if (dot > 0.9995) {
            return {
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t,
                z: a.z + (b.z - a.z) * t,
                w: a.w + (b.w - a.w) * t
            };
        }

        const theta0 = Math.acos(dot);
        const theta = theta0 * t;
        const sinTheta = Math.sin(theta);
        const sinTheta0 = Math.sin(theta0);

        const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
        const s1 = sinTheta / sinTheta0;

        return {
            x: a.x * s0 + b.x * s1,
            y: a.y * s0 + b.y * s1,
            z: a.z * s0 + b.z * s1,
            w: a.w * s0 + b.w * s1
        };
    }
};

// Utility functions
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

export function degToRad(degrees) {
    return degrees * (Math.PI / 180);
}

export function radToDeg(radians) {
    return radians * (180 / Math.PI);
}
