import moment from 'moment-timezone';
import path from 'path';
import fs from 'fs';
import { createPubSub } from '@graphql-yoga/subscription';
import cloudinary from '../utils/cloudinary.mjs';
import User from '../models/User.js';
import Appointment from '../models/Appointment.js';
import sendEmailNotification from '../utils/emailService.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const pubsub = createPubSub();
const APPOINTMENTS_UPDATED = 'APPOINTMENTS_UPDATED';

const getFormattedAppointments = async (userEmail) => {
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

const resolvers = {
  Query: {
    getAppointments: async (_, { userEmail }) => {
      return await getFormattedAppointments(userEmail);
    },
    getAppointment: async (_, { id, userEmail }) => {
      const user = await User.findOne({ email: userEmail });
      const timezone = user ? user.timezone : "UTC";
      const appointment = await Appointment.findById(id);
      if (!appointment) throw new Error("Appointment not found");

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
    },
    getUser: async (_, { id }) => {
      const user = await User.findById(id);
      if (!user) throw new Error("User not found");
      return user;
    }
  },

  Mutation: {
    createAppointment: async (_, { title, description, date, time, participants, file }) => {
      const filename = file;
      const ext = path.extname(filename).toLowerCase();
      const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];

      if (!allowedExtensions.includes(ext)) {
        throw new Error("Unsupported file type.");
      }

      const tempFilePath = path.join(__dirname, "../public", filename);
      let contentPreview = null;
      if (fs.existsSync(tempFilePath)) {
        const fileContent = fs.readFileSync(tempFilePath, 'utf8');
        contentPreview = fileContent.substring(0, 1024);
      }

      try {
        const { secure_url } = await cloudinary.uploader.upload(tempFilePath, {
          folder: "appointments",
          resource_type: "raw",
          use_filename: true,
          unique_filename: false
        });
      } catch (err) {
        console.error("Cloudinary upload failed:", err);
        throw new Error("File upload failed: " + (err.message || "Unknown error"));
      }

      const newAppointment = new Appointment({
        title,
        description,
        date: new Date(date),
        time,
        participants,
        attachment: { url: secure_url, filename },
        contentPreview
      });

      const saved = await newAppointment.save();
      await sendEmailNotification(participants, "New Appointment Created", `Your appointment "${title}" is on ${date} at ${time}.`);

      for (const email of participants) {
        const updated = await getFormattedAppointments(email);
        pubsub.publish(`${APPOINTMENTS_UPDATED}_${email}`, {
          appointmentsUpdated: updated
        });
      }

      return {
        ...saved._doc,
        id: saved._id.toString(),
        date,
        time,
      };
    },

    updateAppointment: async (_, { id, title, description, date, time, participants }) => {
      const updated = await Appointment.findByIdAndUpdate(id, { title, description, date, time, participants }, { new: true });
      if (!updated) throw new Error("Appointment not found");

      await sendEmailNotification(participants, "Appointment Updated", `Your appointment "${title}" has been updated.`);

      for (const email of participants) {
        const updatedList = await getFormattedAppointments(email);
        pubsub.publish(`${APPOINTMENTS_UPDATED}_${email}`, {
          appointmentsUpdated: updatedList
        });
      }

      return updated;
    },

    rescheduleAppointment: async (_, { id, date, time }) => {
      const appointment = await Appointment.findById(id);
      if (!appointment) throw new Error("Appointment not found");

      appointment.date = date;
      appointment.time = time;
      appointment.status = 'Rescheduled';
      await appointment.save();

      await sendEmailNotification(appointment.participants, "Appointment Rescheduled", `Your appointment "${appointment.title}" has been rescheduled.`);

      for (const email of appointment.participants) {
        const updated = await getFormattedAppointments(email);
        pubsub.publish(`${APPOINTMENTS_UPDATED}_${email}`, {
          appointmentsUpdated: updated
        });
      }

      return appointment;
    },

    cancelAppointment: async (_, { id }) => {
      const appointment = await Appointment.findById(id);
      if (!appointment) throw new Error("Appointment not found");

      appointment.status = 'Canceled';
      await appointment.save();

      await sendEmailNotification(appointment.participants, "Appointment Canceled", `Your appointment "${appointment.title}" has been canceled.`);

      for (const email of appointment.participants) {
        const updated = await getFormattedAppointments(email);
        pubsub.publish(`${APPOINTMENTS_UPDATED}_${email}`, {
          appointmentsUpdated: updated
        });
      }

      return appointment;
    },

    deleteAppointment: async (_, { id }) => {
      const appointment = await Appointment.findById(id);
      if (!appointment) throw new Error("Appointment not found");

      await Appointment.findByIdAndDelete(id);

      await sendEmailNotification(appointment.participants, "Appointment Deleted", `Your appointment "${appointment.title}" has been deleted.`);

      for (const email of appointment.participants) {
        const updated = await getFormattedAppointments(email);
        pubsub.publish(`${APPOINTMENTS_UPDATED}_${email}`, {
          appointmentsUpdated: updated
        });
      }

      return "Appointment successfully deleted.";
    },

    createUser: async (_, { name, email, timezone }) => {
      const existing = await User.findOne({ email });
      if (existing) throw new Error("User already exists.");
      const newUser = new User({ name, email, timezone });
      await newUser.save();
      return newUser;
    },

    updateUserTimezone: async (_, { id, timezone }) => {
      const user = await User.findByIdAndUpdate(id, { timezone }, { new: true });
      if (!user) throw new Error("User not found");
      return user;
    }
  },

  Subscription: {
    appointmentsUpdated: {
      subscribe: (_, { userEmail }) => {
        console.log("Subscription requested for:", userEmail);
        return pubsub.subscribe(`${APPOINTMENTS_UPDATED}_${userEmail}`);
      },
      resolve: (payload) => {
        return payload.appointmentsUpdated;
      }
    },
  },
};

export { pubsub };
export default resolvers;