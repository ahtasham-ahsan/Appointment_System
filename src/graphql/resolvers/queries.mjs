import { getFormattedAppointments, APPOINTMENTS_UPDATED } from './helpers.mjs';
import User from '../../models/User.js';
import Appointment from '../../models/Appointment.js';

export const Query = {
  getAppointments: async (_, { userEmail }) => {
    return await getFormattedAppointments(userEmail);
  },
  getAppointment: async (_, { id, userEmail }) => {
    const user = await User.findOne({ email: userEmail });
    const timezone = user ? user.timezone : "UTC";
    const appointment = await Appointment.findById(id);
    if (!appointment) throw new Error("Appointment not found");

    const plain = appointment.toObject();
    const dateStr = appointment.date instanceof Date ? appointment.date.toISOString().split('T')[0] : String(appointment.date);
    const timeStr = typeof appointment.time === "string" ? appointment.time : String(appointment.time);
    const combined = `${dateStr}T${timeStr}`;
    const moment = (await import('moment-timezone')).default;
    const momentObj = moment.utc(combined, "YYYY-MM-DDTHH:mm");

    if (!momentObj.isValid()) {
      return {
        ...plain,
        id: appointment._id.toString(),
        date: "Invalid date",
        time: "Invalid time"
      };
    }

    return {
      ...plain,
      id: appointment._id.toString(),
      date: momentObj.clone().tz(timezone).format("YYYY-MM-DD"),
      time: momentObj.clone().tz(timezone).format("hh:mm A")
    };
  },
  getUser: async (_, { id }) => {
    const user = await User.findById(id);
    if (!user) throw new Error("User not found");
    return user;
  },
};
