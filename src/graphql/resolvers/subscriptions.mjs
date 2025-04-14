import { pubsub, APPOINTMENTS_UPDATED } from './helpers.mjs';

export const Subscription = {
  appointmentsUpdated: {
    subscribe: (_, { userEmail }) => {
      console.log("Subscription requested for:", userEmail);
      return pubsub.subscribe(`${APPOINTMENTS_UPDATED}_${userEmail}`);
    },
    resolve: (payload) => {
      return payload.appointmentsUpdated;
    }
  },
};
