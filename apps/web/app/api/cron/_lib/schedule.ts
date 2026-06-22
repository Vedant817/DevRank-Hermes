export interface CronScheduleInfo {
  path: string;
  schedule: string;
  timezone: "UTC";
  configuredTimeUtc: string;
  precisePlanTargetIst: string;
  vercelHobbyWindowUtc: string;
  vercelHobbyWindowIst: string;
  precisionNote: string;
}

export const vercelHobbyCronPrecisionNote =
  "Vercel Hobby cron jobs may run at any point within the configured UTC hour. Use a Pro or Enterprise plan when per-minute timing is required.";

export const dailyPlanCronSchedule: CronScheduleInfo = {
  path: "/api/cron/daily-plan",
  schedule: "30 2 * * *",
  timezone: "UTC",
  configuredTimeUtc: "02:30",
  precisePlanTargetIst: "08:00",
  vercelHobbyWindowUtc: "02:00-02:59",
  vercelHobbyWindowIst: "07:30-08:29",
  precisionNote: vercelHobbyCronPrecisionNote,
};

export const weeklyReviewCronSchedule: CronScheduleInfo = {
  path: "/api/cron/weekly-review",
  schedule: "30 3 * * 0",
  timezone: "UTC",
  configuredTimeUtc: "03:30 Sunday",
  precisePlanTargetIst: "09:00 Sunday",
  vercelHobbyWindowUtc: "03:00-03:59 Sunday",
  vercelHobbyWindowIst: "08:30-09:29 Sunday",
  precisionNote: vercelHobbyCronPrecisionNote,
};
