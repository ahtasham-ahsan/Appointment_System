import moment from 'moment-timezone';
import path from 'path';
import fs from 'fs';
import { createPubSub } from '@graphql-yoga/subscription';
import cloudinary from '../utils/cloudinary.mjs';
import User from '../models/User.js';
import Appointment from '../models/Appointment.js';
import sendEmailNotification from '../utils/emailService.js';
import { fileURLToPath } from 'url';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const emailSchema = z.string().email("Invalid email format");

const dateSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: "Invalid date format",
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

const userSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  email: emailSchema,
  timezone: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});


const SECRET_KEY = process.env.JWT_SECRET_KEY || 'secret_Key';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pubsub = createPubSub();
const APPOINTMENTS_UPDATED = 'APPOINTMENTS_UPDATED';

const convertStringToObjectId = (user) => {
  let userId = "";
  Object.keys(user).forEach(key => {
    if (user[key]) userId += user[key];
  });
  return userId;
}

const ownerEmail = async (ownerID) => {
  let owner = await User.findById(ownerID);
  return owner.email;
}

const getFormattedAppointments = async (userEmail) => {
  const user = await User.findOne({ email: userEmail });
  const timezone = user?.timezone || "UTC";
  const appointments = await Appointment.find({ participants: userEmail });

  return appointments.map((appointment) => {
    const plain = appointment.toObject();
    const dateStr = moment(plain.date).format("YYYY-MM-DD");
    const combined = `${dateStr}T${plain.time}`;
    const momentObj = moment.utc(combined, "YYYY-MM-DDTHH:mm");

    if (!momentObj.isValid()) {
      return { ...plain, id: plain._id.toString(), date: "Invalid", time: "Invalid" };
    }

    return {
      ...plain,
      id: plain._id.toString(),
      date: momentObj.clone().tz(timezone).format("YYYY-MM-DD"),
      time: momentObj.clone().tz(timezone).format("hh:mm A"),
    };
  });
};

const checkAuth = (user) => {
  console.log("ChechAuth ", user)
  if (!user || Object.entries(user).length === 0) throw new Error("Not authenticated");
};

