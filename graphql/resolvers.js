const Appointment = require('../models/Appointment');

const resolvers = {
    Query: {
        getAppointments: async () => {
            try {
                const appointments = await Appointment.find();
                return appointments;
            } catch (error) {
                console.error("Error fetching appointments:", error);
                throw new Error("Failed to fetch appointments. Please try again later.");
            }
        },
        getAppointment: async (_, { id }) => {
            try {
                if (!id) {
                    throw new Error("Appointment ID is required.");
                }
    
                const appointment = await Appointment.findById(id);
    
                if (!appointment) {
                    throw new Error(`No appointment found with ID: ${id}`);
                }
    
                return appointment;
            } catch (error) {
                console.error(`Error fetching appointment with ID ${id}:`, error);
                throw new Error("Failed to fetch appointment. Please try again later.");
            }
        },
    },

    Mutation: {
        createAppointment: async (_, { title, description, date, time, participants }) => {
            try {
                if (!title || !date || !time || !participants || participants.length === 0) {
                    throw new Error("Title, date, time, and at least one participant are required.");
                }
    
                const appointmentDate = new Date(date);
                const today = new Date();
                if (appointmentDate < today) {
                    throw new Error("Cannot create an appointment in the past.");
                }
    
                const newAppointment = new Appointment({ title, description, date, time, participants });
                const savedAppointment = await newAppointment.save();
    
                return savedAppointment;
            } catch (error) {
                console.error("Error creating appointment:", error);
                throw new Error("Failed to create appointment. Please try again later.");
            }
        },

        updateAppointment: async (_, { id, title, description, date, time, participants }) => {
            try {
                if (!id) {
                    throw new Error("Appointment ID is required.");
                }
                const existingAppointment = await Appointment.findById(id);
                if (!existingAppointment) {
                    throw new Error(`No appointment found with ID: ${id}`);
                }
                if (date) {
                    const newDate = new Date(date);
                    const today = new Date();
                    if (newDate < today) {
                        throw new Error("Cannot update appointment to a past date.");
                    }
                }
                const updatedAppointment = await Appointment.findByIdAndUpdate(
                    id,
                    { title, description, date, time, participants },
                    { new: true }
                );
    
                return updatedAppointment;
            } catch (error) {
                console.error(`Error updating appointment with ID ${id}:`, error);
                throw new Error("Failed to update appointment. Please try again later.");
            }
        },

        rescheduleAppointment: async (_, { id, date, time }) => {
            const appointment = await Appointment.findById(id);
            if (!appointment) throw new Error("Appointment not found");

            const currentDate = new Date();
            const appointmentDate = new Date(appointment.date);

            if (appointmentDate < currentDate) {
                throw new Error("Cannot reschedule past appointments.");
            }
            appointment.date = date;
            appointment.time = time;
            appointment.status = 'Rescheduled';
            await appointment.save();

            appointment.participants.forEach(participant => {
                console.log(`Notification sent to ${participant}: Appointment rescheduled to ${date} at ${time}.`);
            });

            return appointment;
        },


        cancelAppointment: async (_, { id }) => {
            try {
                if (!id) {
                    throw new Error("Appointment ID is required.");
                }
                const appointment = await Appointment.findById(id);
                if (!appointment) {
                    throw new Error(`No appointment found with ID: ${id}`);
                }
                if (appointment.status === "Canceled") {
                    throw new Error("This appointment is already canceled.");
                }
                const canceledAppointment = await Appointment.findByIdAndUpdate(
                    id,
                    { status: "Canceled" },
                    { new: true }
                );
    
                return canceledAppointment;
            } catch (error) {
                console.error(`Error canceling appointment with ID ${id}:`, error);
                throw new Error("Failed to cancel appointment. Please try again later.");
            }
        },

        deleteAppointment: async (_, { id }) => {
            try {
                if (!id) {
                    return "Appointment ID is required."
                }
                const appointment = await Appointment.findById(id);
                if (!appointment) {
                    return `No appointment found with ID: ${id}`;
                }
                await Appointment.findByIdAndDelete(id);
    
                return "Appointment successfully deleted.";
            } catch (error) {
                console.error(`Error deleting appointment with ID ${id}:`, error);
                return "Failed to delete appointment. Please try again later.";
            }
        },
    }
};

module.exports = resolvers;