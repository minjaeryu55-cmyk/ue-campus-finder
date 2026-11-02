// Scheduled function: once a day, remind owners whose matched item is about to leave storage.
import { runReminders } from "./api.mjs";

export default async () => {
  const sent = await runReminders();
  console.log(`reminders sent: ${sent}`);
  return new Response("ok");
};

export const config = { schedule: "@daily" };
