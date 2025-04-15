// server.mjs
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
import jwt from 'jsonwebtoken';

import connectDB from './config/db.mjs';
import typeDefs from './graphql/typeDefs.mjs';
import resolvers, { pubsub } from './graphql/resolvers.mjs';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const getUserFromToken = (authHeader) => {
  try {
    if (!authHeader) return null;
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_TOKEN);
    return decoded.userId
  } catch {
    return null;
  }
};

async function startServer() {
  await connectDB();
  const { makeExecutableSchema } = await import('@graphql-tools/schema');
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
  const serverCleanup = useServer({
    schema,
    context: async (ctx) => {
      console.log("ctx", ctx.connectionParams.Authorization)
      const token = ctx.connectionParams?.Authorization?.split(' ')[1];
      let user = null;
      console.log(token)
      if (token) {
        try {
          user = jwt.verify(token, process.env.JWT_TOKEN);
        } catch {
          console.error("Invalid token in subscription");
        }
      }
      console.log("user", user)
      return { pubsub, user };
    },
  }, wsServer);

  const apolloServer = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return { async drainServer() { await serverCleanup.dispose(); } };
        },
      },
    ],
  });

  await apolloServer.start();
  app.use(cors());
  //app.use(bodyParser.json());
  app.use(express.json())
  app.use(graphqlUploadExpress());

  app.use('/graphql', expressMiddleware(apolloServer, {
    context: async ({ req }) => {
      const authHeader = req.headers.authorization || '';
      const user = getUserFromToken(authHeader);
      return { pubsub, user };
    },
  }));

  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`Server ready at http://localhost:${PORT}/graphql`);
    console.log(`Subscriptions ready at ws://localhost:${PORT}/graphql`);
  });
}

startServer().catch((err) => {
  console.error('Error starting server:', err);
});