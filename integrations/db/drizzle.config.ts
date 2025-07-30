// This is a javascript file because it needs to be copied to the docker image and able to run without typescript.
// Thus, don't import anything from the source code, this needs to be a complete standalone file.

export default {
  schema: "./src/schema.ts", // Requires the server to have been built first
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.MP_GAME_SERVICE_DATABASE_CONNECTION_STRING,
  },
};
