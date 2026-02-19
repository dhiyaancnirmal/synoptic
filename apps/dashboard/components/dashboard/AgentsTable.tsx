import type { AgentRecord } from "@synoptic/types/agent";
import type { FailureBucketModel, UnifiedFeedItem } from "./types";

interface AgentsTableProps {
  agents: AgentRecord[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  events: UnifiedFeedItem[];
  failures: FailureBucketModel[];
}

export function AgentsTable({ agents, selectedAgentId, onSelectAgent, events, failures }: AgentsTableProps) {
  const selectedEvents = selectedAgentId ? events.filter((event) => event.agentId === selectedAgentId).slice(0, 8) : [];
  const selectedFailures = selectedAgentId ? failures.filter((f) => f.affectedAgent === selectedAgentId) : [];

  return (
    <article className="dash-panel">
      <header className="dash-panel-head">
        <h3>Agents</h3>
        <p className="pixel-text">identity and status</p>
      </header>
      <div className="dash-agent-table">
        {agents.map((agent) => (
          <button
            key={agent.agentId}
            type="button"
            className={`dash-agent-row ${selectedAgentId === agent.agentId ? "active" : ""}`}
            onClick={() => onSelectAgent(agent.agentId)}
          >
            <div>
              <p className="dash-agent-id">{agent.agentId}</p>
              <p className="dash-agent-owner">{agent.ownerAddress}</p>
            </div>
            <div className={`dash-agent-status ${agent.status.toLowerCase()}`}>{agent.status}</div>
          </button>
        ))}
      </div>

      {selectedAgentId ? (
        <div className="dash-agent-detail">
          <h4>Agent detail</h4>
          <p className="pixel-text">latest events</p>
          {selectedEvents.length === 0 ? <p className="dash-empty-inline">No events for selected agent.</p> : null}
          {selectedEvents.map((event) => (
            <p key={event.id} className="dash-detail-line">
              {event.timestamp} {event.eventName}
            </p>
          ))}
          <p className="pixel-text">failure summary</p>
          {selectedFailures.length === 0 ? <p className="dash-empty-inline">No failure entries.</p> : null}
          {selectedFailures.map((item) => (
            <p key={`${item.reason}-${item.lastOccurrence}`} className="dash-detail-line">
              {item.reason} x{item.count}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}
