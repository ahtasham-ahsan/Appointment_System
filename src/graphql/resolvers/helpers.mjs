import moment from 'moment-timezone';
import { createPubSub } from '@graphql-yoga/subscription';
import Appointment from '../../models/Appointment.js';
import User from '../../models/User.js';

export const pubsub = createPubSub();
export const APPOINTMENTS_UPDATED = 'APPOINTMENTS_UPDATED';

export const getFormattedAppointments = async (userEmail) => {
    const user = await User.findOne({ email: userEmail });
    const timezone = user ? user.timezone : "UTC";
    const appointments = await Appointment.find({ participants: userEmail });

    return appointments.map(appointment => {
        const plain = appointment.toObject();
        const { _id, date, time } = plain;
        const dateStr = date instanceof Date ? moment(date).format("YYYY-MM-DD") : String(date);
        const timeStr = typeof time === "string" ? time : String(time);
        const combined = `${dateStr}T${timeStr}`;
        const momentObj = moment.utc(combined, "YYYY-MM-DDTHH:mm");

        if (!momentObj.isValid()) {
            return {
                ...plain,
                id: _id.toString(),
                date: "Invalid date",
                time: "Invalid time"
            };
        }

        return {
            ...plain,
            id: _id.toString(),
            date: momentObj.clone().tz(timezone).format("YYYY-MM-DD"),
            time: momentObj.clone().tz(timezone).format("hh:mm A")
        };
    });
};
