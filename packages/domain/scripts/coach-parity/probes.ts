import { run, REF, type Day } from "./lib";
REF.muscleGroups.sort((a, b) => a.name.localeCompare(b.name));
const D = (name: string, rows: Day["rows"]): Day => ({ name, rows });
const push = D("Push", [["Barbell Bench Press", 4, 6, 8], ["Overhead Press", 3, 8, 10], ["Incline Dumbbell Press", 3, 8, 12], ["Lateral Raise", 4, 12, 15], ["Tricep Pushdown", 3, 10, 12]]);
const pull = D("Pull", [["Pull-Up", 4, 6, 10], ["Barbell Row", 3, 6, 8], ["Face Pull", 3, 15, 20], ["Barbell Curl", 3, 8, 12], ["Hammer Curl", 2, 10, 12]]);
const legs = D("Legs", [["Back Squat", 4, 6, 8], ["Romanian Deadlift", 3, 8, 10], ["Leg Press", 3, 10, 12], ["Leg Curl", 3, 10, 12], ["Standing Calf Raise", 4, 10, 15]]);
run({ id: "PPLx3", title: "PPL pasted as 3 days (user runs it twice a week)", days: [push, pull, legs] });
run({ id: "PPLx6", title: "Same PPL entered as 6 days", days: [push, pull, legs, push, pull, legs] });
