#!/usr/bin/env python3
"""
SHADOW ENGINE for calibrating hypertrophy.candidate.config.json

IMPORTANT: This is an INDEPENDENT RE-IMPLEMENTATION written from the product spec's
description (Metric -> Assessment -> Action; Status -> Severity; Leverage = Severity x GoalWeight;
materiality; Fit Score derived from leverage). The real engine (packages/domain/...) was NOT
available to the audit pass. Outputs here show how the CANDIDATE NUMBERS behave under this
stand-in logic. They are not outputs of the production engine and must be re-run there.
"""
import json, sys, copy
from collections import defaultdict

CFG_PATH = sys.argv[1] if len(sys.argv) > 1 else "hypertrophy.candidate.config.json"
BASE = json.load(open(CFG_PATH))

# ---------------------------------------------------------------- exercise reference (Tier 2/3 mapping)
def X(m, pat, grp, region=None): return dict(m=m, pat=pat, grp=grp, region=region)
PRESS = {"chest": 1, "triceps": .5, "front_delts": .5}
ROW = {"back": 1, "biceps": .5, "rear_delts": .5}
PULLDN = {"back": 1, "biceps": .5}
SQ = {"quads": 1, "glutes": .5}
EX = {
    "bench_press": X(PRESS, "push_h", "h_press"), "incline_db_press": X(PRESS, "push_h", "h_press"),
    "machine_chest_press": X(PRESS, "push_h", "h_press"), "push_up": X(PRESS, "push_h", "h_press"),
    "cable_fly": X({"chest": 1}, "iso", "fly"),
    "overhead_press": X({"front_delts": 1, "side_delts": .5, "triceps": .5}, "push_v", "v_press"),
    "lateral_raise": X({"side_delts": 1}, "iso", "lateral"),
    "reverse_pec_deck": X({"rear_delts": 1}, "iso", "reardelt"), "face_pull": X({"rear_delts": 1}, "iso", "reardelt"),
    "lat_pulldown": X(PULLDN, "pull_v", "pulldown"), "pull_up": X(PULLDN, "pull_v", "pulldown"),
    "seated_row": X(ROW, "pull_h", "row"), "chest_supported_row": X(ROW, "pull_h", "row"), "barbell_row": X(ROW, "pull_h", "row"),
    "triceps_pushdown": X({"triceps": 1}, "iso", "tri", "tri_standard"),
    "overhead_triceps_ext": X({"triceps": 1}, "iso", "tri", "tri_overhead"),
    "biceps_curl": X({"biceps": 1}, "iso", "curl"), "hammer_curl": X({"biceps": 1}, "iso", "curl"),
    "incline_curl": X({"biceps": 1}, "iso", "curl"), "preacher_curl": X({"biceps": 1}, "iso", "curl"),
    "back_squat": X(SQ, "squat", "squat"), "leg_press": X(SQ, "squat", "squat"),
    "leg_extension": X({"quads": 1}, "iso", "legext"),
    "walking_lunge": X({"quads": 1, "glutes": .5}, "lunge", "lunge"),
    "rdl": X({"hamstrings": 1, "glutes": .5}, "hinge", "hinge", "ham_hip"),
    "leg_curl": X({"hamstrings": 1}, "iso", "legcurl", "ham_knee"), "seated_leg_curl": X({"hamstrings": 1}, "iso", "legcurl", "ham_knee"),
    "hip_thrust": X({"glutes": 1, "hamstrings": .5}, "hinge", "hipthrust", "ham_hip"),
    "standing_calf_raise": X({"calves": 1}, "iso", "calf", "calf_straight"),
    "seated_calf_raise": X({"calves": 1}, "iso", "calf", "calf_bent"),
}
MUSCLES = ["chest", "back", "front_delts", "side_delts", "rear_delts", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "abs"]
DAYS = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}

def e(ex, sets, reps=(8, 12), rir=2, mech="double_progression", inc=None):
    return dict(ex=ex, sets=sets, reps=reps, rir=rir, mech=mech, inc=inc)

# ---------------------------------------------------------------- test programs
def prog_A():  # clearly under-dosed: 2-day full body, 2 sets/exercise
    return {0: [e("bench_press", 2, (6, 10)), e("lat_pulldown", 2), e("back_squat", 2, (6, 10))],
            3: [e("overhead_press", 2), e("seated_row", 2), e("rdl", 2, (8, 10))]}
