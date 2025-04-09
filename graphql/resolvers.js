const User = require('../models/User');
const Appointment = require('../models/Appointment');
const sendEmailNotification = require("../utils/emailService");
const moment = require('moment-timezone');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../utils/cloudinary');

const resolvers = {
  Query: {
    getAppointments: async (_, { userEmail }) => {
      try {
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
            console.error("Invalid datetime combination:", combined);
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
      } catch (error) {
        console.error("Error fetching appointments:", error);
        throw new Error("Failed to fetch appointments.");
      }
    },

    getAppointment: async (_, { id, userEmail }) => {
      try {
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
          console.error("Invalid datetime combination:", combined);
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
      } catch (error) {
        console.error("Error fetching appointment:", error);
        throw new Error("Failed to fetch appointment.");
      }
    },

    getUser: async (_, { id }) => {
      try {
        const user = await User.findById(id);
        if (!user) throw new Error("User not found");
        return user;
      } catch (error) {
        console.error("Error fetching user:", error);
        throw new Error("Failed to fetch user.");
      }
    }
  },

  Mutation: {
    createAppointment: async (_, { title, description, date, time, participants, file }) => {
      console.log("createAppointment");
      try {
        if (!title || !date || !time || !participants.length) {
          throw new Error("Missing required fields.");
        }

        const appointmentDate = new Date(date);
        if (appointmentDate < new Date()) {
          throw new Error("Cannot create an appointment in the past.");
        }

        let attachment = null;
        let contentPreview = null;

        const filename = file;
        
        const tempFilePath = path.join(__dirname, "../public", filename);
        console.log("tempFilePath", tempFilePath);

        if (fs.existsSync(tempFilePath)) {
          const fileContent = fs.readFileSync(tempFilePath, 'utf8');
          contentPreview = fileContent.substring(0, 1024);
        } else {
          console.warn("File not found at temp path:", tempFilePath);
        }

        const { secure_url } = await cloudinary.uploader.upload(tempFilePath, {
          folder: "appointments",
          resource_type: "raw",
          use_filename: true,
          unique_filename: false
        });

        console.log("secure_url", secure_url);
        attachment = {
          url: secure_url,
          filename,
          // mimetype: "mimetype"
        };

        const newAppointment = new Appointment({
          title,
          description,
          date: new Date(date),
          time,
          participants,
          attachment,
          contentPreview
        });

        const savedAppointment = await newAppointment.save();
        const formattedDate = new Date(savedAppointment.date).toISOString().split("T")[0];
        const formattedTime = time;

        await sendEmailNotification(
          participants,
          "New Appointment Created",
          `Your appointment "${title}" is scheduled on ${formattedDate} at ${formattedTime}.`
        );

        return {
          ...savedAppointment._doc,
          id: savedAppointment._id.toString(),
          date: formattedDate,
          time: formattedTime,
        };

      } catch (error) {
        console.error("Error creating appointment:", error);
        throw new Error("Failed to create appointment.");
      }
    },

    createUser: async (_, { name, email, timezone }) => {
      try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          throw new Error("User with this email already exists.");
        }

        const newUser = new User({ name, email, timezone });
        await newUser.save();
        return newUser;
      } catch (error) {
        console.error("Error creating user:", error);
        throw new Error("Failed to create user.");
      }
    },

    updateUserTimezone: async (_, { id, timezone }) => {
      try {
        const updatedUser = await User.findByIdAndUpdate(id, { timezone }, { new: true });
        if (!updatedUser) throw new Error("User not found");
        return updatedUser;
      } catch (error) {
        console.error("Error updating timezone:", error);
        throw new Error("Failed to update timezone.");
      }
    },

    updateAppointment: async (_, { id, title, description, date, time, participants }) => {
      try {
        if (!id) throw new Error("Appointment ID is required.");

        const existingAppointment = await Appointment.findById(id);
        if (!existingAppointment) throw new Error(`No appointment found with ID: ${id}`);

        if (date && new Date(date) < new Date()) {
          throw new Error("Cannot update appointment to a past date.");
        }

        const updatedAppointment = await Appointment.findByIdAndUpdate(
          id, { title, description, date, time, participants }, { new: true }
        );
        await sendEmailNotification(
          participants,
          "Appointment Updated",
          `Your appointment "${title}" has been updated. New Date: ${date} Time: ${time}.`
        );

        return updatedAppointment;
      } catch (error) {
        console.error(`Error updating appointment:`, error);
        throw new Error("Failed to update appointment.");
      }
    },

    rescheduleAppointment: async (_, { id, date, time }) => {
      try {
        const appointment = await Appointment.findById(id);
        if (!appointment) throw new Error("Appointment not found");

        if (new Date(appointment.date) < new Date()) {
          throw new Error("Cannot reschedule past appointments.");
        }

        appointment.date = date;
        appointment.time = time;
        appointment.status = 'Rescheduled';
        await appointment.save();

        await sendEmailNotification(
          appointment.participants,
          "Appointment Rescheduled",
          `Your appointment "${appointment.title}" has been rescheduled to ${date} at ${time}.`
        );

        return appointment;
      } catch (error) {
        console.error(`Error rescheduling appointment:`, error);
        throw new Error("Failed to reschedule appointment.");
      }
    },

    cancelAppointment: async (_, { id }) => {
      try {
        const appointment = await Appointment.findById(id);
        if (!appointment) throw new Error(`No appointment found with ID: ${id}`);
        if (appointment.status === "Canceled") throw new Error("Appointment already canceled.");

        const canceledAppointment = await Appointment.findByIdAndUpdate(
          id, { status: "Canceled" }, { new: true }
        );

        await sendEmailNotification(
          appointment.participants,
          "Appointment Canceled",
          `Your appointment "${appointment.title}" has been canceled.`
        );

        return canceledAppointment;
      } catch (error) {
        console.error(`Error canceling appointment:`, error);
        throw new Error("Failed to cancel appointment.");
      }
    },

    deleteAppointment: async (_, { id }) => {
      try {
        const appointment = await Appointment.findById(id);
        if (!appointment) throw new Error(`No appointment found with ID: ${id}`);

        await Appointment.findByIdAndDelete(id);
        await sendEmailNotification(
          appointment.participants,
          "Appointment Deleted",
          `Your appointment "${appointment.title}" has been deleted.`
        );

        return "Appointment successfully deleted.";
      } catch (error) {
        console.error(`Error deleting appointment:`, error);
        throw new Error("Failed to delete appointment.");
      }
    }
  }
};

module.exports = resolvers;
