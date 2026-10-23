import { Client } from "appwrite";

const client = new Client()
  .setEndpoint("https://nyc.cloud.appwrite.io/v1")
  .setProject("6adaf4be003ae5c9e622");

export { client };

// Confirm the Appwrite setup once when the app starts.
// Guarded to the client so it does not run during server-side rendering/builds.
if (typeof window !== "undefined") {
  client
    .ping()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log("[Appwrite] Connected to Appwrite");
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("[Appwrite] Ping failed:", error);
    });
}
