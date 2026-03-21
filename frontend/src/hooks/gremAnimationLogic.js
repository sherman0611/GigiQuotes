import { useEffect, useRef, useState, useCallback } from 'react';

// ─── ADJUSTABLE CONFIGURATION ────────────────────────────────────────────────
const CONFIG = {
    // NPC Probabilities
    NPC_INITIAL_BITE_CHANCE: 0.40,
    NPC_CHAIN_BITE_CHANCE: 0.80,
    NPC_MAX_BITE_STREAK: 8,
    NPC_PAUSE_CHANCE: 0.20,
    NPC_WANDER_TO_BITE_CHANCE: 0.20,

    // User Behavior
    USER_PAUSE_CHANCE: 0.30,
    USER_IDLE_TIMEOUT: 3000,
    USER_RUSH_SPEED: 20,

    // General Speeds
    BITE_LUNGE_SPEED: 12,
    BITE_RECOIL_SPEED: 8,
    APPROACH_SPEED: 5,
    WANDER_SPEED: 1,

    // Timing & Intervals
    PAUSE_MIN_MS: 2000,
    PAUSE_MAX_MS: 5000,
    BITE_HIT_PAUSE_MS: 400,
    RECOIL_PAUSE_MS: 600,
};

const STATE = {
    WANDERING: 'WANDERING',
    PAUSING: 'PAUSING',
    APPROACHING: 'APPROACHING',
    LUNGING: 'LUNGING',
    RECOILING: 'RECOILING',
    RETREATING: 'RETREATING',
    ORBITING: 'ORBITING',
};

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────
function buildDims(containerW, containerH, foodSize, gremSize) {
    const halfW = containerW / 2;
    const halfH = containerH / 2;
    const maxR = Math.min(halfW, halfH) - gremSize / 2;
    const foodR = foodSize / 2 + 20;
    const gremHalf = gremSize / 2;

    return {
        halfW, halfH, maxR, foodR, gremHalf,
        biteReadyR: foodR + gremHalf + 2,
        biteInsideR: foodR - 15,
        orbitR: foodR + 60,
        wanderMin: foodR + gremHalf + 40,
        wanderMax: maxR
    };
}

/**
 * Only clamps to the outer screen edges.
 * Food collision removed to prevent sticking.
 */
function clampToContainer(x, y, dims) {
    const { halfW, halfH } = dims;
    let cx = Math.max(-halfW, Math.min(halfW, x));
    let cy = Math.max(-halfH, Math.min(halfH, y));
    return { x: cx, y: cy };
}

