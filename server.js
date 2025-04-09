require('dotenv').config();
const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const { graphqlUploadExpress } = require('graphql-upload');
const connectDB = require('./config/db');
const typeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');

const app = express();
const server = new ApolloServer({ typeDefs, resolvers });

async function startServer() {
  await connectDB();

  app.use(graphqlUploadExpress());

  await server.start();

  server.applyMiddleware({ app });

  const PORT = process.env.PORT || 1000;
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}${server.graphqlPath}`);
  });
}

startServer()
  .then(() => console.log(`Server started`))
  .catch((error) => console.error(`Error starting server:`, error));
