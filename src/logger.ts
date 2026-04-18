import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

/** Root logger. Use `logger.child({ ... })` for request/session context. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
          },
        },
      }),
});
