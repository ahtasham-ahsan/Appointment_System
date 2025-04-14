import gql from 'graphql-tag';

const typeDefs = gql`
  scalar Upload

  type User {
    id: ID!
    name: String!
    email: String!
    timezone: String
  }

  type Attachment {
    url: String!
    filename: String!
  }

  type Appointment {
    id: ID!
    title: String!
    description: String
    date: String!
    time: String!
    participants: [String!]!
    status: String!
    attachment: Attachment
    contentPreview: String
  }

  type Query {
    getAppointments: [Appointment!]!
    getAppointment(id: ID!): Appointment
    getUser: User!
  }

  type Mutation {
    createUser(name: String!, email: String!, timezone: String): User!
    updateUserTimezone(id: ID!, timezone: String!): User!

    createAppointment(
      title: String!
      description: String
      date: String!
      time: String!
      participants: [String!]!
      file: Upload
    ): Appointment!

    updateAppointment(
      id: ID!
      title: String
      description: String
      date: String
      time: String
      participants: [String!]
      status: String
    ): Appointment!

    rescheduleAppointment(id: ID!, date: String!, time: String!): Appointment!
    cancelAppointment(id: ID!): Appointment!
    deleteAppointment(id: ID!): String!
  }

  type Subscription {
    appointmentsUpdated(userEmail: String!): [Appointment!]!
  }
`;

export default typeDefs;
