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

const formatDate = (date) => {
  return new Date(date).toISOString().split('T')[0];
};

const getFormattedAppointments = async (userEmail) => {
  const user = await User.findOne({ email: userEmail });
  const timezone = user?.timezone || "UTC";
  const appointments = await Appointment.find({ participants: userEmail });

  return appointments.map((appointment) => {
    const plain = appointment.toObject();
    // const dateStr = moment(plain.date).format("YYYY-MM-DD");
    // const combined = `${dateStr}T${plain.time}`;
    // const momentObj = moment.utc(combined, "YYYY-MM-DDTHH:mm");
    const momentObj = moment.utc(plain.date);
    // console.log("dateStr", plain.date);
    // console.log("combined", combined);
    // console.log("momentObj", momentObj);

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
  if (!user || Object.entries(user).length === 0) throw new Error("Not authenticated");
};

const resolvers = {
  Query: {
    getAppointments: async (_, { userEmail }, user) => {
      checkAuth(user);
      const formattedAppointments = await getFormattedAppointments(userEmail);
      pubsub.publish(`${APPOINTMENTS_UPDATED}_${userEmail}`, {
        appointmentsUpdated: formattedAppointments
      });
      return formattedAppointments;
    },
    getAppointment: async (_, { id, userEmail }, user) => {
      let contextUserId = convertStringToObjectId(user)
      checkAuth(contextUserId);
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
      checkAuth(contextUserId);
      let args = { title, description, date, time, participants, file }
      const validatedData = appointmentSchema.safeParse(args);
      if (!validatedData.success) {
        throw new Error(validatedData.error.issues.map((e) => e.message).join(", "));
      }
      const user1 = await User.findById(contextUserId);
      if (!participants.includes(user1.email)) {
        participants = [...participants, user1.email]
      }

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
      // const newDateTime = new Date(`${date}T${time}`);
      const newDateTime = moment.tz(`${date}T${time}`, 'YYYY-MM-DDTHH:mm', user1.timezone).utc();
      console.log(newDateTime);
      if (newDateTime < new Date()) {
        throw new Error("Cannot create appointment to the past");
      }
      const newAppointment = new Appointment({
        title,
        description,
        date: newDateTime,
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

      return { ...saved.toObject(), id: saved._id.toString(), date: formatDate(saved.date) };
    },

    updateAppointment: async (_, { id, ...updates }, user) => {
      let contextUserId = convertStringToObjectId(user)
      checkAuth(contextUserId);

      const validation = updateAppointmentSchema.safeParse(updates);
      if (!validation.success) {
        throw new Error(validation.error.issues.map(e => e.message).join(", "));
      }


      const user1 = await User.findById(contextUserId);
      const appointment = await Appointment.findById(id);

      if (!appointment) {
        throw new Error("No Appointment Found");
      }

      if (appointment.owner !== contextUserId) {
        throw new Error("You are not authorized to make changes to this appointment");
      }
      let ownerObj = await User.findById(appointment.owner);
      let ownerEmail = ownerObj.email;
      if (!updates.participants.includes(ownerEmail)) {
        updates.participants = [...updates.participants, ownerEmail];
      }
      const { date, time, ...rest } = updates;
      // const newDateTime = new Date(`${date}T${time}`);
      const newDateTime = moment.tz(`${date}T${time}`, 'YYYY-MM-DDTHH:mm', user1.timezone).utc();

      if (newDateTime < new Date()) {
        throw new Error("Cannot reschedule to the past");
      }
      appointment.date = newDateTime;
      appointment.time = updates.time || appointment.time;
      appointment.status = 'Updated';
      appointment.title = updates.title || appointment.title;
      appointment.description = updates.description || appointment.description;
      appointment.participants = updates.participants || appointment.participants;
      appointment.attachment = updates.attachment || appointment.attachment;

      // updates = {date: newDateTime}
      // Object.assign(appointment, { updates });
      // console.log("Appointments date", appointment.date, appointment.title, appointment.time, appointment.description);
      // appointment.date = newDateTime;
      await appointment.save();

      await sendEmailNotification(appointment.participants, "Appointment Updated", `Appointment "${appointment.title}" updated.`);

      for (const email of appointment.participants) {
        const updatedList = await getFormattedAppointments(email);
        pubsub.publish(`${APPOINTMENTS_UPDATED}_${email}`, {
          appointmentsUpdated: updatedList
        });
      }

      return { ...appointment.toObject(), id: appointment._id.toString(), date: formatDate(appointment.date) };
    },

    rescheduleAppointment: async (_, { id, date, time }, user) => {
      let contextUserId = convertStringToObjectId(user);
      checkAuth(contextUserId);
      const validated = rescheduleSchema.safeParse({ date, time });
      if (!validated.success) {
        throw new Error(validated.error.issues.map(e => e.message).join(", "));
      }
      const user1 = await User.findById(contextUserId);
      const appointment = await Appointment.findById(id);

      if (appointment.owner !== contextUserId) {
        throw new Error("You are not authorized to make changes to this appointment");
      }

      if (!appointment) {
        throw new Error("No Appointment Found");
      }

      // const newDateTime = new Date(`${date}T${time}`);
      const newDateTime = moment.tz(`${date}T${time}`, 'YYYY-MM-DDTHH:mm', user1.timezone).utc();

      if (newDateTime < new Date()) {
        throw new Error("Cannot reschedule to the past");
      }

      appointment.date = newDateTime;
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

      // return appointment;
      return { ...appointment.toObject(), id: appointment._id.toString(), date: formatDate(appointment.date) };
    },

    cancelAppointment: async (_, { id }, user) => {
      let contextUserId = convertStringToObjectId(user);
      checkAuth(contextUserId);
      const user1 = await User.findById(contextUserId);
      const appointment = await Appointment.findById(id);
      // if (!appointment || !appointment.participants.includes(user1.email)) {
      if (!appointment) {
        throw new Error("No Appointment Found");
      }

      if (appointment.owner !== contextUserId) {
        throw new Error("You are not authorized to make changes to this appointment");
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

      // return appointment;
      return { ...appointment.toObject(), id: appointment._id.toString(), date: formatDate(appointment.date) };

    },

    deleteAppointment: async (_, { id }, user) => {
      let contextUserId = convertStringToObjectId(user);
      checkAuth(contextUserId);
      const user1 = await User.findById(contextUserId);
      const appointment = await Appointment.findById(id);
      if (!appointment) {
        throw new Error("No Appointment Found");
      }
      if (appointment.owner !== contextUserId) {
        throw new Error("You are not authorized to make changes to this appointment");
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
    loginUser: async (_, { email, password }) => {
      try {
        const validateEmail = emailSchema.safeParse(email);
        if (!validateEmail.success) {
          throw new Error(validateEmail.error.issues.map((e) => e.message).join(", "));
        }
        const user = await User.findOne({ email }).select('+password');
        if (!user) throw new Error("User not found.");

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) throw new Error("Invalid credentials.");
        const token = jwt.sign(
          { userId: user.id.toString(), email: user.email },
          SECRET_KEY,
          { expiresIn: '7d' }
        );
        return {
          user: {
            id: user.id.toString(),
            name: user.name,
            email: user.email,
            timezone: user.timezone,
          },
          token,
        };
      } catch (error) {
        console.log("Error in loginUser", error);
        throw new Error("Invalid credentials.");
      }
    },

    updateUserTimezone: async (_, { id, timezone }, user) => {
      checkAuth(user);
      const updated = await User.findByIdAndUpdate(id, { timezone }, { new: true });
      return updated;
    },

  },

  Subscription: {
    getAppointments: {
      subscribe: async function* (_, { userEmail }, context) {
        const userEmailFromContext = context.user?.email;
        if (!context || userEmailFromContext !== userEmail) {
          throw new Error("Unauthorized");
        }
        const currentAppointments = await getFormattedAppointments(userEmail);
        yield { appointmentsUpdated: currentAppointments };

        for await (const payload of pubsub.subscribe(`${APPOINTMENTS_UPDATED}_${userEmail}`)) {
          yield payload;
        }
      },
      resolve: (payload) => payload.appointmentsUpdated
    },
  },
};

export { pubsub };
export default resolvers;