def prog_B():  # balanced 5-day hypertrophy
    return {0: [e("bench_press", 3, (6, 10)), e("incline_db_press", 3), e("lat_pulldown", 3), e("seated_row", 3),
                e("lateral_raise", 3, (12, 20), 1), e("face_pull", 3, (12, 20), 1), e("triceps_pushdown", 3, (10, 15), 1)],
            1: [e("back_squat", 3, (6, 10)), e("rdl", 3, (8, 10)), e("leg_extension", 3, (10, 15), 1),
                e("leg_curl", 3, (10, 15), 1), e("standing_calf_raise", 5, (8, 15), 1)],
            3: [e("machine_chest_press", 3), e("cable_fly", 3, (10, 15), 1), e("pull_up", 3, (6, 10)), e("chest_supported_row", 3),
                e("overhead_press", 3, (6, 10)), e("reverse_pec_deck", 3, (12, 20), 1), e("lateral_raise", 3, (12, 20), 1)],
            4: [e("leg_press", 3), e("hip_thrust", 3), e("seated_leg_curl", 3, (10, 15), 1), e("walking_lunge", 3, (10, 12)),
                e("seated_calf_raise", 4, (10, 15), 1)],
            5: [e("overhead_triceps_ext", 3, (10, 15), 1), e("incline_curl", 3, (10, 15), 1), e("biceps_curl", 3, (10, 15), 1)]}
def prog_C():  # excessive: 6-day PPL x2, ~30 sets/session, many sets at 0-1 RIR
    push = [e("bench_press", 5, (6, 10), 1), e("incline_db_press", 4, (8, 12), 1), e("overhead_press", 4, (6, 10), 1),
            e("cable_fly", 4, (10, 15), 0), e("lateral_raise", 6, (12, 20), 0), e("triceps_pushdown", 5, (10, 15), 0),
            e("overhead_triceps_ext", 4, (10, 15), 0)]
    pull = [e("pull_up", 5, (6, 10), 1), e("barbell_row", 5, (6, 10), 1), e("seated_row", 4, (8, 12), 1), e("lat_pulldown", 4, (8, 12), 1),
            e("reverse_pec_deck", 5, (12, 20), 0), e("biceps_curl", 5, (10, 15), 0), e("hammer_curl", 4, (10, 15), 0)]
    legs = [e("back_squat", 5, (6, 10), 1), e("rdl", 4, (8, 10), 1), e("leg_press", 4, (10, 15), 1), e("leg_curl", 4, (10, 15), 0),
            e("leg_extension", 4, (10, 15), 0), e("standing_calf_raise", 6, (8, 15), 0)]
    return {0: copy.deepcopy(push), 1: copy.deepcopy(pull), 2: copy.deepcopy(legs), 3: copy.deepcopy(push), 4: copy.deepcopy(pull), 5: copy.deepcopy(legs)}
def prog_D():  # low frequency (each muscle once/wk), reasonable weekly volume, all in one session
    return {0: [e("bench_press", 4, (6, 10)), e("incline_db_press", 3), e("cable_fly", 3, (10, 15), 1), e("machine_chest_press", 3),
                e("triceps_pushdown", 3, (10, 15), 1), e("overhead_triceps_ext", 3, (10, 15), 1)],
            1: [e("lat_pulldown", 4), e("barbell_row", 4, (6, 10)), e("seated_row", 3), e("pull_up", 3, (6, 10))],
            2: [e("back_squat", 4, (6, 10)), e("leg_press", 4), e("leg_extension", 4, (10, 15), 1), e("rdl", 4, (8, 10)),
                e("leg_curl", 3, (10, 15), 1), e("seated_leg_curl", 3, (10, 15), 1), e("standing_calf_raise", 5, (8, 15), 1), e("seated_calf_raise", 4, (10, 15), 1)],
            3: [e("overhead_press", 3, (6, 10)), e("lateral_raise", 8, (12, 20), 1), e("reverse_pec_deck", 3, (12, 20), 1)],
            4: [e("biceps_curl", 4, (10, 15), 1), e("incline_curl", 3, (10, 15), 1), e("hammer_curl", 3, (10, 15), 1), e("hip_thrust", 3)]}
