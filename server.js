require("dotenv").config();

const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const connectDB = require("./config/db");
const typeDefs = require("./graphql/typeDefs");
const resolvers = require("./graphql/resolvers");

const app = express();
const server = new ApolloServer({ typeDefs, resolvers });

async function startServer() {
  await connectDB();
  await server.start();

  server.applyMiddleware({ app });

  const PORT = process.env.PORT || 1000;
  app.listen(PORT, () => {
    console.log(
      `\nServer running at http://localhost:${PORT}${server.graphqlPath}`
    );
  });
}

startServer()
  .then(() => console.log(`\nServer started`))
  .catch((error) => console.error(`\n Error starting server:`, error));
