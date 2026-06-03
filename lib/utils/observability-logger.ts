export interface AgentLogEvent {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  source: "agent" | "tool" | "subagent" | "model";
  name: string;
  message: string;
  data?: any;
}

export class ObservabilityLogger {
  private static events: AgentLogEvent[] = [];

  static log(
    level: AgentLogEvent["level"],
    source: AgentLogEvent["source"],
    name: string,
    message: string,
    data?: any
  ) {
    const event: AgentLogEvent = {
      timestamp: new Date().toISOString(),
      level,
      source,
      name,
      message,
      data,
    };
    this.events.push(event);
    console.log(`[${event.timestamp}] [${level.toUpperCase()}] [${source.toUpperCase()}] [${name}] ${message}`);
  }

  static info(source: AgentLogEvent["source"], name: string, message: string, data?: any) {
    this.log("info", source, name, message, data);
  }

  static error(source: AgentLogEvent["source"], name: string, message: string, data?: any) {
    this.log("error", source, name, message, data);
  }

  static getLogs(): AgentLogEvent[] {
    return this.events;
  }

  static clearLogs() {
    this.events = [];
  }
}