const resolvers = {
  Query: {
    getAppointments: async (_, { userEmail }, user) => {
      checkAuth(user);
      return await getFormattedAppointments(userEmail);
    },
    getAppointment: async (_, { id, userEmail }, user) => {
      checkAuth(user);
      const appointment = await Appointment.findById(id);
      if (!appointment || !appointment.participants.includes(userEmail)) {
        throw new Error("Unauthorized access");
      }
      return (await getFormattedAppointments(userEmail)).find(app => app.id === id);
    },
    getUser: async (_, __, user) => {
      let contextUserId = convertStringToObjectId(user)
      checkAuth(contextUserId);
      return await User.findById(contextUserId);
    }
  },

  Mutation: {
    createAppointment: async (_, { title, description, date, time, participants, file }, user) => {
      let contextUserId = convertStringToObjectId(user)
      console.log("userFromContext", contextUserId);
      checkAuth(contextUserId);
      let args = { title, description, date, time, participants, file }
      const validatedData = appointmentSchema.safeParse(args);
      if (!validatedData.success) {
        throw new Error(validatedData.error.issues.map((e) => e.message).join(", "));
      }
      const user1 = await User.findById(contextUserId);
      console.log("User1 from Create Appointments", user1);
      if (!participants.includes(user1.email)) {
        participants = [...participants, user1.email]
      }
      console.log("Participants from Create Appointments", participants);


      let attachment = null;
      let contentPreview = null;

      if (file) {
        const ext = path.extname(file).toLowerCase();
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];

        if (!allowedExtensions.includes(ext)) {
          throw new Error("Unsupported file type.");
        }

        const tempPath = path.join(__dirname, "../public", file);

        const { secure_url } = await cloudinary.uploader.upload(tempPath, {
          folder: "appointments",
          resource_type: "raw",
          use_filename: true,
          unique_filename: false
        });

        contentPreview = fs.existsSync(tempPath)
          ? fs.readFileSync(tempPath, 'utf8').substring(0, 1024)
          : null;

        attachment = { url: secure_url, filename: file };
      }

      const newAppointment = new Appointment({
        title,
        description,
        date,
        time,
        participants,
        status: 'Scheduled',
        attachment,
        contentPreview,
        owner: contextUserId
      });

      const saved = await newAppointment.save();

      await sendEmailNotification(participants, "New Appointment Created", `Appointment "${title}" on ${date} at ${time}.`);

      for (const email of participants) {
        const updated = await getFormattedAppointments(email);
        pubsub.publish(`${APPOINTMENTS_UPDATED}_${email}`, {
          appointmentsUpdated: updated
        });
      }

      return { ...saved.toObject(), id: saved._id.toString() };
    },

    updateAppointment: async (_, { id, ...updates }, user) => {
      let contextUserId = convertStringToObjectId(user)
      console.log("Update User", contextUserId);
      checkAuth(contextUserId);

      const validation = updateAppointmentSchema.safeParse(updates);
      if (!validation.success) {
        throw new Error(validation.error.issues.map(e => e.message).join(", "));
      }


      const user1 = await User.findById(contextUserId);
      const appointment = await Appointment.findById(id);
      let { participants, ...rest } = updates;
      if (!participants.includes(ownerEmail(appointment.owner))) {
        participants = [...participants, user1.email]
      }
      appointment.participants = participants;
      if (!appointment || !appointment.participants.includes(user1.email)) {
        throw new Error("Unauthorized");
      }

      if (appointment.owner !== contextUserId) {
        throw new Error("You are not authorized to make changes to this appointment");
      }

      Object.assign(appointment, updates);
      await appointment.save();

      await sendEmailNotification(appointment.participants, "Appointment Updated", `Appointment "${appointment.title}" updated.`);

      for (const email of appointment.participants) {
        const updatedList = await getFormattedAppointments(email);
        pubsub.publish(`${APPOINTMENTS_UPDATED}_${email}`, {
          appointmentsUpdated: updatedList
        });
      }

      return appointment;
    },

    rescheduleAppointment: async (_, { id, date, time }, user) => {
      let contextUserId = convertStringToObjectId(user);
      console.log("Reschedule User", contextUserId);
      checkAuth(contextUserId);
      const validated = rescheduleSchema.safeParse({ date, time });
      if (!validated.success) {
        throw new Error(validated.error.issues.map(e => e.message).join(", "));
      }
      const user1 = await User.findById(contextUserId);
      const appointment = await Appointment.findById(id);
      if (!appointment || !appointment.participants.includes(user1.email)) {
        throw new Error("Unauthorized");
      }

      const newDateTime = new Date(`${date}T${time}`);
      if (newDateTime < new Date()) {
        throw new Error("Cannot reschedule to the past");
      }

      appointment.date = date;
      appointment.time = time;
      appointment.status = 'Rescheduled';
      await appointment.save();

      await sendEmailNotification(appointment.participants, "Appointment Rescheduled", `Appointment "${appointment.title}" has been rescheduled.`);

      for (const email of appointment.participants) {
        const updated = await getFormattedAppointments(email);
        pubsub.publish(`${APPOINTMENTS_UPDATED}_${email}`, {
          appointmentsUpdated: updated
        });
      }

      return appointment;
    },

    cancelAppointment: async (_, { id }, user) => {
      let contextUserId = convertStringToObjectId(user);
      console.log("Cancel User", contextUserId);
      checkAuth(contextUserId);
      const user1 = await User.findById(contextUserId);
      const appointment = await Appointment.findById(id);
      if (!appointment || !appointment.participants.includes(user1.email)) {
        throw new Error("Unauthorized");
      }

      appointment.status = 'Canceled';
      await appointment.save();

      await sendEmailNotification(appointment.participants, "Appointment Canceled", `Appointment "${appointment.title}" has been canceled.`);

      for (const email of appointment.participants) {
        const updated = await getFormattedAppointments(email);
        pubsub.publish(`${APPOINTMENTS_UPDATED}_${email}`, {
          appointmentsUpdated: updated
        });
      }

      return appointment;
    },

    deleteAppointment: async (_, { id }, user) => {
      let contextUserId = convertStringToObjectId(user);
      console.log("Delete User", contextUserId);
      checkAuth(contextUserId);
      const user1 = await User.findById(contextUserId);
      const appointment = await Appointment.findById(id);
      if (!appointment || !appointment.participants.includes(user1.email)) {
        throw new Error("Unauthorized");
      }

      await Appointment.findByIdAndDelete(id);
      await sendEmailNotification(appointment.participants, "Appointment Deleted", `Appointment "${appointment.title}" has been deleted.`);

      for (const email of appointment.participants) {
        const updated = await getFormattedAppointments(email);
        pubsub.publish(`${APPOINTMENTS_UPDATED}_${email}`, {
          appointmentsUpdated: updated
        });
      }

      return "Appointment successfully deleted.";
    },

    createUser: async (_, { name, email, timezone, password }) => {
      const validated = userSchema.safeParse({ name, email, timezone, password });
      if (!validated.success) {
        throw new Error(validated.error.issues.map((e) => e.message).join(", "));
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) throw new Error("User already exists.");

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = new User({
        name,
        email,
        timezone,
        password: hashedPassword,
      });

      await newUser.save();

      const token = jwt.sign(
        { userId: newUser.id.toString(), email: newUser.email },
        SECRET_KEY,
        { expiresIn: '7d' }
      );
      return {
        user: newUser,
        token,
      };
    },


    updateUserTimezone: async (_, { id, timezone }, user) => {
      checkAuth(user);
      const updated = await User.findByIdAndUpdate(id, { timezone }, { new: true });
      return updated;
    }
  },

  Subscription: {
    appointmentsUpdated: {
      subscribe: async (_, { userEmail }, context) => {
        console.log("context", context)
        const userEmailFromContext = context.user.email

        if (!context || userEmailFromContext !== userEmail) throw new Error("Unauthorized");
        return pubsub.subscribe(`${APPOINTMENTS_UPDATED}_${userEmail}`);
      },
      resolve: (payload) => payload.appointmentsUpdated
    },
  },
};

export { pubsub };
export default resolvers;
