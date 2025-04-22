import { z } from "zod";

const emailSchema = z.string().email("Invalid email format");

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().refine((val) => dateRegex.test(val), {
  message: "Date must be in YYYY-MM-DD format",
});

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)");

const appointmentSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters long"),
  description: z.string().optional(),
  date: dateSchema,
  time: timeSchema,
  participants: z.array(emailSchema).min(1, "At least one participant required"),
  file: z.string().optional(),
});

const updateAppointmentSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters long").optional(),
  description: z.string().optional(),
  date: dateSchema.optional(),
  time: timeSchema.optional(),
  participants: z.array(emailSchema).min(1, "At least one participant required").optional(),
  status: z.enum(['Scheduled', 'Rescheduled', 'Canceled']).optional(),
  attachment: z.any().optional(),
});

const rescheduleSchema = z.object({
  date: dateSchema,
  time: timeSchema
});

const isValidTimezone = (tz) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const userSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  email: emailSchema,
  timezone: z.string().refine(isValidTimezone, {
    message: "Invalid timezone format"
  }),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export {
  emailSchema,
  dateSchema,
  timeSchema,
  appointmentSchema,
  updateAppointmentSchema,
  rescheduleSchema,
  userSchema,
  isValidTimezone
};
