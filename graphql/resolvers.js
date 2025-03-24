const Appointment = require('../models/Appointment');

const resolvers = {
    Query: {
        getAppointments: async () => await Appointment.find(),
        getAppointment: async (_, { id }) => await Appointment.findById(id),
    },

    Mutation: {
        createAppointment: async (_, { title, description, date, time, participants }) => {
            const newAppointment = new Appointment({ title, description, date, time, participants });
            return await newAppointment.save();
        },

        updateAppointment: async (_, { id, title, description, date, time, participants }) => {
            return await Appointment.findByIdAndUpdate(id, { title, description, date, time, participants }, { new: true });
        },

        rescheduleAppointment: async (_, { id, date, time }) => {
            return await Appointment.findByIdAndUpdate(id, { date, time, status: 'Rescheduled' }, { new: true });
        },

        cancelAppointment: async (_, { id }) => {
            return await Appointment.findByIdAndUpdate(id, { status: 'Canceled' }, { new: true });
        },

        deleteAppointment: async (_, { id }) => {
            await Appointment.findByIdAndDelete(id);
            return 'Appointment deleted';
        }
    }
};

module.exports = resolvers;