import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault, ApolloServerPluginLandingPageProductionDefault } from '@apollo/server/plugin/landingPage/default';
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
// const getUserFromToken = (req, res) => { 
//   console.log(authHeader) 
//   try { 
//     if (!authHeader) return null; 
//     const token = authHeader.split(' ')[1]; 
//     const decoded = jwt.verify(token, process.env.JWT_TOKEN); 
//     return decoded.userId 
//   } catch { 
//     return null; 
//   } 
// }; 
async function startServer() {
  await connectDB();
  const { makeExecutableSchema } = await import('@graphql-tools/schema');
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
  const serverCleanup = useServer({
    schema,
    context: async (ctx) => {
      const token = ctx.connectionParams?.Authorization?.split(' ')[1];
      let user = null;
      if (token) {
        try {
          user = jwt.verify(token, process.env.JWT_TOKEN);
        } catch {
          console.error("Invalid token in subscription");
        }
      }
      return { pubsub, user };
    },
  }, wsServer);
  const apolloServer = new ApolloServer({
    schema,
    introspection: true,
    formatError: (formattedError) => {
      return {
        message: formattedError.message,
      };
    },
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      process.env.NODE_ENV === 'production'
        ? ApolloServerPluginLandingPageProductionDefault({ embed: true })
        : ApolloServerPluginLandingPageLocalDefault({ embed: true }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            }
          };
        },
      },
    ],
  });
  await apolloServer.start();

  app.use(cors({
    origin: '*',
    credentials: true
  }));

  // app.use(bodyParser.json()); 
  app.use(express.json())
  app.use(graphqlUploadExpress());
  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        try {
          const authHeader = req.headers?.authorization;
          if (!authHeader) return null;
          const token = authHeader.split(' ')[1];
          if (!token) return null;
          const decodedUser = jwt.verify(token, process.env.JWT_TOKEN);
          return decodedUser.userId;
        } catch (error) {
          console.log("Error in context", JSON.stringify(error, null, 2))
          return null;
        }
      },
    })
  );
  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`Server ready at http://localhost:${PORT}/graphql`);
    console.log(`Subscriptions ready at ws://localhost:${PORT}/graphql`);
  });
}

startServer().catch((err) => {
  console.error('Error starting server:', err);
});