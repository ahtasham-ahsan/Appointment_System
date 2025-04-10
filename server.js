// server.js
require('dotenv').config();
const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const { graphqlUploadExpress } = require('graphql-upload');
const { makeExecutableSchema } = require('@graphql-tools/schema');

const { useServer } = require('graphql-ws/use/ws');

const { WebSocketServer } = require('ws');
const http = require('http');

const connectDB = require('./config/db');
const typeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');

const app = express();
const httpServer = http.createServer(app);

// Create schema for use in both HTTP and WS
const schema = makeExecutableSchema({ typeDefs, resolvers });

// WebSocket server for subscriptions
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
});
useServer({ schema }, wsServer);

// Apollo server
const server = new ApolloServer({
  schema,
});

async function startServer() {
  await connectDB();
  app.use(graphqlUploadExpress());
  await server.start();
  server.applyMiddleware({ app });

  const PORT = process.env.PORT || 1000;
  httpServer.listen(PORT, () => {
    console.log(`🚀 HTTP ready at http://localhost:${PORT}${server.graphqlPath}`);
    console.log(`📡 WS ready at ws://localhost:${PORT}/graphql`);
  });
}

startServer().catch(console.error);
