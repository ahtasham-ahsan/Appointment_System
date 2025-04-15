import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import cors from 'cors';
import bodyParser from 'body-parser';
import { graphqlUploadExpress } from 'graphql-upload';

import connectDB from './config/db.mjs';
import typeDefs from './graphql/typeDefs.mjs';
import resolvers, { pubsub } from './graphql/resolvers.mjs';

dotenv.config();

const app = express();
const httpServer = createServer(app);

async function startServer() {
  await connectDB();

  const { makeExecutableSchema } = await import('@graphql-tools/schema');
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  const serverCleanup = useServer(
    {
      schema,
      context: async () => ({ pubsub }),
    },
    wsServer
  );

  const apolloServer = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await apolloServer.start();
  app.use(cors());
  //app.use(bodyParser.json());
  app.use(express.json())
  app.use(graphqlUploadExpress());

  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async () => ({ pubsub }),
    })
  );

  app.get('/', (req, res) => {
    res.send('Welcome to the Appointment Management GraphQL API. Visit /graphql to use the API.');
  });

  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`Server ready at http://localhost:${PORT}/graphql`);
    console.log(`Subscriptions ready at ws://localhost:${PORT}/graphql`);
  });
}

startServer().catch((err) => {
  console.error('Error starting server:', err);
});
