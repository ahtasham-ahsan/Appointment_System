import { Query } from './resolvers/queries.mjs';
import { Mutation } from './resolvers/mutations.mjs';
import { Subscription } from './resolvers/subscriptions.mjs';
import { pubsub } from './resolvers/helpers.mjs';

export { pubsub };

const resolvers = {
  Query,
  Mutation,
  Subscription,
};

export default resolvers;
