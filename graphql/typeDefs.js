const { gql } = require('apollo-server-express');

const typeDefs = gql`
    type User {
        id: ID!
        name: String!
        email: String!
        timezone: String!
    }

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
        getAppointments(userEmail: String!): [Appointment]
        getAppointment(id: ID!, userEmail: String!): Appointment
        getUser(id: ID!): User
    }
    
    type Mutation {
        createAppointment(title: String!, description: String, date: String!, time: String!, participants: [String]!): Appointment
        updateAppointment(id: ID!, title: String, description: String, date: String, time: String, participants: [String]): Appointment
        rescheduleAppointment(id: ID!, date: String!, time: String!): Appointment
        cancelAppointment(id: ID!): Appointment
        deleteAppointment(id: ID!): String
        createUser(name: String!, email: String!, timezone: String!): User
        updateUserTimezone(id: ID!, timezone: String!): User
    }
`;

module.exports = typeDefs;
