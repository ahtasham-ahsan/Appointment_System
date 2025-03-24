const { gql } = require('apollo-server-express');

const typeDefs = gql`
    type Appointment {
        id: ID!
        title: String!
        description: String
        date: String!
        time: String!
        participants: [String]!
        status: String!
    }

    type Query {
        getAppointments: [Appointment]
        getAppointment(id: ID!): Appointment
    }

    type Mutation {
        createAppointment(title: String!, description: String, date: String!, time: String!, participants: [String]!): Appointment
        updateAppointment(id: ID!, title: String, description: String, date: String, time: String, participants: [String]): Appointment
        rescheduleAppointment(id: ID!, date: String!, time: String!): Appointment
        cancelAppointment(id: ID!): Appointment
        deleteAppointment(id: ID!): String
    }
`;

module.exports = typeDefs;