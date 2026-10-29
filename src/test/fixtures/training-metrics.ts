const empty = { weightKg: null, reps: null, durationSeconds: null, distanceMeters: null };
export const trainingMetricCases = [
  { recordType: null, ...empty, weightKg: 30, reps: 8 },
  { recordType: "weight_reps", ...empty, weightKg: 30, reps: 8 },
  { recordType: "bodyweight_reps", ...empty, reps: 8 },
  { recordType: "weighted_bodyweight", ...empty, weightKg: 10, reps: 8 },
  { recordType: "assisted_bodyweight", ...empty, weightKg: 20, reps: 8 },
  { recordType: "duration", ...empty, durationSeconds: 60 },
  { recordType: "weight_duration", ...empty, weightKg: 20, durationSeconds: 60 },
  { recordType: "distance_duration", ...empty, distanceMeters: 1000, durationSeconds: 300 },
  { recordType: "weight_distance", ...empty, weightKg: 20, distanceMeters: 30.5 },
] as const;
