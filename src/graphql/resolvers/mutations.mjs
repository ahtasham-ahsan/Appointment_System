import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import Appointment from '../../models/Appointment.js';
import User from '../../models/User.js';
import cloudinary from '../../utils/cloudinary.mjs';
import sendEmailNotification from '../../utils/emailService.js';
import { pubsub, APPOINTMENTS_UPDATED, getFormattedAppointments } from './helpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const Mutation = {
  createAppointment: async (_, { title, description, date, time, participants, file }) => {
    const filename = file;
    const ext = path.extname(filename).toLowerCase();
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];

    if (!allowedExtensions.includes(ext)) {
      throw new Error("Unsupported file type.");
    }

    const tempFilePath = path.join(__dirname, "../../public", filename);
    let contentPreview = null;
    if (fs.existsSync(tempFilePath)) {
      const fileContent = fs.readFileSync(tempFilePath, 'utf8');
      contentPreview = fileContent.substring(0, 1024);
    }

    const { secure_url } = await cloudinary.uploader.upload(tempFilePath, {
      folder: "appointments",
      resource_type: "raw",
      use_filename: true,
      unique_filename: false
    });

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
  },
};