def prog_E():  # high frequency (5 exposures/wk) with controlled weekly volume (~10 per muscle)
    A = [e("bench_press", 2, (6, 10)), e("seated_row", 2), e("back_squat", 2, (6, 10)), e("lateral_raise", 2, (12, 20), 1),
         e("biceps_curl", 2, (10, 15), 1), e("triceps_pushdown", 2, (10, 15), 1), e("leg_curl", 2, (10, 15), 1),
         e("standing_calf_raise", 2, (8, 15), 1), e("face_pull", 2, (12, 20), 1)]
    B = [e("overhead_press", 2, (6, 10)), e("lat_pulldown", 2), e("leg_press", 2), e("rdl", 2, (8, 10)), e("cable_fly", 2, (10, 15), 1),
         e("reverse_pec_deck", 2, (12, 20), 1), e("overhead_triceps_ext", 2, (10, 15), 1), e("incline_curl", 2, (10, 15), 1),
         e("lateral_raise", 2, (12, 20), 1), e("seated_calf_raise", 2, (10, 15), 1), e("hip_thrust", 2)]
    return {0: copy.deepcopy(A), 1: copy.deepcopy(B), 2: copy.deepcopy(A), 3: copy.deepcopy(B), 4: copy.deepcopy(A)}
def prog_F1():  # pure redundancy: 4 near-identical horizontal presses, 3 rows, 3 curls in one session
    upper = [e("bench_press", 2, (6, 10)), e("incline_db_press", 2), e("machine_chest_press", 2), e("push_up", 2, (10, 20)),
             e("seated_row", 2), e("chest_supported_row", 2), e("barbell_row", 2, (6, 10)),
             e("lateral_raise", 3, (12, 20), 1), e("triceps_pushdown", 3, (10, 15), 1),
             e("biceps_curl", 2, (10, 15), 1), e("hammer_curl", 2, (10, 15), 1), e("preacher_curl", 2, (10, 15), 1), e("reverse_pec_deck", 3, (12, 20), 1)]
    lower = [e("back_squat", 4, (6, 10)), e("rdl", 3, (8, 10)), e("leg_extension", 3, (10, 15), 1), e("leg_curl", 3, (10, 15), 1),
             e("standing_calf_raise", 4, (8, 15), 1), e("seated_calf_raise", 3, (10, 15), 1)]
    return {0: copy.deepcopy(upper), 1: copy.deepcopy(lower), 3: copy.deepcopy(upper), 4: copy.deepcopy(lower)}
def prog_F2():  # redundancy + coverage gap: upper-body only, no lower body
    up1 = [e("bench_press", 3, (6, 10)), e("incline_db_press", 3), e("machine_chest_press", 3), e("cable_fly", 3, (10, 15), 1),
           e("biceps_curl", 3, (10, 15), 1), e("hammer_curl", 3, (10, 15), 1), e("preacher_curl", 3, (10, 15), 1), e("triceps_pushdown", 3, (10, 15), 1)]
    up2 = [e("lat_pulldown", 3), e("seated_row", 3), e("lateral_raise", 3, (12, 20), 1), e("reverse_pec_deck", 3, (12, 20), 1)]
    return {0: copy.deepcopy(up1), 1: copy.deepcopy(up2), 3: copy.deepcopy(up1), 4: copy.deepcopy(up2)}
def prog_G():  # poor progression: same volume as B, no overload mechanism
    p = prog_B()
    for d, exs in p.items():
        for i, x in enumerate(exs):
            x["mech"] = None
            x["reps"] = (10, 10)
            x["rir"] = None if (i % 2 == 0) else 2
    p[0][0]["inc"] = 10
    return p
def prog_H():  # strong progression: B + defined mechanisms, RIR 1-3 everywhere, sane increments
    p = prog_B()
    for d, exs in p.items():
        for x in exs:
            x["mech"] = "double_progression"
            x["inc"] = 2.5
    return p
def prog_J():  # consecutive-day, failure-heavy full body
    day = [e("bench_press", 3, (6, 10), 0), e("seated_row", 3, (8, 12), 0), e("back_squat", 3, (6, 10), 0), e("rdl", 3, (8, 10), 0),
           e("lateral_raise", 3, (12, 20), 0), e("biceps_curl", 3, (10, 15), 0), e("triceps_pushdown", 3, (10, 15), 0),
           e("leg_curl", 3, (10, 15), 0), e("standing_calf_raise", 3, (8, 15), 0), e("face_pull", 3, (12, 20), 0)]
    return {0: copy.deepcopy(day), 1: copy.deepcopy(day), 2: copy.deepcopy(day), 3: copy.deepcopy(day)}

PROGRAMS = [("A", "Clearly under-dosed", prog_A), ("B", "Balanced hypertrophy", prog_B), ("C", "Excessive volume", prog_C),
            ("D", "Low frequency, reasonable volume", prog_D), ("E", "High frequency, controlled volume", prog_E),
            ("F1", "Redundant selection (coverage intact)", prog_F1), ("F2", "Redundant selection + coverage gap", prog_F2),
            ("G", "Poor progression structure", prog_G), ("H", "Strong progression structure", prog_H),
            ("J", "EXTRA: consecutive-day failure-heavy", prog_J)]