// ─── HOOK ────────────────────────────────────────────────────────────────────
export function useGremAnimationLogic(areaRef, isUser = false) {
    const dimsRef = useRef(null);
    const [isIdle, setIsIdle] = useState(false);
    const [isBiting, setIsBiting] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0, rotation: 0 });

    const sim = useRef({
        x: 0, y: 0, rot: 0,
        state: STATE.WANDERING,
        targetX: 0, targetY: 0,
        biteAngle: 0,
        isMidBite: false,
        pendingUserBite: false,
        timer: null,
        idleTimeout: null,
        biteStreak: 0,
    });

    const readDims = useCallback(() => {
        const el = areaRef?.current;
        if (!el) return null;
        const style = getComputedStyle(el);
        const foodSize = parseFloat(style.getPropertyValue('--food-size')) || 200;
        const gremSize = parseFloat(style.getPropertyValue('--grem-size')) || 50;
        return buildDims(el.clientWidth, el.clientHeight, foodSize, gremSize);
    }, [areaRef]);

    const getRandomPoint = (d) => {
        const angle = Math.random() * Math.PI * 2;
        const r = d.wanderMin + Math.random() * (d.wanderMax - d.wanderMin);
        return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
    };

    const goTo = useCallback((newState, tx, ty) => {
        const s = sim.current;
        if (s.timer) { clearTimeout(s.timer); s.timer = null; }

        s.state = newState;
        s.targetX = tx;
        s.targetY = ty;

        setIsIdle(newState === STATE.WANDERING || newState === STATE.PAUSING);
        setIsBiting([STATE.APPROACHING, STATE.LUNGING, STATE.RECOILING].includes(newState));
    }, []);

    const startBite = useCallback(() => {
        const s = sim.current;
        const d = dimsRef.current;
        if (!d) return; // Removed s.isMidBite check here to allow forcing

        s.isMidBite = true;
        s.biteAngle = Math.atan2(s.y, s.x);

        // Jump straight to APPROACHING state
        goTo(STATE.APPROACHING,
            Math.cos(s.biteAngle) * d.biteReadyR,
            Math.sin(s.biteAngle) * d.biteReadyR
        );
    }, [goTo]);

    const triggerBite = useCallback(() => {
        if (!isUser) return;
        const s = sim.current;

        // 1. Clear any existing movement or pause timers to take control
        if (s.timer) {
            clearTimeout(s.timer);
            s.timer = null;
        }
        if (s.idleTimeout) {
            clearTimeout(s.idleTimeout);
        }

        // 2. Reset bite status to force a fresh animation even if already biting
        s.isMidBite = false;
        s.pendingUserBite = true;

        // 3. Set the idle timeout (returns to wandering if user stops clicking)
        s.idleTimeout = setTimeout(() => {
            if (dimsRef.current) {
                const p = getRandomPoint(dimsRef.current);
                goTo(STATE.WANDERING, p.x, p.y);
            }
        }, CONFIG.USER_IDLE_TIMEOUT);
    }, [isUser, goTo]);

    useEffect(() => {
        const dims = readDims();
        dimsRef.current = dims;
        if (dims) {
            const angle = Math.random() * Math.PI * 2;
            sim.current.x = Math.cos(angle) * dims.wanderMax;
            sim.current.y = Math.sin(angle) * dims.wanderMax;
            const p = getRandomPoint(dims);
            goTo(STATE.WANDERING, p.x, p.y);
        }

        let rafId;
        const tick = () => {
            const s = sim.current;
            const d = dimsRef.current;
            if (!d) { rafId = requestAnimationFrame(tick); return; }

            if (s.pendingUserBite) { s.pendingUserBite = false; startBite(); }

            let speed = 0;
            switch (s.state) {
                case STATE.APPROACHING:
                    speed = isUser ? CONFIG.USER_RUSH_SPEED : CONFIG.WANDER_SPEED;
                    break;

                case STATE.LUNGING:
                    speed = isUser ? CONFIG.BITE_LUNGE_SPEED : CONFIG.WANDER_SPEED;
                    break;

                case STATE.RECOILING: speed = CONFIG.BITE_RECOIL_SPEED; break;
                case STATE.RETREATING: speed = CONFIG.APPROACH_SPEED; break;
                case STATE.WANDERING: speed = CONFIG.WANDER_SPEED; break;
                case STATE.ORBITING: speed = 1.5; break;
                default: speed = 0;
            }

            const dx = s.targetX - s.x;
            const dy = s.targetY - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 1.5 && speed > 0) {
                const step = Math.min(speed, dist);
                s.x += (dx / dist) * step;
                s.y += (dy / dist) * step;
                s.rot = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
            }

            const clamped = clampToContainer(s.x, s.y, d);
            s.x = clamped.x; s.y = clamped.y;

            if (dist < 4 && !s.timer && s.state !== STATE.PAUSING && s.state !== STATE.ORBITING) {
                handleArrival(s, d);
            }

            setPos({ x: s.x, y: s.y, rotation: s.rot });
            rafId = requestAnimationFrame(tick);
        };

        const handleArrival = (s, d) => {
            switch (s.state) {
                case STATE.APPROACHING:
                    s.biteStreak++;
                    s.biteAngle = Math.atan2(s.y, s.x);
                    goTo(STATE.LUNGING, Math.cos(s.biteAngle) * d.biteInsideR, Math.sin(s.biteAngle) * d.biteInsideR);
                    break;
                case STATE.LUNGING:
                    s.timer = setTimeout(() => {
                        s.timer = null;
                        goTo(STATE.RECOILING, Math.cos(s.biteAngle) * d.biteReadyR, Math.sin(s.biteAngle) * d.biteReadyR);
                    }, CONFIG.BITE_HIT_PAUSE_MS);
                    break;
                case STATE.RECOILING:
                    s.timer = setTimeout(() => {
                        s.timer = null;
                        goTo(STATE.RETREATING, Math.cos(s.biteAngle) * d.orbitR, Math.sin(s.biteAngle) * d.orbitR);
                    }, CONFIG.RECOIL_PAUSE_MS);
                    break;
                case STATE.RETREATING:
                    s.isMidBite = false;
                    if (isUser) s.state = STATE.ORBITING;
                    else {
                        if (s.biteStreak < CONFIG.NPC_MAX_BITE_STREAK && Math.random() < CONFIG.NPC_CHAIN_BITE_CHANCE) startBite();
                        else { s.biteStreak = 0; finishWander(s, d); }
                    }
                    break;
                case STATE.WANDERING:
                    const pChance = isUser ? CONFIG.USER_PAUSE_CHANCE : CONFIG.NPC_PAUSE_CHANCE;
                    if (Math.random() < pChance) {
                        s.state = STATE.PAUSING;
                        s.timer = setTimeout(() => {
                            s.timer = null;
                            finishWander(s, d);
                        }, CONFIG.PAUSE_MIN_MS + Math.random() * (CONFIG.PAUSE_MAX_MS - CONFIG.PAUSE_MIN_MS));
                    } else finishWander(s, d);
                    break;
            }
        };

        const finishWander = (s, d) => {
            if (!isUser && Math.random() < CONFIG.NPC_WANDER_TO_BITE_CHANCE) {
                startBite();
            } else {
                const p = getRandomPoint(d);
                goTo(STATE.WANDERING, p.x, p.y);
            }
        };

        rafId = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(rafId);
            if (sim.current.timer) clearTimeout(sim.current.timer);
            if (sim.current.idleTimeout) clearTimeout(sim.current.idleTimeout);
        };
    }, [isUser, startBite, goTo, readDims]);

    return { ...pos, isIdle, isBiting, triggerBite };
}