import express from "express";
import { resolve } from "node:path";
import { z } from "zod";
import { env, root } from "./config/config.js";
import { apiRouter } from "./routes/api.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", (req, res, next) => {
    const origin = req.get("origin");

    if (
      origin &&
      !["localhost", "127.0.0.1"].some((host) =>
        [env.port, 5173].some((port) => origin === `http://${host}:${port}`),
      )
    ) {
      res.status(403).json({ error: "Origin not allowed." });

      return;
    }

    next();
  });

  app.use("/api", apiRouter());
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Route not found." }),
  );

  app.use(express.static(resolve(root, "frontend/dist")));
  app.get("/", (_req, res) =>
    res.sendFile(resolve(root, "frontend/dist/index.html")),
  );

  app.use(((error, _req, res, _next) => {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((i) => i.message).join(" ")
        : error instanceof Error
          ? error.message
          : "Unexpected error.";

    res
      .status(error instanceof z.ZodError ? 400 : 422)
      .json({ error: message });
  }) as express.ErrorRequestHandler);

  return app;
}
